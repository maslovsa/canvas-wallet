import type { Network, Token } from "../types.ts";
import { renderWidget } from "../widgets/widget-renderer.ts";
import { resolveAction, demoAlertMessage } from "../widgets/action-executor.ts";
import { createLogoBadge } from "./logo-badge.ts";
import { formatAmount } from "../widgets/history.ts";
import { generateBalance } from "./fake-balance.ts";
import { loadIcon } from "../icon/icon-loader.ts";
import { findNetworkInfo, type NetworkInfo } from "../networks/network-registry.ts";
import { countryFlagAssetUrl, countryFlagEmoji } from "../country/country-flag.ts";

export type ChromeStyle = "ios" | "android";
export type ChromeTheme = "light" | "dark";

export interface PhoneFrameOptions {
  chromeStyle: ChromeStyle;
  chromeTheme: ChromeTheme;
  networkName: string;
  networkInfo: NetworkInfo | undefined;
  /** All networks (+ their tokens) in the currently open list — drives the in-phone wallet-home screen. */
  registryNetworks: Network[];
  /** Branding lookup for every network, not just the selected one (for the in-phone network filter's logos). */
  allNetworkInfo: NetworkInfo[];
  /** The current list's own name/description (state.listMeta in main.ts) — headlines the wallet-home screen. */
  listName: string;
  listDescription: string;
  onSelectNetwork: (network: string) => void;
  onSelectToken: (token: Token) => void;
}

// The phone simulates a real two-screen wallet flow: a "list" (network
// filter + token balances) and a "detail" (the single-token card). Which
// screen is showing is purely a chassis/UI concern, deliberately separate
// from AppState.selectedToken in main.ts (which drives the Editor) — so it's
// tracked here at module scope rather than threaded through render calls.
// main.ts calls setPhoneNavScreen() explicitly at the points that should
// change it (network switch -> "list", any explicit token selection ->
// "detail"); a live edit in the Editor re-renders the current token's
// content without changing which screen is showing. The in-phone back
// button is the one transition that's purely local (doesn't touch app
// state), so it mutates `screen` directly and re-renders itself.
let screenMode: "list" | "detail" = "list";

export function setPhoneNavScreen(mode: "list" | "detail"): void {
  screenMode = mode;
}

export function renderPhoneFrame(container: HTMLElement, token: Token | undefined, options: PhoneFrameOptions): void {
  container.innerHTML = "";
  container.className = `phone-frame chrome-${options.chromeStyle} theme-${options.chromeTheme}`;

  const screen = document.createElement("div");
  screen.className = "phone-screen";
  container.append(screen);
  container.append(homeIndicator());

  const notch = document.createElement("div");
  notch.className = "phone-notch";
  screen.append(notch);

  if (screenMode === "detail" && token) {
    renderDetailScreen(screen, token, options, () => {
      screenMode = "list";
      renderPhoneFrame(container, token, options);
    });
  } else {
    renderListScreen(screen, options);
  }
}

function renderListScreen(screen: HTMLElement, options: PhoneFrameOptions): void {
  const header = document.createElement("div");
  header.className = "phone-list-header";

  const title = document.createElement("div");
  title.className = "phone-list-title";
  title.textContent = options.listName;
  header.append(title);

  if (options.listDescription) {
    const desc = document.createElement("div");
    desc.className = "phone-list-desc";
    desc.textContent = options.listDescription;
    header.append(desc);
  }
  screen.append(header);

  const filter = document.createElement("div");
  filter.className = "phone-network-filter";
  for (const net of options.registryNetworks) {
    const chip = document.createElement("button");
    chip.className = "phone-network-chip" + (net.name === options.networkName ? " active" : "");
    const info = findNetworkInfo(options.allNetworkInfo, net.name);
    chip.append(createLogoBadge(info?.logo, net.name, "phone-network-chip-logo"));
    const label = document.createElement("span");
    label.textContent = net.name;
    chip.append(label);
    chip.addEventListener("click", () => options.onSelectNetwork(net.name));
    filter.append(chip);
  }
  screen.append(filter);

  const list = document.createElement("div");
  list.className = "phone-token-list";
  const tokens = options.registryNetworks.find((n) => n.name === options.networkName)?.tokens ?? [];
  if (tokens.length === 0) {
    const empty = document.createElement("div");
    empty.className = "phone-empty-state";
    empty.textContent = "No tokens on this network yet.";
    list.append(empty);
  }
  for (const token of tokens) {
    list.append(renderTokenListRow(token, options.onSelectToken));
  }
  screen.append(list);
}

function renderTokenListRow(token: Token, onSelect: (token: Token) => void): HTMLElement {
  const row = document.createElement("div");
  row.className = "phone-token-row";
  row.append(createLogoBadge(token.logo, token.symbol, "phone-token-row-logo"));

  const info = document.createElement("div");
  info.className = "phone-token-row-info";
  const name = document.createElement("div");
  name.className = "phone-token-row-name";
  name.textContent = token.symbol;
  const sub = document.createElement("div");
  sub.className = "phone-token-row-sub";
  sub.textContent = token.name;
  info.append(name, sub);
  row.append(info);

  const isStablecoin = token.tags?.includes("stablecoin") ?? false;
  const balance = generateBalance(`${token.id}:${token.symbol}`, isStablecoin);
  const balanceEl = document.createElement("div");
  balanceEl.className = "phone-token-row-balance";
  const amountEl = document.createElement("div");
  amountEl.className = "phone-token-row-amount";
  amountEl.textContent = `${formatAmount(balance.amount)} ${token.symbol}`;
  const usdEl = document.createElement("div");
  usdEl.className = "phone-token-row-usd";
  usdEl.textContent = `$${balance.usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  balanceEl.append(amountEl, usdEl);
  row.append(balanceEl);

  row.addEventListener("click", () => onSelect(token));
  return row;
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
function applyBackgroundImage(header: HTMLElement, token: Token, chromeTheme: ChromeTheme): void {
  const bg = token.ui?.background;
  if (!bg || bg.type !== "image") return;
  loadIcon(bg.url).then((src) => {
    if (src) {
      // Light theme washes out just the token's own background picture (a
      // 50%-white overlay stacked on the same background-image layer) —
      // not the phone chassis around it, and not the card's text/logo,
      // which live outside this element's background layer entirely.
      const wash = chromeTheme === "light" ? "linear-gradient(rgba(255,255,255,0.5), rgba(255,255,255,0.5)), " : "";
      header.style.backgroundImage = `${wash}url(${CSS.escape(src)})`;
      header.style.backgroundSize = "cover";
      header.style.backgroundPosition = "center";
    }
  });
}

function renderDetailScreen(screen: HTMLElement, token: Token, options: PhoneFrameOptions, onBack: () => void): void {
  const header = document.createElement("div");
  header.className = "card-header";
  header.setAttribute("style", initialBackgroundStyle(token));
  applyBackgroundImage(header, token, options.chromeTheme);

  const topRow = document.createElement("div");
  topRow.className = "card-header-top";
  const backBtn = document.createElement("button");
  backBtn.className = "card-back-btn";
  backBtn.setAttribute("aria-label", "Back to wallet");
  backBtn.textContent = "←";
  backBtn.addEventListener("click", onBack);
  topRow.append(backBtn);

  if (token.ui?.theme?.badgeText) {
    const badge = document.createElement("div");
    badge.className = "badge-chip";
    badge.textContent = token.ui.theme.badgeText;
    topRow.append(badge);
  }
  header.append(topRow);

  const bottomRow = document.createElement("div");
  bottomRow.className = "card-header-bottom";
  const tokenLogo = createLogoBadge(token.logo, token.symbol, "token-logo");
  bottomRow.append(tokenLogo);

  const infoStack = document.createElement("div");
  infoStack.className = "card-header-info";

  const nameRow = document.createElement("div");
  nameRow.className = "card-header-name";
  nameRow.textContent = `${token.name} (${token.symbol})`;
  infoStack.append(nameRow);

  // Meta row: which chain this card is on (makes it unambiguous when two
  // networks list a token with the same symbol) and the issuer, side by
  // side in the header itself rather than as a separate row below it.
  const metaRow = document.createElement("div");
  metaRow.className = "card-header-meta";

  const networkChip = document.createElement("span");
  networkChip.className = "card-header-meta-item";
  networkChip.append(createLogoBadge(options.networkInfo?.logo, options.networkName, "network-logo"));
  const networkLabel = document.createElement("span");
  networkLabel.textContent = options.networkInfo?.canonicalName ?? options.networkName;
  networkChip.append(networkLabel);
  metaRow.append(networkChip);

  if (token.issuer) {
    const issuerChip = document.createElement("span");
    issuerChip.className = "card-header-meta-item";
    const assetUrl = countryFlagAssetUrl(token.issuer.country);
    if (assetUrl) {
      const flagImg = document.createElement("img");
      flagImg.className = "card-issuer-flag card-issuer-flag-svg";
      flagImg.src = assetUrl;
      flagImg.alt = token.issuer.country ?? "";
      issuerChip.append(flagImg);
    } else {
      const flag = document.createElement("span");
      flag.className = "card-issuer-flag";
      flag.textContent = countryFlagEmoji(token.issuer.country);
      issuerChip.append(flag);
    }
    if (token.issuer.name) {
      const issuerName = document.createElement("span");
      issuerName.textContent = token.issuer.name;
      issuerChip.append(issuerName);
    }
    metaRow.append(issuerChip);
  }

  infoStack.append(metaRow);
  bottomRow.append(infoStack);
  header.append(bottomRow);
  screen.append(header);

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
