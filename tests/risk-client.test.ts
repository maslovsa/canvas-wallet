import { describe, it, expect, beforeEach } from "vitest";
import {
  validateSeedShape,
  parseSeed,
  seedLookup,
  loadSeed,
  resetSeedCache,
  checkAddress,
  type SeedEntry,
} from "../src/send/risk-client.ts";

const A = "TMuA6YqfCeX8EhbfYEg5y7S4DqzSJireY9";
const B = "TJDENsfBJs4RFETt1X1W8wMDc8M5XnJhCe";
const C = "THJUJFyTnrBWb1ijWav7qfRBrjUuKgP49Z";
const NOW = new Date("2026-10-20T00:00:00Z");

const seed: SeedEntry[] = [
  { network: "TRON", address: A, level: "clear", label: "Binance", checkedAt: "2026-10-13" },
  { network: "TRON", address: B, level: "clear", checkedAt: "2026-10-13" },
  { network: "TRON", address: C, level: "caution", checkedAt: "2026-10-13" },
];

describe("seedLookup", () => {
  it("maps entries to the three client results", () => {
    expect(seedLookup(seed, A, NOW)).toEqual({ state: "clear", label: "Binance" });
    expect(seedLookup(seed, B, NOW)).toEqual({ state: "clear" });
    expect(seedLookup(seed, C, NOW)).toEqual({ state: "caution" });
  });

  it("a caution result carries no label and no other keys", () => {
    expect(Object.keys(seedLookup(seed, C, NOW)!)).toEqual(["state"]);
  });

  it("an unknown address is a miss (null), never 'clear'", () => {
    expect(seedLookup(seed, "T" + "x".repeat(33), NOW)).toBeNull();
  });

  it("entries older than 90 days count as a miss; exactly 90 days still counts", () => {
    expect(seedLookup(seed, A, new Date("2027-01-11T00:00:00Z"))).toEqual({ state: "clear", label: "Binance" }); // 90 days
    expect(seedLookup(seed, A, new Date("2027-01-12T00:00:00Z"))).toBeNull(); // 91 days
  });
});

describe("validateSeedShape / parseSeed", () => {
  it("accepts the expected shape", () => {
    expect(validateSeedShape({ version: 1, entries: seed })).toEqual([]);
  });

  it("rejects stored scores or reasons, a label on caution, duplicates and bad dates", () => {
    const errors = validateSeedShape({
      version: 1,
      entries: [
        { network: "TRON", address: A, level: "clear", checkedAt: "2026-10-13", risk_score: 88 },
        { network: "TRON", address: B, level: "caution", label: "Mixer X", checkedAt: "2026-10-13" },
        { network: "TRON", address: B, level: "clear", checkedAt: "13/10/2026" },
      ],
    });
    expect(errors.join("\n")).toContain("scores and reasons must never be stored");
    expect(errors.join("\n")).toContain("a caution entry must not carry a label");
    expect(errors.join("\n")).toContain("duplicate address");
    expect(errors.join("\n")).toContain("checkedAt must be a YYYY-MM-DD date");
  });

  it("parseSeed drops malformed entries and never throws", () => {
    expect(parseSeed(null)).toEqual([]);
    expect(parseSeed({ entries: "nope" })).toEqual([]);
    expect(parseSeed({ version: 1, entries: [seed[0], { address: "short" }, 42] })).toEqual([seed[0]]);
  });
});

describe("loadSeed", () => {
  beforeEach(resetSeedCache);

  it("fetches {BASE_URL}risk-seed.json (sub-path deploys), once", async () => {
    const urls: string[] = [];
    const fetchImpl = (async (url: string) => {
      urls.push(url);
      return new Response(JSON.stringify({ version: 1, entries: seed }));
    }) as unknown as typeof fetch;
    const first = await loadSeed(fetchImpl, "/canvas-wallet/");
    await loadSeed(fetchImpl, "/canvas-wallet/");
    expect(urls).toEqual(["/canvas-wallet/risk-seed.json"]);
    expect(first).toHaveLength(3);
  });

  it("a failed or non-OK fetch yields an empty seed instead of throwing", async () => {
    expect(await loadSeed((async () => new Response("", { status: 404 })) as unknown as typeof fetch, "/")).toEqual([]);
    resetSeedCache();
    expect(await loadSeed((async () => { throw new Error("offline"); }) as unknown as typeof fetch, "/")).toEqual([]);
  });
});

describe("checkAddress (seed-only)", () => {
  it("answers from the seed and reports everything else as unavailable, never as safe", async () => {
    expect(await checkAddress(A, { seed, now: NOW })).toEqual({ state: "clear", label: "Binance" });
    expect(await checkAddress(C, { seed, now: NOW })).toEqual({ state: "caution" });
    expect(await checkAddress("T" + "y".repeat(33), { seed, now: NOW })).toEqual({ state: "unavailable" });
  });
});
