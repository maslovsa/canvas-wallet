import type { Registry, Token, RegistrySource, ListMeta } from "./types.ts";
import { fetchRegistry } from "./registry-client/fetcher.ts";
import { RegistryClientError, userMessageFor } from "./registry-client/errors.ts";
import { StaleFetchGuard } from "./registry-client/stale-fetch-guard.ts";
import { checkGovernance, governanceWarning } from "./registry-client/governance-check.ts";
import { loadManifest } from "./registry-client/manifest.ts";
import { renderSidebar } from "./ui/sidebar.ts";
import { renderPhoneFrame, type ChromeStyle, type ChromeTheme } from "./ui/phone-frame.ts";
import { renderGalleryCards, type GalleryEntry } from "./ui/gallery.ts";
import { Editor } from "./ui/editor.ts";
import { NAMED_PRESETS, STARTER_TEMPLATES } from "./presets/presets.ts";
import { buildDeployPlan } from "./deploy-flow/build-deploy-url.ts";
import { encodeSharePayload } from "./share-link/encode.ts";
import { decodeShareFragment, ShareLinkDecodeError } from "./share-link/decode.ts";
import { parseRegistry, RegistryParseError, RegistrySchemaError } from "./schema-validator.ts";
import { loadNetworkRegistry, findNetworkInfo, type NetworkInfo } from "./networks/network-registry.ts";

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

function el(id: string): HTMLElement {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing #${id} in index.html`);
  return found;
}

function setView(view: ViewMode): void {
  state.view = view;
  el("gallery-view").hidden = view !== "gallery";
  el("studio-view").hidden = view !== "studio";
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
  renderGalleryCards(el("gallery-cards"), entries, (meta) => openBundledList(meta));
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
      state.selectedToken = undefined;
      state.isPreviewOnly = false;
      el("status-banner").textContent = "";
      editor.clear();
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

function renderAll(): void {
  if (!state.registry) return;

  renderSidebar(el("sidebar"), state.registry, state.networks, state.selectedNetwork, state.selectedToken?.symbol, {
    onSelectNetwork: (network) => selectNetwork(network),
    onSelectToken: (token) => selectToken(token, { confirmDiscard: true }),
    onAddToken: () => selectToken(blankToken(), { confirmDiscard: true }),
  });

  renderPhoneFrame(el("phone-frame"), state.selectedToken, {
    chromeStyle: state.chromeStyle,
    chromeTheme: state.chromeTheme,
    networkName: state.selectedNetwork,
    networkInfo: findNetworkInfo(state.networks, state.selectedNetwork),
  });

  renderRegistrySourceBanner();
  renderTemplateChips();
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

function renderTemplateChips(): void {
  const gallery = el("template-chips");
  gallery.innerHTML = "";
  for (const template of [...NAMED_PRESETS, ...STARTER_TEMPLATES]) {
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

async function runShareFlow(button: HTMLButtonElement): Promise<void> {
  if (!state.selectedToken || !state.source) return;
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
  renderAll();
}

function selectNetwork(network: string): void {
  state.selectedNetwork = network;
  state.selectedToken = undefined;
  editor.clear();
  renderAll();
}

async function loadSource(source: RegistrySource, listMeta: ListMeta | undefined): Promise<void> {
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
    state.selectedNetwork = registry.networks[0]?.name ?? "";
    state.selectedToken = undefined;
    state.isPreviewOnly = false;
    statusEl.textContent = "";
    editor.clear();
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
  const [owner, repo] = value.split("/");
  if (!owner || !repo) return undefined;
  return { owner, repo };
}

async function init(): Promise<void> {
  state.networks = await loadNetworkRegistry();

  editor = new Editor(el("editor-container"), {
    onValidToken: (token) => {
      state.selectedToken = token;
      renderPhoneFrame(el("phone-frame"), token, {
        chromeStyle: state.chromeStyle,
        chromeTheme: state.chromeTheme,
        networkName: state.selectedNetwork,
        networkInfo: findNetworkInfo(state.networks, state.selectedNetwork),
      });
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
  setView("gallery");
}

init().catch((err) => {
  console.error("[main] Fatal init error:", err);
  el("status-banner").textContent = "Something went wrong loading the Studio. Check the console for details.";
});
