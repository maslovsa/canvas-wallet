import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import type { Registry, Token, RegistrySource, ListMeta } from "./types.ts";
import { fetchRegistry } from "./registry-client/fetcher.ts";
import { RegistryClientError, userMessageFor } from "./registry-client/errors.ts";
import { StaleFetchGuard } from "./registry-client/stale-fetch-guard.ts";
import { checkGovernance, governanceWarning } from "./registry-client/governance-check.ts";
import { loadManifest } from "./registry-client/manifest.ts";
import { renderSidebar } from "./ui/sidebar.ts";
import { getSendAddress, hasSendSession } from "./send/send-session.ts";
import { renderPhoneFrame, setPhoneNavScreen, getPhoneNavScreen, openSendWithDestination, type ChromeStyle, type ChromeTheme, type PhoneFrameOptions } from "./ui/phone-frame.ts";
import { renderGalleryCards, type GalleryEntry } from "./ui/gallery.ts";
import { Editor } from "./ui/editor.ts";
import { buildDeployPlan } from "./deploy-flow/build-deploy-url.ts";
import { encodeSharePayload } from "./share-link/encode.ts";
import { decodeShareFragment, ShareLinkDecodeError } from "./share-link/decode.ts";
import { parseStudioQuery, buildStudioQuery, findByName, type StudioUrlState } from "./share-link/studio-url.ts";
import { parseRegistry, RegistryParseError, RegistrySchemaError } from "./schema-validator.ts";
import { loadNetworkRegistry, findNetworkInfo, type NetworkInfo } from "./networks/network-registry.ts";
import { icon, iconButton } from "./ui/icons.ts";
import { showToast } from "./ui/toast.ts";
import { attachMenu } from "./ui/menu.ts";
import { copyText } from "./receive/copy-text.ts";
import { readStudioTheme, nextStudioTheme, applyStudioTheme, THEME_LABEL, THEME_ICON, type StudioTheme } from "./ui/studio-theme.ts";
import { resolvePhoneMode, detectChromeStyle, withViewParam, type PhoneModeResolution } from "./share-link/phone-mode.ts";

type ViewMode = "gallery" | "studio";

interface AppState {
  view: ViewMode;
  galleryEntries: GalleryEntry[];
  networks: NetworkInfo[];
  source: RegistrySource | undefined;
  listMeta: ListMeta | undefined; // undefined for uploaded/github sources — they have no manifest entry.
  registry: Registry | null;
  selectedNetwork: string;
  selectedToken: Token | undefined;
  chromeStyle: ChromeStyle;
  chromeTheme: ChromeTheme;
  isPreviewOnly: boolean; // true when the current token came from a share-link, not a real list.
}

const state: AppState = {
  view: "gallery",
  galleryEntries: [],
  networks: [],
  source: undefined,
  listMeta: undefined,
  registry: null,
  selectedNetwork: "",
  selectedToken: undefined,
  chromeStyle: "ios",
  chromeTheme: "dark",
  isPreviewOnly: false,
};

const staleFetchGuard = new StaleFetchGuard();

// Phone mode (see share-link/phone-mode.ts): the link opens as the bare phone interface on a phone.
function measureDevice(): { width: number; coarsePointer: boolean } {
  return { width: window.innerWidth, coarsePointer: window.matchMedia("(pointer: coarse)").matches };
}
let phone: PhoneModeResolution = resolvePhoneMode(location.search, measureDevice());

function applyPhoneMode(): void {
  const root = document.documentElement;
  root.dataset.mode = phone.phoneMode ? "phone" : "studio";
  root.dataset.fullscreen = String(phone.fullscreen);
  root.dataset.view = state.view;
}

/** Leaves the bare phone view on a desktop: back to the full studio for the same list. */
function switchToStudio(): void {
  const next = new URL(location.href);
  next.searchParams.set("view", "studio");
  history.replaceState(null, "", `${next.pathname}${next.search}${next.hash}`);
  phone = resolvePhoneMode(location.search, measureDevice());
  applyPhoneMode();
  renderAll();
}

/** Scales the 480 x 996 device so it always fits the space the stage has (the whole phone, never cropped). */
function fitPhone(): void {
  const stage = document.getElementById("phone-stage");
  const frame = document.getElementById("phone-frame");
  if (!stage || !frame) return;
  if (phone.fullscreen) {
    frame.style.removeProperty("--phone-zoom");
    return;
  }
  const availableHeight = stage.clientHeight;
  const availableWidth = stage.clientWidth;
  if (availableHeight === 0 || availableWidth === 0) return;
  frame.style.setProperty("--phone-zoom", String(Math.max(0.35, Math.min(1, availableHeight / 996, availableWidth / 480))));
}

function el(id: string): HTMLElement {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing #${id} in index.html`);
  return found;
}

function setView(view: ViewMode): void {
  state.view = view;
  el("gallery-view").hidden = view !== "gallery";
  el("studio-view").hidden = view !== "studio";
  applyPhoneMode();
  syncUrl();
}

/**
 * Mirrors the open list, the network filter and (when an asset card is open in the phone) the asset into the
 * query string, so any view can be shared as a link. Only bundled lists are shareable this way: an uploaded
 * file or a share-link preview has no public address. Unrelated query parameters are left alone.
 */
function syncUrl(): void {
  const next: StudioUrlState = {};
  if (state.view === "studio" && state.source?.kind === "bundled" && !state.isPreviewOnly) {
    next.list = state.source.listId;
    if (state.selectedNetwork) next.network = state.selectedNetwork;
    if (getPhoneNavScreen() !== "list" && state.selectedToken) next.token = state.selectedToken.symbol;
    if (getPhoneNavScreen() === "send") {
      // Until the session exists the link's own recipient stays in the address; afterwards the field is the truth.
      const to = hasSendSession() ? getSendAddress() : parseStudioQuery(location.search).to;
      if (to) next.to = to;
    }
  }
  const search = buildStudioQuery(location.search, next);
  if (search !== location.search) history.replaceState(null, "", `${location.pathname}${search}${location.hash}`);
}

// ---------------------------------------------------------------------------
// Gallery (main page): pick a bundled list, or upload your own.
// ---------------------------------------------------------------------------

async function loadGallery(): Promise<void> {
  const manifest = await loadManifest();
  const entries: GalleryEntry[] = await Promise.all(
    manifest.map(async (meta) => {
      try {
        const { registry } = await fetchRegistry({ kind: "bundled", listId: meta.id });
        return { meta, registry };
      } catch {
        return { meta, registry: undefined };
      }
    }),
  );
  state.galleryEntries = entries;
  renderGalleryCards(el("gallery-cards"), entries, (meta) => openBundledList(meta), state.networks);
}

async function openBundledList(meta: ListMeta): Promise<void> {
  await loadSource({ kind: "bundled", listId: meta.id }, meta);
}

function handleUploadFile(file: File): void {
  const reader = new FileReader();
  reader.onload = () => {
    const text = reader.result as string;
    try {
      const registry = parseRegistry(text);
      state.source = { kind: "uploaded", filename: file.name };
      state.listMeta = { id: "uploaded", name: file.name, description: "Uploaded locally — not saved anywhere but your machine.", file: file.name };
      state.registry = registry;
      state.selectedNetwork = registry.networks[0]?.name ?? "";
      state.selectedToken = registry.networks[0]?.tokens[0];
      state.isPreviewOnly = false;
      el("status-banner").textContent = "";
      if (state.selectedToken) editor.loadToken(state.selectedToken);
      else editor.clear();
      setPhoneNavScreen("list");
      setView("studio");
      renderAll();
    } catch (err) {
      const message =
        err instanceof RegistryParseError
          ? err.message
          : err instanceof RegistrySchemaError
            ? `This file doesn't match the registry schema: ${err.issues.join("; ")}`
            : "Couldn't read this file.";
      window.alert(message);
    }
  };
  reader.onerror = () => window.alert("Couldn't read this file.");
  reader.readAsText(file);
}

// ---------------------------------------------------------------------------
// Studio (per-list view): sidebar + live simulator + editor.
// ---------------------------------------------------------------------------

/** Falls back sensibly for sources with no manifest entry (uploaded already sets one; github/share-link don't). */
function listDisplayName(): string {
  if (state.listMeta?.name) return state.listMeta.name;
  if (state.source?.kind === "github") return `${state.source.owner}/${state.source.repo}`;
  return "My Wallet";
}

function phoneOptions(): PhoneFrameOptions {
  const options: PhoneFrameOptions = {
    chromeStyle: state.chromeStyle,
    chromeTheme: state.chromeTheme,
    networkName: state.selectedNetwork,
    networkInfo: findNetworkInfo(state.networks, state.selectedNetwork),
    registryNetworks: state.registry?.networks ?? [],
    allNetworkInfo: state.networks,
    listName: listDisplayName(),
    onSelectNetwork: (network) => selectNetwork(network),
    onSelectToken: (token) => selectToken(token, { confirmDiscard: true }),
    onScreenChange: syncUrl,
  };
  if (phone.phoneMode) {
    // In phone mode there is no toolbar, so the list screen carries the way out: back to the gallery on a phone,
    // back to the studio when a desktop opened the bare phone view.
    options.onExit = phone.fullscreen
      ? { label: "Lists", run: () => setView("gallery") }
      : { label: "Studio", run: () => switchToStudio() };
  }
  return options;
}

function renderAll(): void {
  if (!state.registry) return;

  renderSidebar(el("sidebar"), state.registry, state.networks, state.selectedNetwork, state.selectedToken?.symbol, {
    onSelectNetwork: (network) => selectNetwork(network),
    onSelectToken: (token) => selectToken(token, { confirmDiscard: true }),
    onAddToken: () => selectToken(blankToken(), { confirmDiscard: true }),
  });

  renderPhoneFrame(el("phone-frame"), state.selectedToken, phoneOptions());
  fitPhone();
  syncDock();

  renderRegistrySourceBanner();
}

function renderRegistrySourceBanner(): void {
  const banner = el("registry-source-banner");
  banner.innerHTML = "";

  if (state.isPreviewOnly) {
    banner.className = "registry-source-banner preview-only";
    banner.textContent = "PREVIEW ONLY — opened from a share link, not from a verified registry.";
    return;
  }
  if (!state.source) return;
  if (state.source.kind === "bundled") {
    banner.className = "registry-source-banner";
    banner.textContent = state.listMeta?.name ?? state.source.listId;
    return;
  }
  if (state.source.kind === "uploaded") {
    banner.className = "registry-source-banner viewing-remote";
    banner.textContent = `Uploaded: ${state.source.filename}`;
    return;
  }
  banner.className = "registry-source-banner viewing-remote";
  banner.textContent = `Viewing: ${state.source.owner}/${state.source.repo}`;
}

// ---------------------------------------------------------------------------
// Device dock: platform + appearance toggles, Share menu and Deploy, in one panel under the phone.
// ---------------------------------------------------------------------------

function segmented<T extends string>(
  label: string,
  options: ReadonlyArray<{ value: T; text?: string; iconName?: Parameters<typeof icon>[0]; label: string; id: string }>,
  onPick: (value: T) => void,
): HTMLElement {
  const group = document.createElement("div");
  group.className = "segmented";
  group.setAttribute("role", "radiogroup");
  group.setAttribute("aria-label", label);
  for (const option of options) {
    const button = document.createElement("button");
    button.type = "button";
    button.id = option.id;
    button.className = "segmented-btn";
    button.dataset.value = option.value;
    button.setAttribute("role", "radio");
    button.setAttribute("aria-label", option.label);
    button.title = option.label;
    if (option.iconName) button.append(icon(option.iconName, { size: 15 }));
    if (option.text) button.append(document.createTextNode(option.text));
    button.addEventListener("click", () => onPick(option.value));
    group.append(button);
  }
  return group;
}

function buildDock(): void {
  const dock = el("device-dock");
  dock.textContent = "";
  dock.append(
    segmented<ChromeStyle>(
      "Platform",
      [
        { value: "ios", text: "iOS", label: "iOS", id: "chrome-style-ios" },
        { value: "android", text: "Android", label: "Android", id: "chrome-style-android" },
      ],
      (value) => {
        state.chromeStyle = value;
        renderAll();
      },
    ),
    segmented<ChromeTheme>(
      "Appearance",
      [
        { value: "light", iconName: "sun", label: "Light", id: "chrome-theme-light" },
        { value: "dark", iconName: "moon", label: "Dark", id: "chrome-theme-dark" },
      ],
      (value) => {
        state.chromeTheme = value;
        renderAll();
      },
    ),
  );

  const sep = document.createElement("span");
  sep.className = "dock-sep";
  dock.append(sep);

  const share = iconButton("share", "Share", { size: 17 });
  share.id = "share-menu-btn";
  dock.append(share);
  attachMenu(share, () => {
    const shareable = state.source?.kind === "bundled" && !state.isPreviewOnly;
    const hint = shareable ? undefined : "Only bundled lists have a public link";
    return [
      { label: "Copy link", ...(hint ? { hint } : { hint: "This list, network and token" }), icon: "link", disabled: !shareable, onSelect: () => void copyLink(undefined) },
      { label: "Copy phone link", hint: hint ?? "Opens as the phone interface, no studio panels", icon: "smartphone", disabled: !shareable, onSelect: () => void copyLink("phone") },
      { label: "Open phone view", hint: hint ?? "In a new tab", icon: "external-link", disabled: !shareable, onSelect: () => window.open(currentLink("phone"), "_blank", "noopener") },
      { label: "Copy token preview link", hint: "Self-contained: works for any token", icon: "copy", onSelect: () => void runShareFlow() },
    ];
  });

  const deploy = iconButton("git-pull-request", "Deploy / Propose Token Card via GitHub", { size: 17 });
  deploy.id = "deploy-btn";
  deploy.addEventListener("click", () => void runDeployFlow(deploy));
  dock.append(deploy);
  syncDock();
}

// ---------------------------------------------------------------------------
// Studio theme toggle (system / light / dark): one button in the gallery corner, one in the studio top bar.
// ---------------------------------------------------------------------------

let studioTheme: StudioTheme = "auto";

function themeButtonContent(): { icon: SVGElement; label: string } {
  return { icon: icon(THEME_ICON[studioTheme], { size: 16 }), label: THEME_LABEL[studioTheme] };
}

function syncThemeButtons(): void {
  for (const button of document.querySelectorAll<HTMLButtonElement>(".theme-toggle")) {
    const { icon: glyph, label } = themeButtonContent();
    button.replaceChildren(glyph);
    button.title = label;
    button.setAttribute("aria-label", label);
  }
}

function initThemeToggle(): void {
  studioTheme = readStudioTheme();
  applyStudioTheme(studioTheme);
  const make = (): HTMLButtonElement => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "icon-btn theme-toggle";
    button.addEventListener("click", () => {
      studioTheme = nextStudioTheme(studioTheme);
      applyStudioTheme(studioTheme);
      syncThemeButtons();
    });
    return button;
  };
  const corner = document.createElement("div");
  corner.className = "theme-corner";
  corner.append(make());
  el("gallery-view").append(corner);
  const actions = document.querySelector(".topbar-actions");
  actions?.prepend(make());
  syncThemeButtons();
}

function syncDock(): void {
  for (const [id, active] of [
    ["chrome-style-ios", state.chromeStyle === "ios"],
    ["chrome-style-android", state.chromeStyle === "android"],
    ["chrome-theme-light", state.chromeTheme === "light"],
    ["chrome-theme-dark", state.chromeTheme === "dark"],
  ] as const) {
    document.getElementById(id)?.setAttribute("aria-checked", String(active));
  }
}

/** The current address with `view` set (phone) or removed. The query already mirrors the list, network and token. */
function currentLink(view: "phone" | undefined): string {
  syncUrl(); // typing on the Send screen does not re-render: refresh the recipient in the address before it is copied
  return withViewParam(`${location.origin}${location.pathname}${location.search}`, view);
}

async function copyLink(view: "phone" | undefined): Promise<void> {
  const ok = await copyText(currentLink(view));
  showToast(ok ? (view === "phone" ? "Phone link copied" : "Link copied") : "Couldn't copy the link");
}

async function runDeployFlow(button: HTMLButtonElement): Promise<void> {
  if (!state.selectedToken || !state.source) return;
  // Disabled immediately on click, re-enabled only after the flow settles —
  // prevents duplicate tabs/downloads from rapid clicks (CEO review Sec 4).
  button.disabled = true;
  try {
    if (state.source.kind !== "github") {
      // Bundled/uploaded lists don't have a wired "propose a PR" target —
      // download the single token's JSON instead (use "Download list JSON"
      // in the toolbar to export the whole list).
      downloadJson(state.selectedToken, `${state.selectedToken.symbol}.json`);
      return;
    }
    const plan = await buildDeployPlan(state.source, state.selectedNetwork, state.selectedToken);
    if (plan.kind === "pr_prep_link" && plan.url) {
      window.open(plan.url, "_blank", "noopener");
    } else {
      if (plan.reason) window.alert(plan.reason);
      downloadJson(state.selectedToken, `${state.selectedToken.symbol}.json`);
    }
  } finally {
    button.disabled = false;
  }
}

async function runShareFlow(): Promise<void> {
  if (!state.selectedToken || !state.source) return;
  const { fragment, json } = await encodeSharePayload({ token: state.selectedToken, registrySource: state.source });
  if (fragment) {
    const ok = await copyText(`${location.origin}${location.pathname}#${fragment}`);
    showToast(ok ? "Token preview link copied" : "Couldn't copy the link");
  } else {
    const ok = await copyText(json);
    showToast(ok ? "Too large for a link: JSON copied instead" : "Couldn't copy the JSON");
  }
}

function downloadListJson(): void {
  if (!state.registry) return;
  const filename = state.listMeta?.file ?? "registry.json";
  downloadJson(state.registry, filename);
}

function downloadJson(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function blankToken(): Token {
  return {
    name: "New Token",
    symbol: "NEW",
    type: "ERC20",
    id: "0x0000000000000000000000000000000000000000",
    decimals: 18,
    status: "active",
  };
}

let editor: Editor;

function selectToken(token: Token, opts: { confirmDiscard: boolean }): void {
  if (opts.confirmDiscard && editor?.hasUnsavedChanges) {
    const proceed = window.confirm(`Discard unsaved changes to ${state.selectedToken?.symbol ?? "this token"}?`);
    if (!proceed) return;
  }
  state.selectedToken = token;
  state.isPreviewOnly = false;
  editor.loadToken(token);
  setPhoneNavScreen("detail");
  renderAll();
}

function selectNetwork(network: string): void {
  state.selectedNetwork = network;
  const firstToken = state.registry?.networks.find((n) => n.name === network)?.tokens[0];
  state.selectedToken = firstToken;
  if (firstToken) editor.loadToken(firstToken);
  else editor.clear();
  setPhoneNavScreen("list");
  renderAll();
}

async function loadSource(source: RegistrySource, listMeta: ListMeta | undefined, restore?: StudioUrlState): Promise<void> {
  const guardToken = staleFetchGuard.begin();
  const statusEl = el("status-banner");
  statusEl.textContent = source.kind === "bundled" ? "" : "Loading registry…";
  setView("studio");

  try {
    const { registry } = await fetchRegistry(source);
    if (!staleFetchGuard.isCurrent(guardToken)) return; // A newer selection superseded this fetch.

    state.source = source;
    state.listMeta = listMeta;
    state.registry = registry;
    // A link may name a network and an asset (?network=Tron&token=USDT); unknown names fall back to the defaults.
    const network = findByName(registry.networks, restore?.network, (n) => n.name) ?? registry.networks[0];
    const restoredToken = findByName(network?.tokens ?? [], restore?.token, (t) => t.symbol);
    state.selectedNetwork = network?.name ?? "";
    state.selectedToken = restoredToken ?? network?.tokens[0];
    state.isPreviewOnly = false;
    statusEl.textContent = "";
    if (state.selectedToken) editor.loadToken(state.selectedToken);
    else editor.clear();
    setPhoneNavScreen(restoredToken ? "detail" : "list");
    if (restoredToken && restore?.to) openSendWithDestination(restore.to); // a demo link: straight to Send with the recipient filled in
    renderAll();

    if (source.kind === "github") {
      const governance = await checkGovernance(source.owner, source.repo);
      if (!staleFetchGuard.isCurrent(guardToken)) return;
      const warning = governanceWarning(governance);
      if (warning) statusEl.textContent = warning;
    }
  } catch (err) {
    if (!staleFetchGuard.isCurrent(guardToken)) return;
    if (err instanceof RegistryClientError) {
      statusEl.textContent = userMessageFor(err);
    } else {
      throw err;
    }
  }
}

/** `?registry=owner/repo` — a direct link straight into the multi-registry (GitHub) client, bypassing the Gallery. */
function parseGithubQueryParam(): { owner: string; repo: string } | undefined {
  const value = new URLSearchParams(location.search).get("registry");
  if (!value) return undefined;
  const [owner, repo, ...rest] = value.split("/");
  // GitHub names only: they go straight into github.com / raw.githubusercontent.com URL paths.
  const NAME = /^[A-Za-z0-9_.-]{1,100}$/;
  if (rest.length > 0 || !owner || !repo || !NAME.test(owner) || !NAME.test(repo) || owner === "." || owner === ".." || repo === "." || repo === "..") return undefined;
  return { owner, repo };
}

async function init(): Promise<void> {
  state.networks = await loadNetworkRegistry();

  editor = new Editor(el("editor-container"), {
    onValidToken: (token) => {
      state.selectedToken = token;
      renderPhoneFrame(el("phone-frame"), token, phoneOptions());
    },
  });

  // Chrome that is the same on every load: icons in the gallery and the top bar, the device dock.
  el("gallery-brand").append(icon("layers", { size: 22, strokeWidth: 1.9 }));
  el("upload-label").prepend(icon("upload", { size: 15 }));
  const backBtn = el("back-to-gallery");
  backBtn.append(icon("arrow-left", { size: 16 }), Object.assign(document.createElement("span"), { className: "icon-btn-label", textContent: "Gallery" }));
  backBtn.setAttribute("aria-label", "Back to Gallery");
  backBtn.title = "Back to Gallery";
  el("topbar-sep").append(icon("chevron-right", { size: 16 }));
  const downloadBtn = el("download-list-btn");
  downloadBtn.append(icon("download", { size: 16 }), Object.assign(document.createElement("span"), { className: "icon-btn-label", textContent: "Export list" }));
  downloadBtn.setAttribute("aria-label", "Export list");
  downloadBtn.title = "Download list JSON";
  buildDock();
  initThemeToggle();

  // A real phone looks like the device it is: iOS or Android chrome, and the system light/dark setting.
  const detected = detectChromeStyle(navigator.userAgent, navigator.maxTouchPoints);
  if (phone.fullscreen) {
    if (detected) state.chromeStyle = detected;
    state.chromeTheme = window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }
  applyPhoneMode();
  new ResizeObserver(() => fitPhone()).observe(el("phone-stage"));
  window.addEventListener("resize", () => {
    const next = resolvePhoneMode(location.search, measureDevice());
    if (next.phoneMode !== phone.phoneMode || next.fullscreen !== phone.fullscreen) {
      phone = next;
      applyPhoneMode();
      renderAll();
    }
    fitPhone();
  });
  el("back-to-gallery").addEventListener("click", () => setView("gallery"));
  el("download-list-btn").addEventListener("click", () => downloadListJson());
  (el("upload-input") as HTMLInputElement).addEventListener("change", (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) handleUploadFile(file);
  });

  // Entry points that bypass the Gallery, in priority order:
  if (location.hash) {
    try {
      const payload = await decodeShareFragment(location.hash.slice(1));
      state.source = payload.registrySource;
      state.registry = { schemaVersion: "1.0.0", networks: [{ name: "Shared", tokens: [payload.token] }] };
      state.selectedNetwork = "Shared";
      state.selectedToken = payload.token;
      state.isPreviewOnly = true;
      editor.loadToken(payload.token);
      setPhoneNavScreen("detail");
      setView("studio");
      renderAll();
      return;
    } catch (err) {
      if (err instanceof ShareLinkDecodeError) {
        el("status-banner").textContent = err.message;
      } else {
        throw err;
      }
    }
  }

  const githubParam = parseGithubQueryParam();
  if (githubParam) {
    await loadGallery(); // Still warm the gallery in the background so "Back to Gallery" works.
    await loadSource({ kind: "github", owner: githubParam.owner, repo: githubParam.repo }, undefined);
    return;
  }

  await loadGallery();
  const urlState = parseStudioQuery(location.search);
  if (urlState.list) {
    const entry = state.galleryEntries.find((e) => e.meta.id === urlState.list);
    if (entry) {
      await loadSource({ kind: "bundled", listId: entry.meta.id }, entry.meta, urlState);
      return;
    }
    el("status-banner").textContent = `The list "${urlState.list}" was not found. Pick one from the gallery.`;
  }
  setView("gallery");
}

init().catch((err) => {
  console.error("[main] Fatal init error:", err);
  el("status-banner").textContent = "Something went wrong loading the Studio. Check the console for details.";
});
