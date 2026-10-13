import { describe, it, expect, vi, afterEach } from "vitest";
import { webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import { keccak256 } from "js-sha3";
import { loadReceiveAddresses, receiveAddressFor } from "../src/receive/receive-address.ts";
import { renderQrSvg } from "../src/receive/qr-svg.ts";
import { copyText } from "../src/receive/copy-text.ts";
import { openReceiveDialog } from "../src/ui/receive-dialog.ts";
import { validateTronAddress } from "../src/send/tron-address.ts";
import type { Token } from "../src/types.ts";

const published = JSON.parse(readFileSync("public/receive-addresses.json", "utf8")) as { networks: Record<string, string> };
const networks = JSON.parse(readFileSync("public/networks.json", "utf8")) as { networks: { canonicalName: string }[] };

function isEip55(address: string): boolean {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return false;
  const hex = address.slice(2);
  const hash = keccak256(hex.toLowerCase());
  return [...hex].every((c, i) => /\d/.test(c) || (parseInt(hash[i]!, 16) >= 8 ? c === c.toUpperCase() : c === c.toLowerCase()));
}

describe("published demo addresses (public/receive-addresses.json)", () => {
  it("are keyed by canonical network names the app knows", () => {
    const known = new Set(networks.networks.map((n) => n.canonicalName));
    for (const name of Object.keys(published.networks)) expect(known.has(name)).toBe(true);
  });
  it("the Tron stub is a valid Tron address (Base58Check)", async () => {
    expect(await validateTronAddress(published.networks["Tron"]!, webcrypto.subtle as SubtleCrypto)).toEqual({ ok: true });
  });
  it("the EVM stub is a valid EIP-55 address and BNB Smart Chain reuses it", () => {
    expect(isEip55(published.networks["Ethereum"]!)).toBe(true);
    expect(published.networks["BNB Smart Chain"]).toBe(published.networks["Ethereum"]);
  });
});

describe("receiveAddressFor", () => {
  const addresses = { Ethereum: "0xabc", Tron: "Txyz" };
  it("matches the canonical name case-insensitively", () => {
    expect(receiveAddressFor(addresses, "Tron")).toBe("Txyz");
    expect(receiveAddressFor(addresses, " ethereum ")).toBe("0xabc");
  });
  it("returns undefined for unknown or missing networks (never guesses)", () => {
    expect(receiveAddressFor(addresses, "Solana")).toBeUndefined();
    expect(receiveAddressFor(addresses, undefined)).toBeUndefined();
    expect(receiveAddressFor({}, "Tron")).toBeUndefined();
  });
});

describe("loadReceiveAddresses", () => {
  it("returns {} on a failed or malformed response, and does not cache a failure", async () => {
    const bad = vi.fn(async () => new Response("nope", { status: 500 })) as unknown as typeof fetch;
    expect(await loadReceiveAddresses(bad)).toEqual({});
    const weird = vi.fn(async () => new Response(JSON.stringify({ networks: 5 }))) as unknown as typeof fetch;
    expect(await loadReceiveAddresses(weird)).toEqual({});
    const good = vi.fn(async () => new Response(JSON.stringify({ networks: { Tron: "Txyz", Bad: 7, Empty: "" } }))) as unknown as typeof fetch;
    expect(await loadReceiveAddresses(good)).toEqual({ Tron: "Txyz" });
  });
});

describe("renderQrSvg", () => {
  it("draws a labelled SVG with a quiet zone and dark modules, built without innerHTML", () => {
    const text = '"><img src=x onerror=alert(1)>';
    const svg = renderQrSvg(text, "QR of the address");
    expect(svg.getAttribute("role")).toBe("img");
    expect(svg.getAttribute("aria-label")).toBe("QR of the address");
    const size = Number(svg.getAttribute("viewBox")!.split(" ")[2]);
    expect((size - 8) % 4).toBe(1); // module count is 17 + 4 * version
    expect(svg.querySelector("path")!.getAttribute("d")!.length).toBeGreaterThan(50);
    expect(svg.querySelector("img")).toBeNull();
  });
  it("is deterministic for the same text and differs for different text", () => {
    const d = (t: string) => renderQrSvg(t, "x").querySelector("path")!.getAttribute("d");
    expect(d("TC9kD9YUpyHYQDfeoq1P12S8J3ZhNrYF3h")).toBe(d("TC9kD9YUpyHYQDfeoq1P12S8J3ZhNrYF3h"));
    expect(d("TC9kD9YUpyHYQDfeoq1P12S8J3ZhNrYF3h")).not.toBe(d("0x4d0587856845526585F98232010371F88B3ee784"));
  });
});

describe("copyText", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    Object.defineProperty(document, "execCommand", { value: undefined, configurable: true, writable: true });
  });
  it("uses the async clipboard when it works", async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    expect(await copyText("abc")).toBe(true);
    expect(writeText).toHaveBeenCalledWith("abc");
  });
  it("falls back to execCommand when the clipboard API rejects, and reports its result", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn(async () => { throw new Error("denied"); }) } });
    const exec = vi.fn(() => true);
    Object.defineProperty(document, "execCommand", { value: exec, configurable: true, writable: true });
    expect(await copyText("abc")).toBe(true);
    expect(exec).toHaveBeenCalledWith("copy");
    expect(document.querySelector("textarea")).toBeNull(); // the helper textarea is cleaned up
    exec.mockReturnValue(false);
    expect(await copyText("abc")).toBe(false);
  });
});

describe("Receive dialog", () => {
  const token = { symbol: "USDT" } as Token;
  const ADDRESS = "TC9kD9YUpyHYQDfeoq1P12S8J3ZhNrYF3h";
  function mount() {
    document.body.innerHTML = "";
    const frame = document.createElement("div");
    frame.className = "phone-frame";
    const screen = document.createElement("div");
    frame.append(screen);
    document.body.append(frame);
    const dialog = openReceiveDialog({ frame, screen, chromeStyle: "ios", token, networkName: "Tron", address: ADDRESS });
    return { frame, screen, dialog };
  }
  afterEach(() => vi.unstubAllGlobals());

  it("shows the title, network, QR, the full address and a demo-only note", () => {
    const { frame, screen } = mount();
    expect(frame.querySelector(".phone-dialog-title")!.textContent).toBe("Receive USDT");
    expect(frame.querySelector(".phone-dialog-body")!.textContent).toBe("Network: Tron");
    expect(frame.querySelector(".receive-qr")).not.toBeNull();
    expect(frame.querySelector(".receive-address")!.textContent).toBe(ADDRESS);
    expect(frame.querySelector(".receive-note")!.textContent).toContain("Demo address, not for real funds");
    expect(screen.hasAttribute("inert")).toBe(true);
  });

  it("Copy address copies the address and confirms; Close restores the screen", async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const { frame, screen } = mount();
    const [copy, close] = [...frame.querySelectorAll<HTMLButtonElement>(".phone-dialog-btn")];
    expect(copy!.textContent).toBe("Copy address");
    copy!.click();
    await vi.waitFor(() => expect(copy!.textContent).toBe("Copied ✓"));
    expect(writeText).toHaveBeenCalledWith(ADDRESS);
    expect(frame.querySelector(".receive-status")!.textContent).toBe("Address copied");
    close!.click();
    expect(frame.querySelector(".phone-overlay")).toBeNull();
    expect(screen.hasAttribute("inert")).toBe(false);
  });

  it("says so when copying fails, and Esc closes the dialog", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn(async () => { throw new Error("denied"); }) } });
    Object.defineProperty(document, "execCommand", { value: () => false, configurable: true, writable: true });
    const { frame } = mount();
    frame.querySelector<HTMLButtonElement>(".phone-dialog-btn")!.click();
    await vi.waitFor(() => expect(frame.querySelector(".receive-status")!.textContent).toContain("Copy failed"));
    frame.querySelector(".phone-overlay")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(frame.querySelector(".phone-overlay")).toBeNull();
    Object.defineProperty(document, "execCommand", { value: undefined, configurable: true, writable: true });
  });
});
