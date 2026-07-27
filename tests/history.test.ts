import { describe, it, expect } from "vitest";
import { generateHistory, formatAmount, formatHistoryTimestamp } from "../src/widgets/history.ts";

// Fixed reference "now" everywhere below — generateHistory's timestamps are
// offsets from `now`, so pinning it keeps every assertion (including
// determinism) independent of the real wall clock.
const NOW = new Date("2026-07-27T12:00:00Z").getTime();
const DAY_MS = 24 * 60 * 60 * 1000;

describe("generateHistory", () => {
  it("is deterministic for the same seed and now", () => {
    expect(generateHistory("USDC:0x1", 5, false, NOW)).toEqual(generateHistory("USDC:0x1", 5, false, NOW));
  });

  it("differs across seeds (not a constant feed)", () => {
    expect(generateHistory("USDC:0x1", 5, false, NOW)).not.toEqual(generateHistory("USDT:0x2", 5, false, NOW));
  });

  it("caps every event's usd value between $1 and $100", () => {
    for (const event of generateHistory("stress-test-seed", 20, false, NOW)) {
      expect(event.usd).toBeGreaterThanOrEqual(1);
      expect(event.usd).toBeLessThanOrEqual(100);
    }
  });

  it("only ever produces \"in\" or \"out\" directions with a positive amount", () => {
    for (const event of generateHistory("direction-check", 20, false, NOW)) {
      expect(["in", "out"]).toContain(event.direction);
      expect(event.amount).toBeGreaterThan(0);
    }
  });

  it("respects the requested count", () => {
    expect(generateHistory("count-check", 3, false, NOW)).toHaveLength(3);
  });

  it("keeps amount and usd roughly 1:1 for stablecoins, so it never contradicts a real '1 X = 1 USD' row", () => {
    for (const event of generateHistory("stablecoin-seed", 20, true, NOW)) {
      const impliedUnitPrice = event.usd / event.amount;
      expect(impliedUnitPrice).toBeGreaterThan(0.9);
      expect(impliedUnitPrice).toBeLessThan(1.1);
    }
  });

  it("keeps every timestamp in the past, within the last several days of `now`", () => {
    for (const event of generateHistory("time-range-check", 20, false, NOW)) {
      expect(event.timestamp).toBeLessThanOrEqual(NOW);
      expect(event.timestamp).toBeGreaterThan(NOW - 8 * DAY_MS);
    }
  });

  it("orders events newest-first by timestamp", () => {
    const events = generateHistory("order-check", 10, false, NOW);
    for (let i = 1; i < events.length; i++) {
      expect(events[i - 1]!.timestamp).toBeGreaterThanOrEqual(events[i]!.timestamp);
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

describe("formatHistoryTimestamp", () => {
  it("renders a non-empty, human-readable date/time string", () => {
    const formatted = formatHistoryTimestamp(NOW);
    expect(formatted.length).toBeGreaterThan(0);
    expect(formatted).toMatch(/\d/);
  });
});
