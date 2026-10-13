import { describe, it, expect } from "vitest";
import { parseStudioQuery, buildStudioQuery, findByName } from "../src/share-link/studio-url.ts";

describe("parseStudioQuery", () => {
  it("reads list, network and token", () => {
    expect(parseStudioQuery("?list=aegis-super-list&network=Tron&token=USDT")).toEqual({ list: "aegis-super-list", network: "Tron", token: "USDT" });
  });
  it("treats missing and empty values as absent and ignores other parameters", () => {
    expect(parseStudioQuery("")).toEqual({});
    expect(parseStudioQuery("?list=&network=%20&registry=a/b")).toEqual({});
    expect(parseStudioQuery("?token=USDT")).toEqual({ token: "USDT" });
  });
  it("decodes percent-encoding", () => {
    expect(parseStudioQuery("?network=Binance%20Smart%20Chain")).toEqual({ network: "Binance Smart Chain" });
  });
});

describe("buildStudioQuery", () => {
  it("sets the three keys", () => {
    expect(buildStudioQuery("", { list: "aegis-super-list", network: "Tron", token: "USDT" })).toBe("?list=aegis-super-list&network=Tron&token=USDT");
  });
  it("drops keys that are no longer set and returns an empty string when nothing is left", () => {
    expect(buildStudioQuery("?list=x&network=Tron&token=USDT", { list: "x", network: "Tron" })).toBe("?list=x&network=Tron");
    expect(buildStudioQuery("?list=x&network=Tron&token=USDT", {})).toBe("");
  });
  it("keeps unrelated parameters", () => {
    expect(buildStudioQuery("?registry=owner/repo&utm=1", { list: "x" })).toBe("?registry=owner%2Frepo&utm=1&list=x");
    expect(buildStudioQuery("?utm=1&list=x", {})).toBe("?utm=1");
  });
  it("encodes values and round-trips", () => {
    const q = buildStudioQuery("", { list: "a b", network: "Binance Smart Chain", token: "A&B" });
    expect(parseStudioQuery(q)).toEqual({ list: "a b", network: "Binance Smart Chain", token: "A&B" });
  });
});

describe("findByName", () => {
  const items = [{ name: "Ethereum" }, { name: "Tron" }];
  it("matches case-insensitively and returns the original item", () => {
    expect(findByName(items, "tron", (i) => i.name)).toBe(items[1]);
  });
  it("returns undefined for unknown or missing names", () => {
    expect(findByName(items, "Solana", (i) => i.name)).toBeUndefined();
    expect(findByName(items, undefined, (i) => i.name)).toBeUndefined();
  });
});
