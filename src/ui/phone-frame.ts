import type { Token } from "../types.ts";
import { renderWidget } from "../widgets/widget-renderer.ts";
import { resolveAction, demoAlertMessage } from "../widgets/action-executor.ts";

export type ChromeStyle = "ios" | "android";
export type ChromeTheme = "light" | "dark";

export interface PhoneFrameOptions {
  chromeStyle: ChromeStyle;
  chromeTheme: ChromeTheme;
}

function backgroundStyle(token: Token): string {
  const bg = token.ui?.background;
  if (!bg) return "";
  if (bg.type === "solid") return `background-color: ${bg.colors[0] ?? "#111"};`;
  const angle = bg.angle ?? 135;
  return `background-image: linear-gradient(${angle}deg, ${bg.colors.join(", ")});`;
}

export function renderPhoneFrame(container: HTMLElement, token: Token | undefined, options: PhoneFrameOptions): void {
  container.innerHTML = "";
  container.className = `phone-frame chrome-${options.chromeStyle} theme-${options.chromeTheme}`;

  if (!token) {
    const empty = document.createElement("div");
    empty.className = "phone-empty-state";
    empty.textContent = "Select a token to preview its card.";
    container.append(empty);
    return;
  }

  const notch = document.createElement("div");
  notch.className = "phone-notch";
  container.append(notch);

  const header = document.createElement("div");
  header.className = "card-header";
  header.setAttribute("style", backgroundStyle(token));

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
  container.append(header);

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
  container.append(body);
}
