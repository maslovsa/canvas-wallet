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

  const infoStack = document.createElement("div");
  infoStack.className = "card-header-info";

  const nameRow = document.createElement("div");
  nameRow.className = "card-header-name";
  nameRow.textContent = `${token.name} (${token.symbol})`;
  infoStack.append(nameRow);

  if (token.issuer) {
    const issuerRow = document.createElement("div");
    issuerRow.className = "card-issuer-row";
    const flag = document.createElement("span");
    flag.className = "card-issuer-flag";
    flag.textContent = countryFlagOrGlobe(token.issuer.country);
    issuerRow.append(flag);
    if (token.issuer.name) {
      const issuerName = document.createElement("span");
      issuerName.textContent = token.issuer.name;
      issuerRow.append(issuerName);
    }
    infoStack.append(issuerRow);
  }

  header.append(infoStack);
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

const GLOBE = "\u{1F310}"; // shown when the issuer has no single jurisdiction — never guessed.

// A 2-letter ISO 3166-1 country code maps directly to its flag emoji via the
// Unicode regional-indicator-symbol trick (each letter -> U+1F1E6..U+1F1FF).
function countryFlagOrGlobe(country: string | undefined): string {
  if (!country || country.length !== 2) return GLOBE;
  const codePoints = [...country.toUpperCase()].map((c) => 0x1f1e6 + (c.charCodeAt(0) - 65));
  if (codePoints.some((cp) => cp < 0x1f1e6 || cp > 0x1f1ff)) return GLOBE;
  return String.fromCodePoint(...codePoints);
}

function homeIndicator(): HTMLElement {
  const indicator = document.createElement("div");
  indicator.className = "phone-home-indicator";
  return indicator;
}
