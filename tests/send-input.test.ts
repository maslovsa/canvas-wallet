import { describe, it, expect } from "vitest";
import { parseAmount, formatUnits, maxSendable } from "../src/send/send-input.ts";

describe("parseAmount", () => {
  const ok: Array<[string, number, bigint]> = [
    ["10.5", 6, 10_500_000n],
    ["10", 6, 10_000_000n],
    ["0.000001", 6, 1n],
    [".5", 6, 500_000n],
    ["5.", 6, 5_000_000n],
    ["1.50", 1, 15n], // trailing zeros carry no value
    ["  7 ", 0, 7n],
    ["1", 76, 10n ** 76n],
    ["0." + "0".repeat(254) + "1", 255, 1n], // the maximum allowed decimals
    ["123456789012345678901234567890.123456", 6, 123456789012345678901234567890123456n],
  ];
  it.each(ok)("parses %s at %i decimals", (input, decimals, units) => {
    expect(parseAmount(input, decimals)).toEqual({ ok: true, units });
  });

  const bad: Array<[string, number, string]> = [
    ["", 6, "empty"],
    ["   ", 6, "empty"],
    ["-1", 6, "format"],
    ["+1", 6, "format"],
    ["abc", 6, "format"],
    ["1e3", 6, "format"],
    ["1,5", 6, "format"],
    ["1 000", 6, "format"],
    [".", 6, "format"],
    ["1.2.3", 6, "format"],
    ["0x10", 6, "format"],
    ["1.0000001", 6, "too_many_decimals"],
    ["1.5", 0, "too_many_decimals"],
    ["0", 6, "zero"],
    ["0.000000", 6, "zero"],
  ];
  it.each(bad)("rejects %j at %i decimals as %s", (input, decimals, reason) => {
    expect(parseAmount(input, decimals)).toEqual({ ok: false, reason });
  });

  it("rejects amounts above uint256, including 10^255 units from a large decimals value", () => {
    expect(parseAmount("1", 255)).toEqual({ ok: false, reason: "too_large" });

    const tooBig = (2n ** 256n).toString();
    expect(parseAmount(tooBig, 0)).toEqual({ ok: false, reason: "too_large" });
    expect(parseAmount((2n ** 256n - 1n).toString(), 0)).toEqual({ ok: true, units: 2n ** 256n - 1n });
  });

  it("refuses an invalid decimals value instead of computing garbage", () => {
    expect(() => parseAmount("1", -1)).toThrow(RangeError);
    expect(() => parseAmount("1", 256)).toThrow(RangeError);
    expect(() => parseAmount("1", 1.5)).toThrow(RangeError);
  });
});

describe("formatUnits", () => {
  it("round-trips with parseAmount and trims trailing zeros", () => {
    expect(formatUnits(10_500_000n, 6)).toBe("10.5");
    expect(formatUnits(10_000_000n, 6)).toBe("10");
    expect(formatUnits(1n, 6)).toBe("0.000001");
    expect(formatUnits(0n, 6)).toBe("0");
    expect(formatUnits(7n, 0)).toBe("7");
    const parsed = parseAmount("123.456789", 6);
    expect(parsed.ok && formatUnits(parsed.units, 6)).toBe("123.456789");
  });
});

describe("maxSendable", () => {
  it("token: the whole balance (the fee is paid in TRX)", () => {
    expect(maxSendable(120_000_000n, 6_400_000n, false)).toBe(120_000_000n);
  });
  it("native coin: balance minus fee, never below zero", () => {
    expect(maxSendable(100_000_000n, 6_400_000n, true)).toBe(93_600_000n);
    expect(maxSendable(1_000_000n, 6_400_000n, true)).toBe(0n);
    expect(maxSendable(6_400_000n, 6_400_000n, true)).toBe(0n);
  });
});
