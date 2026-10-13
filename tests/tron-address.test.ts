import { describe, it, expect } from "vitest";
import { webcrypto } from "node:crypto";
import { validateTronAddress, isValidTronAddress } from "../src/send/tron-address.ts";

// Pass node's WebCrypto explicitly so the table does not depend on the test environment's globals.
const subtle = webcrypto.subtle as SubtleCrypto;

const USDT_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const OTHER_VALID = ["TMuA6YqfCeX8EhbfYEg5y7S4DqzSJireY9", "TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7", "TJDENsfBJs4RFETt1X1W8wMDc8M5XnJhCe"];

// Shared by the phone and the Worker (plan E9): one table protects both.
describe("validateTronAddress", () => {
  it("accepts real Tron addresses (the USDT contract and other mainnet accounts)", async () => {
    for (const address of [USDT_CONTRACT, ...OTHER_VALID]) {
      expect(await validateTronAddress(address, subtle)).toEqual({ ok: true });
    }
  });

  const flipLast = (address: string) => address.slice(0, -1) + (address.endsWith("j") ? "k" : "j");

  const rejected: Array<[string, string, string]> = [
    ["empty string", "", "empty"],
    ["one character short (33)", USDT_CONTRACT.slice(0, -1), "length"],
    ["one character long (35)", USDT_CONTRACT + "A", "length"],
    ["flipped last character (bad checksum)", flipLast(USDT_CONTRACT), "checksum"],
    ["a swapped pair in the middle (bad checksum)", USDT_CONTRACT.slice(0, 10) + USDT_CONTRACT[11] + USDT_CONTRACT[10] + USDT_CONTRACT.slice(12), "checksum"],
    ["contains 0 (not in the Base58 alphabet)", "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6" + "0", "charset"],
    ["contains O", "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6" + "O", "charset"],
    ["contains I", "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6" + "I", "charset"],
    ["contains l", "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6" + "l", "charset"],
    ["leading space", " " + USDT_CONTRACT.slice(0, -1), "charset"],
    ["trailing newline", USDT_CONTRACT.slice(0, -1) + "\n", "charset"],
    ["a valid Bitcoin address (34 chars, valid Base58Check, wrong prefix)", "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa", "prefix"],
    ["an Ethereum hex address", "0x52908400098527886E0F7030069857D2E4169EE7", "length"],
  ];

  it.each(rejected)("rejects %s", async (_label, input, reason) => {
    expect(await validateTronAddress(input, subtle)).toEqual({ ok: false, reason });
  });

  it("without WebCrypto it blocks instead of skipping the checksum (never reports valid)", async () => {
    expect(await validateTronAddress(USDT_CONTRACT, null)).toEqual({ ok: false, reason: "no_crypto" });
  });

  it("cheap checks still run first when WebCrypto is missing (length, charset)", async () => {
    expect(await validateTronAddress("abc", null)).toEqual({ ok: false, reason: "length" });
  });

  it("isValidTronAddress is the boolean form", async () => {
    expect(await isValidTronAddress(USDT_CONTRACT, subtle)).toBe(true);
    expect(await isValidTronAddress(flipLast(USDT_CONTRACT), subtle)).toBe(false);
  });
});
