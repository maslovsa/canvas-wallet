import type { Token } from "../types.ts";
import { renderWidget } from "../widgets/widget-renderer.ts";
import { resolveAction, demoAlertMessage } from "../widgets/action-executor.ts";
import { createLogoBadge } from "./logo-badge.ts";
import { loadIcon } from "../icon/icon-loader.ts";
import type { NetworkInfo } from "../networks/network-registry.ts";

export type ChromeStyle = "ios" | "android";
export type ChromeTheme = "light" | "dark";

export interface PhoneFrameOptions {
  chromeStyle: ChromeStyle;
  chromeTheme: ChromeTheme;
  networkName: string;
  networkInfo: NetworkInfo | undefined;
}

// Synchronous part only — for "image" this is just the overlay/fallback
// color shown before (or instead of, on failure) the async-loaded image.
function initialBackgroundStyle(token: Token): string {
  const bg = token.ui?.background;
  if (!bg) return "";
  if (bg.type === "solid") return `background-color: ${bg.colors[0] ?? "#111"};`;
  if (bg.type === "gradient") {
    const angle = bg.angle ?? 135;
    return `background-image: linear-gradient(${angle}deg, ${bg.colors.join(", ")});`;
  }
  return `background-color: ${bg.overlayColor ?? "#111"};`;
}

// Reuses loadIcon()'s domain-allowlist + size-limited fetch — a background
// image is just another allowlisted asset URL, same trust boundary as a
// token logo or widget icon (see registry.schema.json's backgroundImage).
function applyBackgroundImage(header: HTMLElement, token: Token): void {
  const bg = token.ui?.background;
  if (!bg || bg.type !== "image") return;
  loadIcon(bg.url).then((src) => {
    if (src) {
      header.style.backgroundImage = `url(${CSS.escape(src)})`;
      header.style.backgroundSize = "cover";
      header.style.backgroundPosition = "center";
    }
  });
}

export function renderPhoneFrame(container: HTMLElement, token: Token | undefined, options: PhoneFrameOptions): void {
  container.innerHTML = "";
  container.className = `phone-frame chrome-${options.chromeStyle} theme-${options.chromeTheme}`;

  const screen = document.createElement("div");
  screen.className = "phone-screen";
  container.append(screen);
  container.append(homeIndicator());

  if (!token) {
    const empty = document.createElement("div");
    empty.className = "phone-empty-state";
    empty.textContent = "Select a token to preview its card.";
    screen.append(empty);
    return;
  }

  const notch = document.createElement("div");
  notch.className = "phone-notch";
  screen.append(notch);

  const header = document.createElement("div");
  header.className = "card-header";
  header.setAttribute("style", initialBackgroundStyle(token));
  applyBackgroundImage(header, token);

  const tokenLogo = createLogoBadge(token.logo, token.symbol, "token-logo");
  header.append(tokenLogo);

  if (token.ui?.theme?.badgeText) {
    const badge = document.createElement("div");
    badge.className = "badge-chip";
    badge.textContent = token.ui.theme.badgeText;
    header.append(badge);
  }

  const nameRow = document.createElement("div");
  nameRow.className = "card-header-name";
  nameRow.textContent = `${token.name} (${token.symbol})`;
  header.append(nameRow);
  screen.append(header);

  // Network row — makes it unambiguous which chain this card is on, even
  // when two networks list a token with the same symbol.
  const networkRow = document.createElement("div");
  networkRow.className = "card-network-row";
  const networkLogo = createLogoBadge(options.networkInfo?.logo, options.networkName, "network-logo");
  networkRow.append(networkLogo);
  const networkLabel = document.createElement("span");
  networkLabel.textContent = `${options.networkInfo?.canonicalName ?? options.networkName} network`;
  networkRow.append(networkLabel);
  screen.append(networkRow);

  const body = document.createElement("div");
  body.className = "card-body";
  for (const widget of token.widgets ?? []) {
    const el = renderWidget(widget, token, (actionKey) => {
      const result = resolveAction(actionKey, token, undefined);
      if (result) {
        window.alert(demoAlertMessage(result, token));
      }
    });
    if (el) body.append(el);
  }
  screen.append(body);
}

function homeIndicator(): HTMLElement {
  const indicator = document.createElement("div");
  indicator.className = "phone-home-indicator";
  return indicator;
}
