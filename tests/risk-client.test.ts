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

import { parseProxyAnswer, proxyCheck } from "../src/send/risk-client.ts";

describe("parseProxyAnswer (strict)", () => {
  it("accepts exactly the three documented shapes", () => {
    expect(parseProxyAnswer({ level: "clear" })).toEqual({ state: "clear" });
    expect(parseProxyAnswer({ level: "clear", label: "Binance" })).toEqual({ state: "clear", label: "Binance" });
    expect(parseProxyAnswer({ level: "caution" })).toEqual({ state: "caution" });
  });

  const LOGO = "https://cdn.jsdelivr.net/gh/example/kyt-entity-registry@main/logos/example.png";

  it("a clear answer may carry a logo, but only with a label and only an acceptable URL", () => {
    expect(parseProxyAnswer({ level: "clear", label: "Example Exchange", logo: LOGO })).toEqual({ state: "clear", label: "Example Exchange", logo: LOGO });
    for (const bad of [
      { level: "clear", logo: LOGO }, // a logo without a name
      { level: "clear", label: "Example Exchange", logo: "https://evil.example/logo.png" },
      { level: "clear", label: "Example Exchange", logo: "javascript:alert(1)" },
      { level: "clear", label: "Example Exchange", logo: 7 },
      { level: "caution", logo: LOGO }, // a logo without a name, on caution too
      { level: "caution", label: "Example Exchange", logo: "http://cdn.jsdelivr.net/x.png" },
      { level: "unknown", label: "Example Exchange" }, // identity only on clear and caution
    ]) {
      expect(parseProxyAnswer(bad)).toEqual({ state: "unavailable" });
    }
  });

  it("a caution answer may carry a VASP name and logo (plan R14)", () => {
    expect(parseProxyAnswer({ level: "caution", label: "Example Exchange", logo: LOGO })).toEqual({ state: "caution", label: "Example Exchange", logo: LOGO });
    expect(parseProxyAnswer({ level: "caution", label: "Example Exchange" })).toEqual({ state: "caution", label: "Example Exchange" });
    expect(parseProxyAnswer({ level: "caution" })).toEqual({ state: "caution" });
  });

  it("the seed accepts a logo only on a labelled clear entry with an acceptable URL", () => {
    const base = { network: "TRON", address: "TMuA6YqfCeX8EhbfYEg5y7S4DqzSJireY9", checkedAt: "2026-10-13" };
    expect(validateSeedShape({ version: 1, entries: [{ ...base, level: "clear", label: "Example Exchange", logo: LOGO }] })).toEqual([]);
    for (const bad of [
      { ...base, level: "clear", logo: LOGO },
      { ...base, level: "caution", logo: LOGO },
      { ...base, level: "clear", label: "Example Exchange", logo: "http://cdn.jsdelivr.net/x.png" },
    ]) {
      expect(validateSeedShape({ version: 1, entries: [bad] }).join("\n")).toContain("logo must be");
    }
  });

  it("unknown and unexpected answers are unavailable, never trusted", () => {
    for (const bad of [
      { level: "unknown" },
      { level: "safe" },
      { level: "clear", score: 3 },
      { level: "clear", label: "" },
      { level: "clear", label: "x".repeat(61) },
      { level: "clear", label: 5 },
      { label: "Binance" },
      [],
      null,
      "clear",
    ]) {
      expect(parseProxyAnswer(bad)).toEqual({ state: "unavailable" });
    }
  });
});

describe("proxyCheck and checkAddress with a Worker", () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const respond = (answer: () => Response | Promise<Response>) =>
    (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return answer();
    }) as unknown as typeof fetch;
  beforeEach(() => {
    calls.length = 0;
  });

  it("POSTs {network, address} to <proxy>/check and maps the answer", async () => {
    const fetchImpl = respond(() => new Response(JSON.stringify({ level: "clear", label: "Binance" })));
    expect(await proxyCheck(A, "https://worker.example/", fetchImpl)).toEqual({ state: "clear", label: "Binance" });
    expect(calls[0]!.url).toBe("https://worker.example/check");
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ network: "TRON", address: A });
    expect((calls[0]!.init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
  });

  it("HTTP errors, network errors and timeouts are unavailable", async () => {
    expect(await proxyCheck(A, "https://w", respond(() => new Response("", { status: 429 })))).toEqual({ state: "unavailable" });
    expect(await proxyCheck(A, "https://w", respond(() => { throw new Error("offline"); }))).toEqual({ state: "unavailable" });
    expect(await proxyCheck(A, "https://w", respond(() => new Response("<html>")))).toEqual({ state: "unavailable" });
  });

  it("the seed answers first (no network); a miss goes to the Worker; no proxy means unavailable", async () => {
    const fetchImpl = respond(() => new Response(JSON.stringify({ level: "caution" })));
    const unknown = "T" + "z".repeat(33);
    expect(await checkAddress(A, { seed, now: NOW, proxyUrl: "https://w", fetchImpl })).toEqual({ state: "clear", label: "Binance" });
    expect(calls).toHaveLength(0);
    expect(await checkAddress(unknown, { seed, now: NOW, proxyUrl: "https://w", fetchImpl })).toEqual({ state: "caution" });
    expect(calls).toHaveLength(1);
    expect(await checkAddress(unknown, { seed, now: NOW, proxyUrl: "", fetchImpl })).toEqual({ state: "unavailable" });
    expect(await checkAddress(unknown, { seed, now: NOW, fetchImpl })).toEqual({ state: "unavailable" });
    expect(calls).toHaveLength(1);
  });

  it("an expired seed entry falls through to the Worker", async () => {
    const fetchImpl = respond(() => new Response(JSON.stringify({ level: "clear" })));
    expect(await checkAddress(A, { seed, now: new Date("2027-06-01T00:00:00Z"), proxyUrl: "https://w", fetchImpl })).toEqual({ state: "clear" });
    expect(calls).toHaveLength(1);
  });
});
