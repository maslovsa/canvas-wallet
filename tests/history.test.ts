import { describe, it, expect } from "vitest";
import { generateHistory, formatAmount } from "../src/widgets/history.ts";

describe("generateHistory", () => {
  it("is deterministic for the same seed", () => {
    expect(generateHistory("USDC:0x1")).toEqual(generateHistory("USDC:0x1"));
  });

  it("differs across seeds (not a constant feed)", () => {
    expect(generateHistory("USDC:0x1")).not.toEqual(generateHistory("USDT:0x2"));
  });

  it("caps every event's usd value between $1 and $100", () => {
    for (const event of generateHistory("stress-test-seed", 20)) {
      expect(event.usd).toBeGreaterThanOrEqual(1);
      expect(event.usd).toBeLessThanOrEqual(100);
    }
  });

  it("only ever produces \"in\" or \"out\" directions with a positive amount", () => {
    for (const event of generateHistory("direction-check", 20)) {
      expect(["in", "out"]).toContain(event.direction);
      expect(event.amount).toBeGreaterThan(0);
    }
  });

  it("respects the requested count", () => {
    expect(generateHistory("count-check", 3)).toHaveLength(3);
  });

  it("keeps amount and usd roughly 1:1 for stablecoins, so it never contradicts a real '1 X = 1 USD' row", () => {
    for (const event of generateHistory("stablecoin-seed", 20, true)) {
      const impliedUnitPrice = event.usd / event.amount;
      expect(impliedUnitPrice).toBeGreaterThan(0.9);
      expect(impliedUnitPrice).toBeLessThan(1.1);
    }
  });
});

describe("formatAmount", () => {
  it("shows two decimals for amounts in the 1-999 range", () => {
    expect(formatAmount(12.3456)).toBe("12.35");
  });

  it("drops decimals for large amounts", () => {
    expect(formatAmount(15000)).toBe("15000");
  });

  it("uses more precision for sub-1 amounts", () => {
    expect(formatAmount(0.0001234)).toBe("0.00012");
  });
});
