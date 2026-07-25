import type { Registry, Token, RegistrySource } from "./types.ts";
import { fetchRegistry } from "./registry-client/fetcher.ts";
import { RegistryClientError, userMessageFor } from "./registry-client/errors.ts";
import { StaleFetchGuard } from "./registry-client/stale-fetch-guard.ts";
import { checkGovernance, governanceWarning } from "./registry-client/governance-check.ts";
import { renderSidebar } from "./ui/sidebar.ts";
import { renderPhoneFrame, type ChromeStyle, type ChromeTheme } from "./ui/phone-frame.ts";
import { Editor } from "./ui/editor.ts";
import { NAMED_PRESETS, GALLERY_TEMPLATES } from "./presets/presets.ts";
import { buildDeployPlan } from "./deploy-flow/build-deploy-url.ts";
import { encodeSharePayload } from "./share-link/encode.ts";
import { decodeShareFragment, ShareLinkDecodeError } from "./share-link/decode.ts";

const DEFAULT_SOURCE: RegistrySource = { owner: "", repo: "", isDefault: true };

interface AppState {
  source: RegistrySource;
  registry: Registry | null;
  selectedNetwork: string;
  selectedToken: Token | undefined;
  chromeStyle: ChromeStyle;
  chromeTheme: ChromeTheme;
  isPreviewOnly: boolean; // true when the current token came from a share-link, not the registry.
}

const state: AppState = {
  source: DEFAULT_SOURCE,
  registry: null,
  selectedNetwork: "",
  selectedToken: undefined,
  chromeStyle: "ios",
  chromeTheme: "dark",
  isPreviewOnly: false,
};

const staleFetchGuard = new StaleFetchGuard();

function el(id: string): HTMLElement {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing #${id} in index.html`);
  return found;
}

function renderAll(): void {
  if (!state.registry) return;

  renderSidebar(el("sidebar"), state.registry, state.selectedNetwork, state.selectedToken?.symbol, {
    onSelectNetwork: (network) => selectNetwork(network),
    onSelectToken: (token) => selectToken(token, { confirmDiscard: true }),
    onAddToken: () => selectToken(blankToken(), { confirmDiscard: true }),
  });

  renderPhoneFrame(el("phone-frame"), state.selectedToken, {
    chromeStyle: state.chromeStyle,
    chromeTheme: state.chromeTheme,
  });

  renderRegistrySourceBanner();
  renderGallery();
  renderDeployPanel();
}

function renderRegistrySourceBanner(): void {
  const banner = el("registry-source-banner");
  banner.innerHTML = "";

  if (state.isPreviewOnly) {
    banner.className = "registry-source-banner preview-only";
    banner.textContent = "PREVIEW ONLY — opened from a share link, not from a verified registry.";
    return;
  }
  if (state.source.isDefault) {
    banner.className = "registry-source-banner";
    banner.textContent = "";
    return;
  }
  banner.className = "registry-source-banner viewing-remote";
  banner.textContent = `Viewing: ${state.source.owner}/${state.source.repo}`;
}

function renderGallery(): void {
  const gallery = el("gallery");
  gallery.innerHTML = "";
  for (const template of [...NAMED_PRESETS, ...GALLERY_TEMPLATES]) {
    const chip = document.createElement("button");
    chip.className = "preset-chip";
    chip.textContent = template.symbol;
    chip.addEventListener("click", () => selectToken(structuredClone(template), { confirmDiscard: true }));
    gallery.append(chip);
  }
}

function renderDeployPanel(): void {
  const panel = el("deploy-panel");
  panel.innerHTML = "";

  const deployBtn = document.createElement("button");
  deployBtn.className = "deploy-btn";
  deployBtn.textContent = "Deploy / Propose Token Card via GitHub";
  deployBtn.addEventListener("click", () => runDeployFlow(deployBtn));
  panel.append(deployBtn);

  const shareBtn = document.createElement("button");
  shareBtn.className = "share-btn";
  shareBtn.textContent = "Copy share link";
  shareBtn.addEventListener("click", () => runShareFlow(shareBtn));
  panel.append(shareBtn);
}

async function runDeployFlow(button: HTMLButtonElement): Promise<void> {
  if (!state.selectedToken) return;
  // Disabled immediately on click, re-enabled only after the flow settles —
  // prevents duplicate tabs/downloads from rapid clicks (CEO review Sec 4).
  button.disabled = true;
  try {
    if (state.source.isDefault) {
      downloadJson(state.selectedToken);
      return;
    }
    const plan = await buildDeployPlan(state.source, state.selectedNetwork, state.selectedToken);
    if (plan.kind === "pr_prep_link" && plan.url) {
      window.open(plan.url, "_blank", "noopener");
    } else {
      if (plan.reason) window.alert(plan.reason);
      downloadJson(state.selectedToken);
    }
  } finally {
    button.disabled = false;
  }
}

async function runShareFlow(button: HTMLButtonElement): Promise<void> {
  if (!state.selectedToken) return;
  button.disabled = true;
  try {
    const { fragment, json } = await encodeSharePayload({ token: state.selectedToken, registrySource: state.source });
    if (fragment) {
      const link = `${location.origin}${location.pathname}#${fragment}`;
      await navigator.clipboard.writeText(link);
      window.alert("Share link copied to clipboard.");
    } else {
      await navigator.clipboard.writeText(json);
      window.alert("Config too large for a share link — JSON copied to clipboard instead.");
    }
  } finally {
    button.disabled = false;
  }
}

function downloadJson(token: Token): void {
  const blob = new Blob([JSON.stringify(token, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${token.symbol}.json`;
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
  renderAll();
}

function selectNetwork(network: string): void {
  state.selectedNetwork = network;
  state.selectedToken = undefined;
  renderAll();
}

async function loadSource(source: RegistrySource): Promise<void> {
  const guardToken = staleFetchGuard.begin();
  const statusEl = el("status-banner");
  statusEl.textContent = source.isDefault ? "" : "Loading registry…";

  try {
    const { registry } = await fetchRegistry(source);
    if (!staleFetchGuard.isCurrent(guardToken)) return; // A newer selection superseded this fetch.

    state.source = source;
    state.registry = registry;
    state.selectedNetwork = registry.networks[0]?.name ?? "";
    state.selectedToken = undefined;
    statusEl.textContent = "";
    renderAll();

    if (!source.isDefault) {
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

async function init(): Promise<void> {
  editor = new Editor(el("editor-container"), {
    onValidToken: (token) => {
      state.selectedToken = token;
      renderPhoneFrame(el("phone-frame"), token, { chromeStyle: state.chromeStyle, chromeTheme: state.chromeTheme });
    },
  });

  el("chrome-style-toggle").addEventListener("click", () => {
    state.chromeStyle = state.chromeStyle === "ios" ? "android" : "ios";
    renderAll();
  });
  el("chrome-theme-toggle").addEventListener("click", () => {
    state.chromeTheme = state.chromeTheme === "dark" ? "light" : "dark";
    renderAll();
  });

  if (location.hash) {
    try {
      const payload = await decodeShareFragment(location.hash.slice(1));
      state.source = payload.registrySource;
      state.registry = { schemaVersion: "1.0.0", networks: [{ name: "Shared", tokens: [payload.token] }] };
      state.selectedNetwork = "Shared";
      state.selectedToken = payload.token;
      state.isPreviewOnly = true;
      editor.loadToken(payload.token);
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

  await loadSource(DEFAULT_SOURCE);
}

init().catch((err) => {
  console.error("[main] Fatal init error:", err);
  el("status-banner").textContent = "Something went wrong loading the Studio. Check the console for details.";
});
