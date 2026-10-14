import { describe, it, expect } from "vitest";
import { webcrypto } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { prepareSend, toUnits, REFUSAL_UNSUPPORTED, REFUSAL_NO_CRYPTO } from "../src/send/send-token.ts";
import type { Token } from "../src/types.ts";

const subtle = webcrypto.subtle as SubtleCrypto;
const base = { name: "Tether USD", symbol: "USDT", decimals: 6, status: "active" as const };
const usdt: Token = { ...base, type: "TRC20", id: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t", tags: ["stablecoin"] };
const trx: Token = { name: "Tron", symbol: "TRX", type: "NATIVE", id: "native", decimals: 6, status: "active" };

describe("prepareSend", () => {
  it("opens for a Tron TRC20 token and for native TRX", async () => {
    const a = await prepareSend(usdt, "Tron", subtle);
    expect(a.ok && a.info).toMatchObject({ key: "TRON:TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t", network: "TRON", isNative: false, contract: usdt.id, decimals: 6 });
    const b = await prepareSend(trx, "Tron", subtle);
    expect(b.ok && b.info).toMatchObject({ isNative: true, contract: "native" });
  });

  it("refuses a network it has no profile for, explicitly", async () => {
    expect(await prepareSend(usdt, "Polygon", subtle)).toEqual({ ok: false, message: REFUSAL_UNSUPPORTED });
    expect(await prepareSend(usdt, "Solana", subtle)).toEqual({ ok: false, message: REFUSAL_UNSUPPORTED });
    expect(await prepareSend(usdt, undefined, subtle)).toEqual({ ok: false, message: REFUSAL_UNSUPPORTED });
  });

  it("a TRC20 token is not sendable on Ethereum, and the other way round", async () => {
    expect(await prepareSend(usdt, "Ethereum", subtle)).toEqual({ ok: false, message: REFUSAL_UNSUPPORTED });
    const erc20: Token = { ...base, type: "ERC20", id: "0xdAC17F958D2ee523a2206206994597C13D831ec7" };
    expect(await prepareSend(erc20, "Tron", subtle)).toEqual({ ok: false, message: REFUSAL_UNSUPPORTED });
  });

  it("opens on Ethereum, BNB Smart Chain and TON, with each network's native coin for the fee", async () => {
    const erc20: Token = { ...base, type: "ERC20", id: "0xdAC17F958D2ee523a2206206994597C13D831ec7" };
    const eth = await prepareSend(erc20, "Ethereum", subtle);
    expect(eth.ok && eth.info).toMatchObject({ key: "ETH:0xdAC17F958D2ee523a2206206994597C13D831ec7", network: "ETH", nativeBalanceUnits: 500_000_000_000_000_000n });
    const bep20: Token = { ...base, type: "BEP20", id: "0x55d398326f99059fF775485246999027B3197955", decimals: 18 };
    const bsc = await prepareSend(bep20, "BNB Smart Chain", subtle);
    expect(bsc.ok && bsc.info).toMatchObject({ network: "BSC", nativeBalanceUnits: 1_000_000_000_000_000_000n });
    const jetton: Token = { ...base, type: "JETTON", id: "EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs" };
    const ton = await prepareSend(jetton, "TON", subtle);
    expect(ton.ok && ton.info).toMatchObject({ network: "TON", nativeBalanceUnits: 100_000_000_000n });
    const gram: Token = { name: "Gram", symbol: "GRAM", type: "NATIVE", id: "native", decimals: 9, status: "active" };
    expect((await prepareSend(gram, "TON", subtle)).ok).toBe(true);
  });

  it("refuses a token whose id is not a valid address for ITS network", async () => {
    const bad: Token = { ...base, type: "ERC20", id: "0xdAC17F958D2ee523a2206206994597C13D831eC7" }; // wrong EIP-55 case
    expect(await prepareSend(bad, "Ethereum", subtle)).toEqual({ ok: false, message: REFUSAL_UNSUPPORTED });
    expect(await prepareSend({ ...bad, id: usdt.id }, "Ethereum", subtle)).toEqual({ ok: false, message: REFUSAL_UNSUPPORTED });
    const tonBad: Token = { ...base, type: "JETTON", id: "EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDA" };
    expect(await prepareSend(tonBad, "TON", subtle)).toEqual({ ok: false, message: REFUSAL_UNSUPPORTED });
  });

  it("every token of every shipped list on a supported network can be sent (a list never ships a token Send then refuses)", async () => {
    const names: Record<string, string> = { Ethereum: "Ethereum", BSC: "BNB Smart Chain", Tron: "Tron", TON: "TON" };
    // (trust-wallet-showcase.json is skipped: it has hand-made placeholder contracts such as 0x...dEaD, which Send rightly refuses)
    const refused: string[] = [];
    let checked = 0;
    for (const file of readdirSync("public/lists").filter((f) => f.endsWith(".json") && f !== "manifest.json" && f !== "trust-wallet-showcase.json")) {
      const list = JSON.parse(readFileSync(`public/lists/${file}`, "utf8")) as { networks: Array<{ name: string; tokens: Token[] }> };
      for (const network of list.networks) {
        const canonical = names[network.name];
        if (!canonical) continue; // Solana: not supported by Send
        for (const token of network.tokens) {
          checked += 1;
          const result = await prepareSend(token, canonical, subtle);
          if (!result.ok) refused.push(`${file} ${network.name} ${token.symbol} ${token.type} ${token.id}`);
        }
      }
    }
    expect(refused).toEqual([]);
    expect(checked).toBeGreaterThan(60);
  });

  it("refuses token types it cannot handle (TRC10, ERC20...)", async () => {
    expect(await prepareSend({ ...usdt, type: "TRC10" }, "Tron", subtle)).toEqual({ ok: false, message: REFUSAL_UNSUPPORTED });
    expect(await prepareSend({ ...usdt, type: "ERC20" }, "Tron", subtle)).toEqual({ ok: false, message: REFUSAL_UNSUPPORTED });
  });

  it("refuses a TRC20 whose registry-controlled id is not a valid Tron address (no request is ever built from it)", async () => {
    expect(await prepareSend({ ...usdt, id: "not-an-address" }, "Tron", subtle)).toEqual({ ok: false, message: REFUSAL_UNSUPPORTED });
    expect(await prepareSend({ ...usdt, id: usdt.id.slice(0, -1) + "j" }, "Tron", subtle)).toEqual({ ok: false, message: REFUSAL_UNSUPPORTED });
  });

  it("without WebCrypto it says so instead of skipping the check", async () => {
    expect(await prepareSend(usdt, "Tron", null)).toEqual({ ok: false, message: REFUSAL_NO_CRYPTO });
    // native TRX has no contract to validate
    expect((await prepareSend(trx, "Tron", null)).ok).toBe(true);
  });

  it("the illustrative balance is stable for a token and a token send gets the demo TRX balance", async () => {
    const a = await prepareSend(usdt, "Tron", subtle);
    const b = await prepareSend(usdt, "Tron", subtle);
    expect(a.ok && b.ok && a.info.balanceUnits === b.info.balanceUnits).toBe(true);
    expect(a.ok && a.info.nativeBalanceUnits).toBe(250_000_000n);
  });
});

describe("toUnits", () => {
  it("keeps up to 6 decimals of the illustrative float and pads the rest", () => {
    expect(toUnits(120.5, 6)).toBe(120_500_000n);
    expect(toUnits(1.5, 18)).toBe(1_500_000n * 10n ** 12n);
    expect(toUnits(7.9, 0)).toBe(7n);
  });
});
