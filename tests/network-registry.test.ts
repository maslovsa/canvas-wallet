import { describe, it, expect, vi } from "vitest";
import { findNetworkInfo, loadNetworkRegistry, type NetworkInfo } from "../src/networks/network-registry.ts";

const networks: NetworkInfo[] = [
  { canonicalName: "Ethereum", synonyms: ["ethereum", "eth", "mainnet"], logo: "https://example.com/eth.png" },
  { canonicalName: "BNB Smart Chain", synonyms: ["bsc", "smartchain"], logo: "https://example.com/bsc.png" },
];

describe("findNetworkInfo", () => {
  it("matches by canonicalName, case-insensitively", () => {
    expect(findNetworkInfo(networks, "ethereum")?.canonicalName).toBe("Ethereum");
    expect(findNetworkInfo(networks, "ETHEREUM")?.canonicalName).toBe("Ethereum");
  });

  it("matches by any synonym", () => {
    expect(findNetworkInfo(networks, "bsc")?.canonicalName).toBe("BNB Smart Chain");
    expect(findNetworkInfo(networks, "smartchain")?.canonicalName).toBe("BNB Smart Chain");
  });

  it("returns undefined for an unrecognized network name rather than guessing", () => {
    expect(findNetworkInfo(networks, "some-unknown-chain")).toBeUndefined();
  });
});

describe("loadNetworkRegistry", () => {
  it("returns an empty array (not a throw) if the fetch fails", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("network error"));
    const result = await loadNetworkRegistry(fetchImpl);
    expect(result).toEqual([]);
  });

  it("returns an empty array if the response is not ok", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false });
    const result = await loadNetworkRegistry(fetchImpl);
    expect(result).toEqual([]);
  });
});
