import type { Registry, Token } from "../types.ts";
import { createLogoBadge } from "./logo-badge.ts";
import { icon } from "./icons.ts";
import { makeActivatable } from "./a11y.ts";
import { findNetworkInfo, type NetworkInfo } from "../networks/network-registry.ts";

// Virtualized above ~200 tokens per network (CEO review Section 7 finding).
// Simple windowing: render only rows within [scrollTop, scrollTop+viewport]
// plus a small overscan buffer — no external dependency needed for this.
const VIRTUALIZE_THRESHOLD = 200;
const ROW_HEIGHT_PX = 44;
const OVERSCAN_ROWS = 6;

export interface SidebarCallbacks {
  onSelectNetwork: (network: string) => void;
  onSelectToken: (token: Token) => void;
  onAddToken: () => void;
}

/** A network with more tokens than this gets a filter box above its list. */
export const SEARCH_THRESHOLD = 12;

// The filter text survives the sidebar's re-renders (the whole panel is rebuilt on every state change) and is cleared
// when the network changes.
let filterText = "";
let filterNetwork = "";

export function matchesFilter(token: Token, query: string): boolean {
  const needle = query.trim().toLowerCase();
  return needle === "" || token.symbol.toLowerCase().includes(needle) || token.name.toLowerCase().includes(needle);
}

export function renderSidebar(
  container: HTMLElement,
  registry: Registry,
  networks: readonly NetworkInfo[],
  selectedNetwork: string,
  selectedTokenSymbol: string | undefined,
  callbacks: SidebarCallbacks,
): void {
  if (filterNetwork !== selectedNetwork) {
    filterNetwork = selectedNetwork;
    filterText = "";
  }
  container.innerHTML = "";
  container.className = "sidebar";

  const networksHeader = document.createElement("h3");
  networksHeader.textContent = "Networks";
  container.append(networksHeader);

  const networkTabs = document.createElement("div");
  networkTabs.className = "network-tabs";
  for (const network of registry.networks) {
    const tab = document.createElement("button");
    tab.className = "network-tab" + (network.name === selectedNetwork ? " active" : "");
    const info = findNetworkInfo(networks, network.name);
    tab.append(createLogoBadge(info?.logo, network.name, "network-tab-logo"));
    const label = document.createElement("span");
    label.textContent = network.name;
    tab.append(label);
    tab.addEventListener("click", () => callbacks.onSelectNetwork(network.name));
    networkTabs.append(tab);
  }
  container.append(networkTabs);

  const tokensHeader = document.createElement("h3");
  const network = registry.networks.find((n) => n.name === selectedNetwork);
  const allTokens = network?.tokens ?? [];
  const tokens = allTokens.filter((t) => matchesFilter(t, filterText));
  tokensHeader.textContent = `Tokens (${selectedNetwork})`;
  container.append(tokensHeader);

  if (allTokens.length > SEARCH_THRESHOLD) {
    const wrap = document.createElement("label");
    wrap.className = "sidebar-search";
    wrap.append(icon("search", { size: 15 }));
    const input = document.createElement("input");
    input.type = "search";
    input.placeholder = `Filter ${allTokens.length} tokens`;
    input.setAttribute("aria-label", "Filter tokens");
    input.autocomplete = "off";
    input.spellcheck = false;
    input.value = filterText;
    input.addEventListener("input", () => {
      filterText = input.value;
      const caret = input.selectionStart;
      renderSidebar(container, registry, networks, selectedNetwork, selectedTokenSymbol, callbacks);
      const again = container.querySelector<HTMLInputElement>(".sidebar-search input");
      again?.focus();
      if (caret !== null) again?.setSelectionRange(caret, caret);
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && input.value !== "") {
        event.preventDefault();
        input.value = "";
        input.dispatchEvent(new Event("input"));
      }
    });
    wrap.append(input);
    container.append(wrap);
  }

  if (allTokens.length > 0 && tokens.length === 0) {
    const none = document.createElement("div");
    none.className = "sidebar-empty-state";
    none.textContent = `No token matches "${filterText.trim()}".`;
    container.append(none);
  } else if (tokens.length === 0) {
    const empty = document.createElement("div");
    empty.className = "sidebar-empty-state";
    empty.textContent = "No tokens on this network yet.";
    container.append(empty);
  } else if (tokens.length <= VIRTUALIZE_THRESHOLD) {
    const list = document.createElement("div");
    list.className = "token-list";
    for (const token of tokens) {
      list.append(renderTokenRow(token, token.symbol === selectedTokenSymbol, callbacks.onSelectToken));
    }
    container.append(list);
  } else {
    container.append(renderVirtualizedTokenList(tokens, selectedTokenSymbol, callbacks.onSelectToken));
  }

  const addBtn = document.createElement("button");
  addBtn.className = "add-token-btn";
  addBtn.append(icon("plus", { size: 15 }), document.createTextNode("Add / Create token"));
  addBtn.addEventListener("click", callbacks.onAddToken);
  container.append(addBtn);

  // A long list re-renders scrolled to the top: keep the selected token in view.
  container.querySelector(".token-row.active")?.scrollIntoView?.({ block: "nearest" });
}

function renderTokenRow(token: Token, active: boolean, onSelect: (token: Token) => void): HTMLElement {
  const row = document.createElement("div");
  row.className = "token-row" + (active ? " active" : "");
  row.style.height = `${ROW_HEIGHT_PX}px`;
  row.append(createLogoBadge(token.logo, token.symbol, "token-row-logo"));
  const label = document.createElement("span");
  label.textContent = `${token.symbol} — ${token.name}`;
  row.append(label);
  makeActivatable(row, () => onSelect(token));
  if (active) row.setAttribute("aria-current", "true");
  return row;
}

function renderVirtualizedTokenList(
  tokens: readonly Token[],
  selectedTokenSymbol: string | undefined,
  onSelect: (token: Token) => void,
): HTMLElement {
  const viewport = document.createElement("div");
  viewport.className = "token-list token-list-virtualized";
  viewport.style.position = "relative";
  viewport.style.overflowY = "auto";
  viewport.style.height = "400px";

  const spacer = document.createElement("div");
  spacer.style.height = `${tokens.length * ROW_HEIGHT_PX}px`;
  spacer.style.position = "relative";
  viewport.append(spacer);

  const rowsContainer = document.createElement("div");
  rowsContainer.style.position = "absolute";
  rowsContainer.style.top = "0";
  rowsContainer.style.left = "0";
  rowsContainer.style.right = "0";
  spacer.append(rowsContainer);

  function renderVisibleRows(): void {
    const scrollTop = viewport.scrollTop;
    const viewportHeight = viewport.clientHeight || 400;
    const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT_PX) - OVERSCAN_ROWS);
    const endIndex = Math.min(
      tokens.length,
      Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT_PX) + OVERSCAN_ROWS,
    );

    rowsContainer.innerHTML = "";
    for (let i = startIndex; i < endIndex; i++) {
      const token = tokens[i]!;
      const row = renderTokenRow(token, token.symbol === selectedTokenSymbol, onSelect);
      row.style.position = "absolute";
      row.style.top = `${i * ROW_HEIGHT_PX}px`;
      row.style.left = "0";
      row.style.right = "0";
      rowsContainer.append(row);
    }
  }

  viewport.addEventListener("scroll", renderVisibleRows);
  renderVisibleRows();
  return viewport;
}
