import { describe, it, expect } from "vitest";
import { logoForEntityName, normalizeEntityName } from "../src/send/known-entities.ts";
import { sanitizeLogoUrl } from "../src/send/entity-logo.ts";

describe("known exchange logos", () => {
  it("normalizes names: case, punctuation, spaces and a trailing 'Exchange'", () => {
    expect(normalizeEntityName("Crypto.com Exchange")).toBe("cryptocom");
    expect(normalizeEntityName("  OKX ")).toBe("okx");
    expect(normalizeEntityName("Gate.io")).toBe("gateio");
  });
  it.each([
    ["Binance", "binance-com"],
    ["OKX", "okx-com"],
    ["Bybit", "bybit-com"],
    ["Bitget", "bitget-com"],
    ["HTX", "htx-com-huobi-com"],
    ["Huobi", "htx-com-huobi-com"],
    ["Crypto.com", "crypto-com"],
    ["Gate.io", "gate-io"],
    ["Rapira", "rapira-net"],
  ])("%s has a logo (%s)", (name, file) => {
    expect(logoForEntityName(name)).toBe(`https://cdn.jsdelivr.net/gh/maslovsa/kyt-entity-registry@main/logos/exchanges/${file}.png`);
  });
  it("an unknown name has none, and every URL in the table is acceptable to the logo sanitizer", () => {
    expect(logoForEntityName("Nobody Exchange")).toBeUndefined();
    for (const name of ["Binance", "OKX", "Bybit", "Bitget", "MEXC", "Coinbase", "Kraken", "KuCoin", "Upbit", "Bithumb", "Gemini", "Bitstamp", "BingX", "Poloniex", "Deribit", "BitMEX", "WhiteBIT", "Bitpanda", "Bitvavo", "LBank", "Phemex", "CoinEx", "BitMart", "Kuna"]) {
      const url = logoForEntityName(name)!;
      expect(sanitizeLogoUrl(url), name).toBe(url);
      expect(sanitizeLogoUrl(url, true), name).toBe(url); // and no risk wording in the path
    }
  });
});
