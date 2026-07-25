import type { Registry, Token } from "../types.ts";

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

export function renderSidebar(
  container: HTMLElement,
  registry: Registry,
  selectedNetwork: string,
  selectedTokenSymbol: string | undefined,
  callbacks: SidebarCallbacks,
): void {
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
    tab.textContent = network.name;
    tab.addEventListener("click", () => callbacks.onSelectNetwork(network.name));
    networkTabs.append(tab);
  }
  container.append(networkTabs);

  const tokensHeader = document.createElement("h3");
  const network = registry.networks.find((n) => n.name === selectedNetwork);
  const tokens = network?.tokens ?? [];
  tokensHeader.textContent = `Tokens (${selectedNetwork})`;
  container.append(tokensHeader);

  if (tokens.length === 0) {
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
  addBtn.textContent = "+ Add / Create token";
  addBtn.addEventListener("click", callbacks.onAddToken);
  container.append(addBtn);
}

function renderTokenRow(token: Token, active: boolean, onSelect: (token: Token) => void): HTMLElement {
  const row = document.createElement("div");
  row.className = "token-row" + (active ? " active" : "");
  row.style.height = `${ROW_HEIGHT_PX}px`;
  row.textContent = `${token.symbol} — ${token.name}`;
  row.addEventListener("click", () => onSelect(token));
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
