import { describe, it, expect, vi } from "vitest";
import { renderSidebar, matchesFilter, SEARCH_THRESHOLD } from "../src/ui/sidebar.ts";
import type { Registry, Token } from "../src/types.ts";

const tok = (symbol: string, name: string): Token => ({ name, symbol, type: "ERC20", id: `0x${symbol}`, decimals: 18, status: "active" }) as unknown as Token;
const many = Array.from({ length: SEARCH_THRESHOLD + 3 }, (_, i) => tok(`TK${i}`, `Token number ${i}`)).concat([tok("USDT", "Tether USD"), tok("USDC", "USD Coin")]);
const registry = (tokens: Token[]) => ({ schemaVersion: "1.2.0", networks: [{ name: "Ethereum", tokens }, { name: "Tron", tokens: tokens.slice(0, 3) }] }) as unknown as Registry;
const callbacks = () => ({ onSelectNetwork: vi.fn(), onSelectToken: vi.fn(), onAddToken: vi.fn() });

describe("matchesFilter", () => {
  it("matches symbol or name, case-insensitively, ignoring surrounding spaces; empty matches all", () => {
    expect(matchesFilter(tok("USDT", "Tether USD"), " usd ")).toBe(true);
    expect(matchesFilter(tok("USDT", "Tether USD"), "teth")).toBe(true);
    expect(matchesFilter(tok("USDT", "Tether USD"), "dai")).toBe(false);
    expect(matchesFilter(tok("USDT", "Tether USD"), "")).toBe(true);
  });
});

describe("sidebar token filter", () => {
  function mount(tokens: Token[], network = "Ethereum") {
    document.body.innerHTML = "";
    const host = document.createElement("div");
    document.body.append(host);
    const cb = callbacks();
    const draw = (net = network) => renderSidebar(host, registry(tokens), [], net, undefined, cb);
    draw();
    return { host, cb, draw };
  }
  const type = (host: HTMLElement, value: string) => {
    const input = host.querySelector<HTMLInputElement>(".sidebar-search input")!;
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };

  it("a short list has no filter box", () => {
    const { host } = mount(many.slice(0, 5), "Tron");
    expect(host.querySelector(".sidebar-search")).toBeNull();
  });

  it("a long list gets a labelled filter that narrows the rows and keeps focus while you type", () => {
    const { host } = mount(many);
    expect(host.querySelectorAll(".token-row")).toHaveLength(many.length);
    expect(host.querySelector(".sidebar-search input")!.getAttribute("aria-label")).toBe("Filter tokens");
    type(host, "usd");
    expect([...host.querySelectorAll(".token-row > span")].map((r) => r.textContent)).toEqual(["USDT — Tether USD", "USDC — USD Coin"]);
    expect(document.activeElement).toBe(host.querySelector(".sidebar-search input"));
    expect(host.querySelector<HTMLInputElement>(".sidebar-search input")!.value).toBe("usd");
  });

  it("says so when nothing matches, and Escape clears the filter", () => {
    const { host } = mount(many);
    type(host, "zzzz");
    expect(host.querySelector(".sidebar-empty-state")!.textContent).toBe('No token matches "zzzz".');
    const input = host.querySelector<HTMLInputElement>(".sidebar-search input")!;
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(host.querySelectorAll(".token-row")).toHaveLength(many.length);
  });

  it("the filter survives a re-render of the same network and is cleared when the network changes", () => {
    const { host, draw } = mount(many);
    type(host, "usdt");
    draw();
    expect(host.querySelectorAll(".token-row")).toHaveLength(1);
    draw("Tron");
    draw("Ethereum");
    expect(host.querySelectorAll(".token-row")).toHaveLength(many.length);
  });

  it("clicking a filtered row selects that token", () => {
    const { host, cb } = mount(many);
    type(host, "usdc");
    (host.querySelector(".token-row") as HTMLElement).click();
    expect(cb.onSelectToken).toHaveBeenCalledWith(expect.objectContaining({ symbol: "USDC" }));
  });
});
