import { describe, it, expect } from "vitest";
import { webcrypto } from "node:crypto";
import { validateEvmAddress, validateTonAddress } from "../src/send/address-checks.ts";
import { validateNetworkAddress, normalizeAddress, isNetworkId, ADDRESS_LENGTH, NETWORK_IDS } from "../src/send/network-id.ts";

const subtle = webcrypto.subtle as SubtleCrypto;
const EVM = "0xdAC17F958D2ee523a2206206994597C13D831ec7"; // USDT, EIP-55
const TRON = "TAzsQ9Gx8eqFNFSKbeXrbi45CuVPHzA8wr";
const TON = "UQDKHZ7e70CzqdvZCC83Z4WVR8POC_ZB0J1Y4zo88G-zCSRH";
const TON_EQ = "EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs";

describe("validateEvmAddress", () => {
  it("accepts a checksummed, an all-lowercase and an all-uppercase address", () => {
    expect(validateEvmAddress(EVM)).toEqual({ ok: true });
    expect(validateEvmAddress(EVM.toLowerCase())).toEqual({ ok: true });
    expect(validateEvmAddress("0x" + EVM.slice(2).toUpperCase())).toEqual({ ok: true });
  });
  it.each([
    ["empty", "", "empty"],
    ["no 0x", EVM.slice(2), "prefix"],
    ["a Tron address", TRON, "prefix"],
    ["too short", EVM.slice(0, -1), "length"],
    ["too long", EVM + "0", "length"],
    ["a non-hex character", EVM.slice(0, -1) + "g", "charset"],
    ["a wrong checksum case", "0xdAC17F958D2ee523a2206206994597C13D831eC7", "checksum"],
  ])("refuses %s", (_n, address, reason) => {
    expect(validateEvmAddress(address)).toEqual({ ok: false, reason });
  });
});

describe("validateTonAddress", () => {
  it("accepts the user-friendly form (UQ non-bounceable, EQ bounceable)", () => {
    expect(validateTonAddress(TON)).toEqual({ ok: true });
    expect(validateTonAddress(TON_EQ)).toEqual({ ok: true });
  });
  it.each([
    ["empty", "", "empty"],
    ["too short", TON.slice(0, -1), "length"],
    ["a bad character", TON.slice(0, -1) + "!", "charset"],
    ["a changed character (checksum)", TON.slice(0, -1) + "A", "checksum"],
    ["an EVM address", EVM, "length"],
  ])("refuses %s", (_n, address, reason) => {
    expect(validateTonAddress(address)).toEqual({ ok: false, reason });
  });
});

describe("network ids", () => {
  it("validates for the right network only", async () => {
    expect((await validateNetworkAddress("TRON", TRON, subtle)).ok).toBe(true);
    expect((await validateNetworkAddress("ETH", EVM)).ok).toBe(true);
    expect((await validateNetworkAddress("BSC", EVM)).ok).toBe(true);
    expect((await validateNetworkAddress("TON", TON)).ok).toBe(true);
    for (const [network, address] of [["TRON", EVM], ["ETH", TON], ["BSC", TRON], ["TON", TRON]] as const) {
      expect((await validateNetworkAddress(network, address, subtle)).ok, `${network} ${address}`).toBe(false);
    }
    expect(await validateNetworkAddress("TRON", TRON, null)).toEqual({ ok: false, reason: "no_crypto" });
  });
  it("normalizes EVM addresses to lower case and leaves the others alone", () => {
    expect(normalizeAddress("ETH", EVM)).toBe(EVM.toLowerCase());
    expect(normalizeAddress("BSC", EVM)).toBe(EVM.toLowerCase());
    expect(normalizeAddress("TRON", TRON)).toBe(TRON);
    expect(normalizeAddress("TON", TON)).toBe(TON);
  });
  it("knows its ids and address lengths", () => {
    expect(NETWORK_IDS).toEqual(["TRON", "ETH", "BSC", "TON"]);
    expect(isNetworkId("TON")).toBe(true);
    expect(isNetworkId("SOL")).toBe(false);
    expect(Object.values(ADDRESS_LENGTH)).toEqual([34, 42, 42, 48]);
  });
});
