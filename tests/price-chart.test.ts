import { describe, it, expect, vi } from "vitest";
import { fetchPriceHistory, generatePlaceholderSeries, buildSparkline } from "../src/widgets/price-chart.ts";

describe("fetchPriceHistory", () => {
  it("returns the flattened price series on a successful fetch", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        prices: [
          [1000, 100],
          [2000, 105],
          [3000, 98],
        ],
      }),
    });
    const prices = await fetchPriceHistory("tron", 1, fetchImpl);
    expect(prices).toEqual([100, 105, 98]);
    expect(fetchImpl).toHaveBeenCalledWith(expect.stringContaining("/coins/tron/market_chart"));
  });

  it("URL-encodes the coingeckoId into the request path", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ prices: [[0, 1]] }) });
    await fetchPriceHistory("weird id/../x", 7, fetchImpl);
    const calledUrl = fetchImpl.mock.calls[0]![0] as string;
    expect(calledUrl).not.toContain("../");
    expect(calledUrl).toContain(encodeURIComponent("weird id/../x"));
  });

  it("falls back to null on a non-ok response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 429 });
    const prices = await fetchPriceHistory("rate-limited-coin", 1, fetchImpl);
    expect(prices).toBeNull();
  });

  it("falls back to null on a network error, never throws", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("offline"));
    const prices = await fetchPriceHistory("offline-coin", 1, fetchImpl);
    expect(prices).toBeNull();
  });

  it("caches by coingeckoId+days — a second call for the same pair does not refetch", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ prices: [[0, 1], [1, 2]] }) });
    await fetchPriceHistory("cached-coin", 1, fetchImpl);
    await fetchPriceHistory("cached-coin", 1, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("generatePlaceholderSeries", () => {
  it("is deterministic for the same seed", () => {
    expect(generatePlaceholderSeries("tron")).toEqual(generatePlaceholderSeries("tron"));
  });

  it("differs across seeds (not a constant series)", () => {
    expect(generatePlaceholderSeries("tron")).not.toEqual(generatePlaceholderSeries("ethereum"));
  });

  it("never produces a non-positive price", () => {
    for (const price of generatePlaceholderSeries("stress-test-seed")) {
      expect(price).toBeGreaterThan(0);
    }
  });
});

describe("buildSparkline", () => {
  it("reports rising when the last price is above the first", () => {
    const result = buildSparkline([100, 90, 120], 260, 56);
    expect(result.isRising).toBe(true);
    expect(result.changePct).toBeCloseTo(20, 5);
    expect(result.latest).toBe(120);
  });

  it("reports falling when the last price is below the first", () => {
    const result = buildSparkline([100, 110, 80], 260, 56);
    expect(result.isRising).toBe(false);
    expect(result.changePct).toBeCloseTo(-20, 5);
  });

  it("produces an SVG path starting with M and one point per price", () => {
    const result = buildSparkline([1, 2, 3, 4], 100, 50);
    expect(result.pathD.startsWith("M")).toBe(true);
    expect(result.pathD.split("L").length).toBe(4);
  });
});
