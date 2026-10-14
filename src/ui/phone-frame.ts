import type { Network, Token } from "../types.ts";
import { renderWidget } from "../widgets/widget-renderer.ts";
import { resolveAction, demoAlertMessage } from "../widgets/action-executor.ts";
import { createLogoBadge } from "./logo-badge.ts";
import { formatAmount } from "../widgets/history.ts";
import { generateBalance } from "./fake-balance.ts";
import { loadIcon } from "../icon/icon-loader.ts";
import { findNetworkInfo, type NetworkInfo } from "../networks/network-registry.ts";
import { countryFlagAssetUrl, countryFlagEmoji } from "../country/country-flag.ts";
import { prepareSend } from "../send/send-token.ts";
import { getSendController, resetSendSession, setPendingDestination, takePendingDestination } from "../send/send-session.ts";
import { mountSendScreen, unmountSendScreen } from "./send-screen.ts";
import { openOverlay } from "./phone-overlay.ts";
import { icon } from "./icons.ts";
import { makeActivatable } from "./a11y.ts";
import { openReceiveDialog } from "./receive-dialog.ts";
import { loadReceiveAddresses, receiveAddressFor, REFUSAL_NO_RECEIVE_ADDRESS } from "../receive/receive-address.ts";

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
  /** Called after every render, so the caller can mirror the phone's screen (list / token) into the URL. */
  onScreenChange?: () => void;
  /** Phone mode only: a small "‹ label" control above the list title that leaves the phone view (e.g. back to the gallery). */
  onExit?: { label: string; run: () => void };
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
let screenMode: "list" | "detail" | "send" = "list";

export function getPhoneNavScreen(): "list" | "detail" | "send" {
  return screenMode;
}

/** Opens the Send screen for the current token with `address` already in the To field (the ?to= demo link). */
export function openSendWithDestination(address: string): void {
  setPendingDestination(address);
  screenMode = "send";
}

export function setPhoneNavScreen(mode: "list" | "detail"): void {
  screenMode = mode;
  resetSendSession(); // main.ts only ever moves to list/detail; leaving Send always starts the next one fresh
}

/** Material press feedback: a circle grows from the touch point on buttons and rows (Android look only). */
const rippleBound = new WeakSet<HTMLElement>();
function spawnRipple(event: PointerEvent): void {
  const frame = event.currentTarget as HTMLElement;
  if (!frame.classList.contains("chrome-android")) return;
  const target = (event.target as HTMLElement).closest<HTMLElement>("button, [role=button]");
  if (!target || (target instanceof HTMLButtonElement && target.disabled)) return;
  const rect = target.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height) * 2;
  const wave = document.createElement("span");
  wave.className = "ripple";
  wave.style.width = wave.style.height = `${size}px`;
  wave.style.left = `${event.clientX - rect.left - size / 2}px`;
  wave.style.top = `${event.clientY - rect.top - size / 2}px`;
  target.append(wave);
  wave.addEventListener("animationend", () => wave.remove(), { once: true });
}

const MODE_ORDER = { list: 0, detail: 1, send: 2 } as const;
let lastRenderedMode: keyof typeof MODE_ORDER | null = null;

export function renderPhoneFrame(container: HTMLElement, token: Token | undefined, options: PhoneFrameOptions): void {
  unmountSendScreen(); // drop the live Send subscription/dialog before the DOM is wiped; the session itself survives
  // Moving to another screen slides the new one in (forward = deeper, back = shallower); re-rendering the SAME screen
  // (a live edit in the editor) neither animates nor loses the scroll position.
  const previousScroll = container.querySelector<HTMLElement>(".phone-screen")?.scrollTop ?? 0;
  const direction = lastRenderedMode === null || lastRenderedMode === screenMode ? null : MODE_ORDER[screenMode] > MODE_ORDER[lastRenderedMode] ? "forward" : "back";
  lastRenderedMode = screenMode;
  container.innerHTML = "";
  container.className = `phone-frame chrome-${options.chromeStyle} theme-${options.chromeTheme}`;
  if (options.chromeStyle === "android" && !rippleBound.has(container)) {
    rippleBound.add(container);
    container.addEventListener("pointerdown", spawnRipple);
  }

  const screen = document.createElement("div");
  screen.className = "phone-screen" + (direction ? ` enter-${direction}` : "");
  container.append(screen);
  container.append(homeIndicator());
  // A decorative overlay on the chassis itself (like .phone-home-indicator
  // below), not inside the scrollable .phone-screen — a physical notch
  // doesn't scroll or reserve layout space, it just sits on top of
  // whatever content is under it, letting a full-bleed header background
  // extend all the way to the true top of the screen.
  container.append(notchElement());

  if (screenMode === "send" && token) {
    // The session lives in send-session.ts (module scope); this only rebuilds the DOM from it.
    prepareSend(token, options.networkInfo?.canonicalName).then((prepared) => {
      if (screenMode !== "send" || !container.isConnected) return;
      if (!prepared.ok) {
        takePendingDestination(); // a link's destination is dropped when this token cannot be sent
        screenMode = "detail"; // the token cannot be sent (e.g. edited in the editor while on this screen)
        renderPhoneFrame(container, token, options);
        return;
      }
      const controller = getSendController(prepared.info);
      const destination = takePendingDestination();
      if (destination) {
        void controller.setAddress(destination); // validated and risk-checked exactly like typing
        options.onScreenChange?.(); // the session now exists: let the URL follow the field
      }
      const leave = () => {
        screenMode = "detail";
        resetSendSession();
        renderPhoneFrame(container, token, options);
      };
      mountSendScreen({
        frame: container,
        screen,
        chromeStyle: options.chromeStyle,
        controller,
        networkLabel: options.networkInfo?.canonicalName ?? options.networkName,
        onBack: leave,
        onDone: leave,
      });
    });
  } else if (screenMode === "detail" && token) {
    // Explicit in-phone notice instead of a browser alert() that would open outside the phone (DR12).
    const showNotice = (message: string): void => {
      const notice = openOverlay({
        frame: container,
        screen,
        chromeStyle: options.chromeStyle,
        tone: "info",
        title: message,
        buttons: [{ label: "OK", primary: true, onClick: () => notice.close() }],
        onDismiss: () => notice.close(),
      });
    };
    const doSend = async (): Promise<void> => {
      const prepared = await prepareSend(token, options.networkInfo?.canonicalName);
      if (!prepared.ok) {
        showNotice(prepared.message);
        return;
      }
      screenMode = "send";
      renderPhoneFrame(container, token, options);
    };
    const doReceive = async (): Promise<void> => {
      const networkName = options.networkInfo?.canonicalName;
      const address = receiveAddressFor(await loadReceiveAddresses(), networkName);
      if (!address || !networkName) {
        showNotice(REFUSAL_NO_RECEIVE_ADDRESS);
        return;
      }
      openReceiveDialog({ frame: container, screen, chromeStyle: options.chromeStyle, token, networkName, address });
    };
    renderDetailScreen(
      screen,
      token,
      options,
      () => {
        screenMode = "list";
        renderPhoneFrame(container, token, options);
      },
      doSend,
      doReceive,
    );
    if (pendingAction) {
      // Arrived from a wallet-home shortcut: start the action it asked for once the card is up.
      const action = pendingAction;
      pendingAction = null;
      void (action === "send" ? doSend() : doReceive());
    }
  } else {
    renderListScreen(container, screen, options);
  }
  if (!direction && previousScroll > 0) screen.scrollTop = previousScroll;
  options.onScreenChange?.();
}

/** Collapses a bar into its compact, blurred state once the screen has scrolled past `threshold()` px. */
function bindBarCollapse(screen: HTMLElement, bar: HTMLElement, threshold: () => number): void {
  let collapsed = false;
  screen.addEventListener(
    "scroll",
    () => {
      const next = screen.scrollTop > threshold();
      if (next === collapsed) return;
      collapsed = next;
      bar.classList.toggle("is-scrolled", next);
    },
    { passive: true },
  );
}

type WalletAction = "send" | "receive";

function tokensWithAction(tokens: readonly Token[], action: WalletAction): Token[] {
  return tokens.filter((t) => Object.values(t.actions ?? {}).some((a) => a.type === action));
}

/** What a wallet-home action asks for next: after the picked token's card opens, this action starts. */
let pendingAction: WalletAction | null = null;

function renderListScreen(container: HTMLElement, screen: HTMLElement, options: PhoneFrameOptions): void {
  // A sticky bar: the way out on the left, and the list's name which fades in (on a blurred bar) once the large title scrolls away.
  const bar = document.createElement("div");
  bar.className = "phone-list-bar";
  if (options.onExit) {
    const exit = document.createElement("button");
    exit.type = "button";
    exit.className = "phone-list-exit";
    exit.setAttribute("aria-label", options.onExit.label);
    const exitLabel = document.createElement("span");
    exitLabel.className = "exit-label";
    exitLabel.textContent = options.onExit.label;
    exit.append(icon("chevron-left", { size: 18, strokeWidth: 2.25, className: "exit-chevron" }), exitLabel, icon("arrow-left", { size: 24, strokeWidth: 2, className: "back-arrow" }));
    exit.addEventListener("click", options.onExit.run);
    bar.append(exit);
  } else {
    bar.append(document.createElement("span"));
  }
  const barTitle = document.createElement("div");
  barTitle.className = "phone-list-bar-title";
  barTitle.textContent = options.listName;
  bar.append(barTitle, document.createElement("span"));
  screen.append(bar);

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
  bindBarCollapse(screen, bar, () => title.offsetTop + title.offsetHeight - bar.offsetHeight);

  const networkTokens = options.registryNetworks.find((n) => n.name === options.networkName)?.tokens ?? [];
  screen.append(renderWalletHero(container, screen, options, networkTokens));

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

/** Total balance (illustrative, like every amount here) and Send / Receive shortcuts that ask which token. */
function renderWalletHero(container: HTMLElement, screen: HTMLElement, options: PhoneFrameOptions, tokens: readonly Token[]): HTMLElement {
  const hero = document.createElement("section");
  hero.className = "wallet-hero";

  const total = tokens.reduce((sum, t) => sum + generateBalance(`${t.id}:${t.symbol}`, t.tags?.includes("stablecoin") ?? false).usd, 0);
  const [dollars = "0", cents = "00"] = total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).split(".");
  const label = document.createElement("div");
  label.className = "wallet-hero-label";
  label.textContent = `Total balance on ${options.networkInfo?.canonicalName ?? options.networkName}`;
  const amount = document.createElement("div");
  amount.className = "wallet-hero-amount";
  amount.append(document.createTextNode(`$${dollars}`));
  const centsEl = document.createElement("span");
  centsEl.className = "wallet-hero-cents";
  centsEl.textContent = `.${cents}`;
  amount.append(centsEl);
  const note = document.createElement("div");
  note.className = "wallet-hero-note";
  note.textContent = `${tokens.length} asset${tokens.length === 1 ? "" : "s"} · illustrative amounts`;
  hero.append(label, amount, note);

  const actions = document.createElement("div");
  actions.className = "wallet-hero-actions";
  for (const [action, text, iconName] of [["send", "Send", "arrow-up-right"], ["receive", "Receive", "arrow-down-left"]] as const) {
    const eligible = tokensWithAction(tokens, action);
    if (eligible.length === 0) continue;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "wallet-action";
    const disc = document.createElement("span");
    disc.className = "wallet-action-disc";
    disc.append(icon(iconName, { size: 22, strokeWidth: 2 }));
    const caption = document.createElement("span");
    caption.textContent = text;
    button.append(disc, caption);
    button.addEventListener("click", () => pickTokenFor(container, screen, options, action, eligible, text));
    actions.append(button);
  }
  if (actions.childElementCount > 0) hero.append(actions);
  return hero;
}

function pickTokenFor(container: HTMLElement, screen: HTMLElement, options: PhoneFrameOptions, action: WalletAction, eligible: readonly Token[], title: string): void {
  if (eligible.length === 1) {
    pendingAction = action;
    options.onSelectToken(eligible[0]!);
    return;
  }
  const list = document.createElement("div");
  list.className = "pick-list";
  const sheet = openOverlay({
    frame: container,
    screen,
    chromeStyle: options.chromeStyle,
    tone: "info",
    title,
    body: "Choose an asset",
    content: list,
    buttons: [{ label: "Cancel", primary: true, onClick: () => sheet.close() }],
    onDismiss: () => sheet.close(),
  });
  for (const token of eligible) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "pick-row";
    row.append(createLogoBadge(token.logo, token.symbol, "pick-row-logo"));
    const text = document.createElement("span");
    text.className = "pick-row-text";
    const symbol = document.createElement("strong");
    symbol.textContent = token.symbol;
    const name = document.createElement("span");
    name.textContent = token.name;
    text.append(symbol, name);
    row.append(text);
    row.addEventListener("click", () => {
      sheet.close();
      pendingAction = action;
      options.onSelectToken(token);
    });
    list.append(row);
  }
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

  makeActivatable(row, () => onSelect(token));
  return row;
}

// The header's visual (solid color / gradient / photo) always lives on its
// own layer (.card-header-bg), separate from the header element itself, so
// a real `opacity` reduction in light theme only fades that visual — not
// the nav bar/logo/name stacked on top of it (fading .card-header directly
// would fade those too). The header's own base color becomes white in
// light theme so the reduced-opacity layer reveals white underneath,
// lightening the visual instead of darkening it — applied uniformly to
// every background type, not just photos, so a solid/gradient token card
// adapts to light theme exactly the same way an image-backed one does.
function applyHeaderBackground(header: HTMLElement, token: Token, chromeTheme: ChromeTheme): void {
  const bg = token.ui?.background;
  const bgLayer = document.createElement("div");
  bgLayer.className = "card-header-bg";
  header.prepend(bgLayer);

  if (bg?.type === "solid") {
    bgLayer.style.backgroundColor = bg.colors[0] ?? "#111";
  } else if (bg?.type === "gradient") {
    const angle = bg.angle ?? 135;
    bgLayer.style.backgroundImage = `linear-gradient(${angle}deg, ${bg.colors.join(", ")})`;
  } else if (bg?.type === "image") {
    // Reuses loadIcon()'s domain-allowlist + size-limited fetch — a
    // background image is just another allowlisted asset URL, same trust
    // boundary as a token logo or widget icon (see registry.schema.json's
    // backgroundImage).
    bgLayer.style.backgroundColor = bg.overlayColor ?? "#111";
    loadIcon(bg.url).then((src) => {
      if (src) bgLayer.style.backgroundImage = `url(${CSS.escape(src)})`;
    });
  } else {
    bgLayer.style.backgroundColor = "#111";
  }

  if (chromeTheme === "light") {
    header.style.backgroundColor = "#fff";
    bgLayer.style.opacity = "0.94"; // a hair lighter on a light screen; the art stays rich so the white title keeps its contrast
  }
}

function renderDetailScreen(
  screen: HTMLElement,
  token: Token,
  options: PhoneFrameOptions,
  onBack: () => void,
  onSend: () => void,
  onReceive: () => void,
): void {
  const header = document.createElement("div");
  header.className = "card-header";
  applyHeaderBackground(header, token, options.chromeTheme);

  // A sticky nav bar (back, compact title, badge) laid over the top of the header art (negative bottom margin).
  // Over the art it is transparent with white controls; once the card scrolls past the art it turns into a blurred
  // bar with the token's symbol as its title.
  const navBar = document.createElement("div");
  navBar.className = "card-nav-bar";

  const backBtn = document.createElement("button");
  backBtn.className = "card-back-btn";
  backBtn.setAttribute("aria-label", "Back to wallet");
  const chevron = document.createElement("span");
  chevron.className = "card-back-chevron";
  chevron.textContent = "‹";
  const label = document.createElement("span");
  label.className = "card-back-label";
  label.textContent = "Back";
  const arrow = icon("arrow-left", { size: 24, strokeWidth: 2, className: "back-arrow" }); // Android shows this instead
  backBtn.append(chevron, label, arrow);
  backBtn.addEventListener("click", onBack);
  navBar.append(backBtn);
  const navTitle = document.createElement("div");
  navTitle.className = "card-nav-title";
  navTitle.textContent = token.symbol;
  navBar.append(navTitle);

  if (token.ui?.theme?.badgeText) {
    const badge = document.createElement("div");
    badge.className = "badge-chip";
    badge.textContent = token.ui.theme.badgeText;
    navBar.append(badge);
  }
  screen.append(navBar);

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
  bindBarCollapse(screen, navBar, () => header.offsetHeight - navBar.offsetHeight - 8);

  const body = document.createElement("div");
  body.className = "card-body";
  for (const widget of token.widgets ?? []) {
    const el = renderWidget(widget, token, (actionKey) => {
      const result = resolveAction(actionKey, token, undefined);
      if (!result) return;
      if (result.type === "send") {
        onSend();
        return;
      }
      if (result.type === "receive") {
        onReceive();
        return;
      }
      window.alert(demoAlertMessage(result, token));
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

function notchElement(): HTMLElement {
  const notch = document.createElement("div");
  notch.className = "phone-notch";
  return notch;
}
