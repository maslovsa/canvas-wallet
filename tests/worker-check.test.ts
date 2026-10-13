// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { webcrypto } from "node:crypto";
import worker, { RiskCounter, Counter, mapAegisVerdict, sanitizeLabel, type Env } from "../worker/src/index.ts";

// Node 18 (older local setups) has no global WebCrypto; Workers and Node 20+ do.
if (!globalThis.crypto) Object.defineProperty(globalThis, "crypto", { value: webcrypto });

const ORIGIN = "https://maslovsa.github.io";
const ADDRESS = "TMuA6YqfCeX8EhbfYEg5y7S4DqzSJireY9";
const OTHER = "TJDENsfBJs4RFETt1X1W8wMDc8M5XnJhCe";
const THIRD = "TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7";
const SECRET_KEY = "aeg_" + "x".repeat(20) + "SECRET";

// ---- fakes
class FakeKV {
  store = new Map<string, { value: string; ttl: number | undefined }>();
  down = false;
  async get(key: string): Promise<string | null> {
    if (this.down) throw new Error("kv down");
    return this.store.get(key)?.value ?? null;
  }
  async put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void> {
    if (this.down) throw new Error("kv down");
    this.store.set(key, { value, ttl: options?.expirationTtl });
  }
}

/** Storage that yields between get and put, like real I/O: the worst case for read-modify-write races. */
function slowStorage() {
  const m = new Map<string, unknown>();
  return {
    get: async (k: string) => {
      await new Promise((r) => setTimeout(r, 1));
      return m.get(k);
    },
    put: async (k: string, v: unknown) => {
      await new Promise((r) => setTimeout(r, 1));
      m.set(k, v);
    },
  };
}

function makeEnv(overrides: Partial<Env> = {}): { env: Env; kv: FakeKV; counterFailing: { on: boolean } } {
  const kv = new FakeKV();
  const durable = new RiskCounter({ storage: slowStorage() });
  const counterFailing = { on: false };
  const env: Env = {
    AEGIS_API_KEY: SECRET_KEY,
    RISK_ENABLED: "true",
    AEGIS_BASE_URL: "https://api.aegis-kyt.com",
    ALLOWED_ORIGIN: ORIGIN,
    DAILY_BUDGET: "30",
    PER_VISITOR_PER_HOUR: "10",
    RISK_CACHE: kv,
    COUNTER: {
      idFromName: (n) => n,
      get: () => ({
        fetch: (req: Request) => (counterFailing.on ? Promise.reject(new Error("do down")) : durable.fetch(req)),
      }),
    },
    ...overrides,
  };
  return { env, kv, counterFailing };
}

interface AegisCall { url: string; headers: Record<string, string>; body: { address: string; network: string } }
let aegisCalls: AegisCall[] = [];
let aegisAnswer: () => Response | Promise<Response>;

const aegisBody = (risk_level: string, label: string | null = null, data = true, extra: Record<string, unknown> = {}) =>
  new Response(JSON.stringify({ verdict: { risk_level, risk_score: 91, label, risk_categories: ["mixer"], ...extra }, coverage: { data_available: data } }));

beforeEach(() => {
  aegisCalls = [];
  aegisAnswer = () => aegisBody("low", "Binance");
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    aegisCalls.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) });
    return aegisAnswer();
  });
});
afterEach(() => vi.unstubAllGlobals());

const post = (env: Env, address: unknown, extra: { origin?: string | null; ip?: string; raw?: string } = {}) =>
  worker.fetch(
    new Request("https://worker.example/check", {
      method: "POST",
      headers: {
        ...(extra.origin === null ? {} : { Origin: extra.origin ?? ORIGIN }),
        "CF-Connecting-IP": extra.ip ?? "203.0.113.7",
        "Content-Type": "application/json",
      },
      body: extra.raw ?? JSON.stringify({ network: "TRON", address }),
    }),
    env,
  );

describe("response contract: exactly {level, label?}", () => {
  it("clear with a label", async () => {
    const { env } = makeEnv();
    const res = await post(env, ADDRESS);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ level: "clear", label: "Binance" });
  });

  it("clear without a label has no label key", async () => {
    aegisAnswer = () => aegisBody("none", null, true);
    const res = await post(makeEnv().env, ADDRESS);
    expect(await res.json()).toEqual({ level: "clear" });
  });

  it("a caution result is exactly {level}: the label, score and categories never leave the Worker (plan E7)", async () => {
    aegisAnswer = () => aegisBody("sanctioned", "Al-Jebouri Zaid Issam Ahmed", true, { sdn_match: { list: "SDN" } });
    const res = await post(makeEnv().env, ADDRESS);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ level: "caution" });
    expect(text).not.toMatch(/Jebouri|score|91|mixer|sdn|categories|reason/i);
  });

  it("never echoes the Aegis key, even in error cases", async () => {
    aegisAnswer = () => new Response("nope", { status: 500 });
    const { env } = makeEnv();
    for (const r of [await post(env, ADDRESS), await post(env, "bad"), await post(env, ADDRESS, { origin: "https://evil.example" })]) {
      expect(await r.text()).not.toContain("SECRET");
    }
  });
});

describe("risk level mapping (plan E6)", () => {
  const table: Array<[string, string | null, boolean, string]> = [
    ["low", null, true, "clear"],
    ["none", null, true, "clear"],
    ["none", null, false, "unknown"], // no data: not clean
    ["medium", null, true, "caution"],
    ["high", null, true, "caution"],
    ["critical", null, true, "caution"],
    ["sanctioned", null, true, "caution"],
    ["something-new", null, true, "unknown"],
  ];
  it.each(table)("risk_level %s (data %s) -> %s", (level, label, data, expected) => {
    expect(mapAegisVerdict({ verdict: { risk_level: level, label }, coverage: { data_available: data } }).level).toBe(expected);
  });

  it("malformed answers map to unknown", () => {
    expect(mapAegisVerdict(null)).toEqual({ level: "unknown" });
    expect(mapAegisVerdict({})).toEqual({ level: "unknown" });
    expect(mapAegisVerdict("text")).toEqual({ level: "unknown" });
  });
});

describe("label sanitizing", () => {
  it("keeps printable text, collapses whitespace, caps length, drops empties", () => {
    expect(sanitizeLabel("  Binance \n Hot   Wallet ")).toBe("Binance Hot Wallet");
    expect(sanitizeLabel("Bi\u0000na\u202E\u200Bme")).toBe("Bi na me"); // control, bidi override and zero-width characters become spaces
    expect(sanitizeLabel("x".repeat(100))).toHaveLength(60);
    expect(sanitizeLabel("   ")).toBeUndefined();
    expect(sanitizeLabel(42)).toBeUndefined();
    expect(sanitizeLabel(null)).toBeUndefined();
  });
});

describe("request validation (before any paid call)", () => {
  it("rejects bad JSON, a wrong network, a non-string address and an invalid checksum with 400 and no Aegis call", async () => {
    const { env } = makeEnv();
    expect((await post(env, null, { raw: "not json" })).status).toBe(400);
    expect((await post(env, null, { raw: JSON.stringify({ network: "ETH", address: ADDRESS }) })).status).toBe(400);
    expect((await post(env, 42)).status).toBe(400);
    expect((await post(env, ADDRESS.slice(0, -1) + "j")).status).toBe(400);
    expect((await post(env, " " + ADDRESS)).status).toBe(400);
    expect(aegisCalls).toHaveLength(0);
  });

  it("GET /check is 405, unknown paths 404, /health answers", async () => {
    const { env } = makeEnv();
    expect((await worker.fetch(new Request("https://w/check"), env)).status).toBe(405);
    expect((await worker.fetch(new Request("https://w/nope", { headers: { Origin: ORIGIN } }), env)).status).toBe(404);
    const health = await worker.fetch(new Request("https://w/health"), env);
    expect(await health.json()).toEqual({ ok: true });
  });
});

describe("CORS (exact origin)", () => {
  it("allows the configured origin and echoes exactly that origin", async () => {
    const res = await post(makeEnv().env, ADDRESS);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
    expect(res.headers.get("Vary")).toBe("Origin");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("refuses another origin with 403 and never calls Aegis", async () => {
    const res = await post(makeEnv().env, ADDRESS, { origin: "https://evil.example" });
    expect(res.status).toBe(403);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(aegisCalls).toHaveLength(0);
  });

  it("a prefix or look-alike of the origin is not accepted", async () => {
    expect((await post(makeEnv().env, ADDRESS, { origin: ORIGIN + ".evil.example" })).status).toBe(403);
    expect((await post(makeEnv().env, ADDRESS, { origin: "http://maslovsa.github.io" })).status).toBe(403);
  });

  it("answers the preflight for the allowed origin", async () => {
    const res = await worker.fetch(new Request("https://w/check", { method: "OPTIONS", headers: { Origin: ORIGIN, "Access-Control-Request-Method": "POST" } }), makeEnv().env);
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("POST");
    expect(res.headers.get("Access-Control-Allow-Headers")).toContain("Content-Type");
  });

  it("a comma-separated list allows each listed origin (local development)", async () => {
    const { env } = makeEnv({ ALLOWED_ORIGIN: `${ORIGIN}, http://localhost:5173` });
    expect((await post(env, ADDRESS, { origin: "http://localhost:5173" })).status).toBe(200);
  });
});

describe("kill switch (plan E5)", () => {
  it.each([[undefined], ["false"], ["TRUE"], [""]])("RISK_ENABLED=%j means seed-only: unknown, no Aegis call", async (value) => {
    const { env } = makeEnv({ RISK_ENABLED: value });
    const res = await post(env, ADDRESS);
    expect(await res.json()).toEqual({ level: "unknown" });
    expect(aegisCalls).toHaveLength(0);
  });

  it("a missing Aegis key never reaches Aegis", async () => {
    const { env } = makeEnv({ AEGIS_API_KEY: undefined });
    expect(await (await post(env, ADDRESS)).json()).toEqual({ level: "unknown" });
    expect(aegisCalls).toHaveLength(0);
  });
});

describe("the Aegis call", () => {
  it("POSTs /v2/screen with the Bearer key, an Idempotency-Key of 64 hex characters and the TRON network", async () => {
    await post(makeEnv().env, ADDRESS);
    expect(aegisCalls).toHaveLength(1);
    const call = aegisCalls[0]!;
    expect(call.url).toBe("https://api.aegis-kyt.com/v2/screen");
    expect(call.headers.Authorization).toBe(`Bearer ${SECRET_KEY}`);
    expect(call.headers["Idempotency-Key"]).toMatch(/^[0-9a-f]{64}$/);
    expect(call.body).toEqual({ address: ADDRESS, network: "TRON" });
  });

  it("the Idempotency-Key is stable per address and UTC day, and differs per address and per day", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-13T10:00:00Z"));
    const a = makeEnv();
    await post(a.env, ADDRESS);
    await post(makeEnv().env, ADDRESS, { ip: "198.51.100.9" });
    await post(makeEnv().env, OTHER);
    vi.setSystemTime(new Date("2026-10-14T00:00:01Z"));
    await post(makeEnv().env, ADDRESS);
    vi.useRealTimers();
    const keys = aegisCalls.map((c) => c.headers["Idempotency-Key"]);
    expect(keys[0]).toBe(keys[1]);
    expect(new Set(keys).size).toBe(3);
  });

  it.each([[402], [429], [500], [503]])("Aegis %i -> unknown, cached only briefly", async (status) => {
    aegisAnswer = () => new Response("", { status });
    const { env, kv } = makeEnv();
    expect(await (await post(env, ADDRESS)).json()).toEqual({ level: "unknown" });
    expect([...kv.store.values()][0]?.ttl).toBe(60);
  });

  it("a network error or timeout -> unknown", async () => {
    aegisAnswer = () => {
      throw new Error("network");
    };
    expect(await (await post(makeEnv().env, ADDRESS)).json()).toEqual({ level: "unknown" });
  });

  it("a malformed Aegis body -> unknown", async () => {
    aegisAnswer = () => new Response("<html>", { status: 200 });
    expect(await (await post(makeEnv().env, ADDRESS)).json()).toEqual({ level: "unknown" });
  });
});

describe("cache", () => {
  it("serves the second request for an address from KV with no second Aegis call; a verdict is kept 24 h", async () => {
    const { env, kv } = makeEnv();
    const first = await (await post(env, ADDRESS)).json();
    const second = await (await post(env, ADDRESS, { ip: "198.51.100.9" })).json();
    expect(second).toEqual(first);
    expect(aegisCalls).toHaveLength(1);
    expect([...kv.store.values()][0]?.ttl).toBe(86_400);
  });

  it("a refusal by our own limits is not cached: another visitor can still get a real answer for the same address", async () => {
    const { env, kv } = makeEnv({ PER_VISITOR_PER_HOUR: "1" });
    await post(env, ADDRESS);
    expect(await (await post(env, OTHER)).json()).toEqual({ level: "unknown" }); // visitor limit hit
    expect(kv.store.has(`v1:TRON:${OTHER}`)).toBe(false);
    expect(await (await post(env, OTHER, { ip: "198.51.100.9" })).json()).toEqual({ level: "clear", label: "Binance" });
  });

  it("a cache hit does not use up the visitor's or the daily allowance", async () => {
    const { env } = makeEnv({ PER_VISITOR_PER_HOUR: "1", DAILY_BUDGET: "1" });
    await post(env, ADDRESS);
    for (let i = 0; i < 5; i += 1) expect(await (await post(env, ADDRESS)).json()).toEqual({ level: "clear", label: "Binance" });
    expect(aegisCalls).toHaveLength(1);
  });
});

describe("abuse limits (plan R4, E3)", () => {
  it("per visitor per hour: the next miss is unknown without an Aegis call; another visitor is unaffected", async () => {
    const { env } = makeEnv({ PER_VISITOR_PER_HOUR: "2" });
    await post(env, ADDRESS);
    await post(env, OTHER);
    expect(await (await post(env, THIRD)).json()).toEqual({ level: "unknown" });
    expect(aegisCalls).toHaveLength(2);
    expect(await (await post(env, THIRD, { ip: "198.51.100.9" })).json()).toEqual({ level: "clear", label: "Binance" });
  });

  it("daily budget for the whole demo: when spent, even a new visitor gets unknown", async () => {
    const { env } = makeEnv({ DAILY_BUDGET: "2" });
    await post(env, ADDRESS, { ip: "10.0.0.1" });
    await post(env, OTHER, { ip: "10.0.0.2" });
    expect(await (await post(env, THIRD, { ip: "10.0.0.3" })).json()).toEqual({ level: "unknown" });
    expect(aegisCalls).toHaveLength(2);
  });

  it("the window rolls over: a new day restores the budget", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-13T23:59:00Z"));
    const { env } = makeEnv({ DAILY_BUDGET: "1", PER_VISITOR_PER_HOUR: "5" });
    await post(env, ADDRESS);
    expect(await (await post(env, OTHER)).json()).toEqual({ level: "unknown" });
    vi.setSystemTime(new Date("2026-10-14T00:00:30Z"));
    expect(await (await post(env, OTHER)).json()).toEqual({ level: "clear", label: "Binance" });
    vi.useRealTimers();
  });

  it("invalid DAILY_BUDGET configuration fails closed", async () => {
    const { env } = makeEnv({ DAILY_BUDGET: "lots" });
    expect(await (await post(env, ADDRESS)).json()).toEqual({ level: "unknown" });
    expect(aegisCalls).toHaveLength(0);
  });
});

describe("fail closed (plan R4)", () => {
  it("KV down: unknown and no live call", async () => {
    const { env, kv } = makeEnv();
    kv.down = true;
    expect(await (await post(env, ADDRESS)).json()).toEqual({ level: "unknown" });
    expect(aegisCalls).toHaveLength(0);
  });

  it("the counter unavailable: unknown and no live call", async () => {
    const { env, counterFailing } = makeEnv();
    counterFailing.on = true;
    expect(await (await post(env, ADDRESS)).json()).toEqual({ level: "unknown" });
    expect(aegisCalls).toHaveLength(0);
  });
});

describe("Counter and the Durable Object wrapper", () => {
  it("take never exceeds the limit and rolls over with the window", async () => {
    const storage = slowStorage();
    const c = new Counter(storage);
    expect(await c.take("k", 2, 1_000, 1_000)).toEqual({ allowed: true, count: 1 });
    expect(await c.take("k", 2, 1_100, 1_000)).toEqual({ allowed: true, count: 2 });
    expect(await c.take("k", 2, 1_200, 1_000)).toEqual({ allowed: false, count: 2 });
    expect(await c.peek("k", 1_300, 1_000)).toBe(2);
    expect(await c.take("k", 2, 2_000, 1_000)).toEqual({ allowed: true, count: 1 }); // next window
    expect(await c.peek("other", 2_000, 1_000)).toBe(0);
  });

  it("50 concurrent takes against slow storage allow exactly the limit (serialized read-modify-write)", async () => {
    const durable = new RiskCounter({ storage: slowStorage() });
    const results = await Promise.all(
      Array.from({ length: 50 }, () =>
        durable.fetch(new Request("https://counter/op", { method: "POST", body: JSON.stringify({ op: "take", key: "g", limit: 10, windowMs: 86_400_000 }) })).then((r) => r.json() as Promise<{ allowed: boolean }>),
      ),
    );
    expect(results.filter((r) => r.allowed)).toHaveLength(10);
  });

  it("a failing operation does not wedge the queue", async () => {
    const durable = new RiskCounter({ storage: slowStorage() });
    await expect(durable.fetch(new Request("https://counter/op", { method: "POST", body: "not json" }))).rejects.toThrow();
    const ok = await durable.fetch(new Request("https://counter/op", { method: "POST", body: JSON.stringify({ op: "peek", key: "g", limit: 0, windowMs: 1000 }) }));
    expect(await ok.json()).toEqual({ count: 0 });
  });
});
