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

interface AegisCall { url: string; headers: Record<string, string>; body?: { address: string; network: string } }
let aegisCalls: AegisCall[] = [];
let aegisAnswer: () => Response | Promise<Response>;

// Realistic default scores per level (live answers: low = 20, medium = 50, sanctioned = 100); override via `extra`.
const DEFAULT_SCORE: Record<string, number> = { none: 0, low: 20, medium: 50, high: 75, critical: 90, sanctioned: 100 };
const aegisBody = (risk_level: string, label: string | null = null, data = true, extra: Record<string, unknown> = {}) =>
  new Response(JSON.stringify({ verdict: { risk_level, risk_score: DEFAULT_SCORE[risk_level] ?? null, label, risk_categories: ["mixer"], ...extra }, coverage: { data_available: data } }));

beforeEach(() => {
  aegisCalls = [];
  aegisAnswer = () => aegisBody("low", "Binance");
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    aegisCalls.push({ url, headers: (init?.headers ?? {}) as Record<string, string>, ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}) });
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
    expect(await res.json()).toEqual({ level: "clear", label: "Binance", logo: BINANCE_LOGO });
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

const BINANCE_LOGO = "https://cdn.jsdelivr.net/gh/maslovsa/kyt-entity-registry@main/logos/exchanges/binance-com.png";
const makeEnvOnce = () => makeEnv().env;
const LOGO = "https://cdn.jsdelivr.net/gh/example/kyt-entity-registry@main/logos/example-exchange.png";
const entity = (over: Record<string, unknown> = {}) => ({ slug: "example-exchange", name: "Example Exchange", category: "centralized_exchange", logo_url: LOGO, logo_source: "registry", ...over });

describe("VASP name and logo (clear results only)", () => {
  it("takes the name and logo from verdict.entity", async () => {
    aegisAnswer = () => aegisBody("low", "Example Exchange hot wallet 7", true, { entity: entity() });
    expect(await (await post(makeEnv().env, ADDRESS)).json()).toEqual({ level: "clear", label: "Example Exchange", logo: LOGO });
  });

  it("an entity without a logo still gives the name (the screen draws an initial)", async () => {
    aegisAnswer = () => aegisBody("low", null, true, { entity: entity({ logo_url: null, logo_source: null }) });
    expect(await (await post(makeEnv().env, ADDRESS)).json()).toEqual({ level: "clear", label: "Example Exchange" });
  });

  it("falls back to verdict.label when there is no entity, with the known-exchange logo for a name in the table", async () => {
    aegisAnswer = () => aegisBody("low", "Binance", true, { entity: null });
    expect(await (await post(makeEnv().env, ADDRESS)).json()).toEqual({ level: "clear", label: "Binance", logo: BINANCE_LOGO });
  });

  it("a logo without any name is dropped", async () => {
    aegisAnswer = () => aegisBody("low", null, true, { entity: entity({ name: null }) });
    expect(await (await post(makeEnv().env, ADDRESS)).json()).toEqual({ level: "clear" });
  });

  it.each([
    ["another host", "https://evil.example/logo.png"],
    ["plain http", "http://cdn.jsdelivr.net/logo.png"],
    ["javascript:", "javascript:alert(1)"],
    ["a data: URL", "data:image/png;base64,AAAA"],
    ["credentials in the URL", "https://user:pw@cdn.jsdelivr.net/logo.png"],
    ["a query string", "https://cdn.jsdelivr.net/logo.png?x=1"],
    ["not a PNG", "https://cdn.jsdelivr.net/logo.svg"],
    ["a lookalike host", "https://cdn.jsdelivr.net.evil.example/logo.png"],
  ])("an unacceptable logo URL (%s) is dropped but the name stays", async (_why, url) => {
    aegisAnswer = () => aegisBody("low", null, true, { entity: entity({ logo_url: url }) });
    expect(await (await post(makeEnv().env, ADDRESS)).json()).toEqual({ level: "clear", label: "Example Exchange" });
  });
});

// Shapes taken from live Aegis answers (2026-10-13): an OFAC SDN match, and an exchange-named address that
// Aegis nevertheless puts at the sanctioned level through sanctions exposure. A risky address leaves the Worker
// as {level: caution} plus, only when Aegis has a corroborated VASP (verdict.entity), that VASP's name and logo
// (plan R14). Never verdict.label (a sanctioned person or a risk annotation), a category, a score or a list.
describe("risk: what leaves the Worker", () => {
  const bare: Array<[string, string, Record<string, unknown>]> = [
    ["OFAC SDN match (the label is a person's name)", "sanctioned", { risk_categories: ["ofac-sdn"], sdn_match: { list: "OFAC" }, label: "Example Sanctioned Person" }],
    ["named exchange address at sanctioned level through exposure, no entity", "sanctioned", { risk_categories: ["sanctioned", "high_risk_exchange", "sanctions_exposure", "exchange", "defi"], label: "Example Exchange", entity: null }],
    ["critical: mixer", "critical", { risk_categories: ["mixer"], label: "Example Mixer" }],
    ["high: scam, no label", "high", { risk_categories: ["scam"], label: null }],
  ];
  it.each(bare)("%s -> exactly {level: caution}", async (_name, level, extra) => {
    aegisAnswer = () => aegisBody(level, null, true, extra);
    const text = await (await post(makeEnv().env, ADDRESS)).text();
    expect(JSON.parse(text)).toEqual({ level: "caution" });
    expect(text).not.toMatch(/Example|logo|jsdelivr|ofac|sdn|exposure|mixer|scam|score|categor/i);
  });

  const withVasp: Array<[string, string, Record<string, unknown>]> = [
    ["sanctioned level through exposure", "sanctioned", { risk_categories: ["sanctions_exposure", "exchange"], label: "Some Raw Label", entity: entity() }],
    ["medium: sanctions exposure", "medium", { risk_categories: ["sanctions_exposure"], label: "Some Raw Label", entity: entity() }],
  ];
  it.each(withVasp)("%s, with a corroborated VASP -> caution + its name and logo, nothing else", async (_name, level, extra) => {
    aegisAnswer = () => aegisBody(level, null, true, extra);
    const text = await (await post(makeEnv().env, ADDRESS)).text();
    expect(JSON.parse(text)).toEqual({ level: "caution", label: "Example Exchange", logo: LOGO });
    expect(text).not.toMatch(/Raw Label|ofac|sdn|exposure|mixer|scam|score|categor/i);
  });

  it("a logo whose path names a risk reason is dropped on caution (the name stays), but kept on a clear address", async () => {
    const risky = "https://cdn.jsdelivr.net/gh/example/kyt-entity-registry@main/logos/sanctioned/example-exchange.png";
    aegisAnswer = () => aegisBody("sanctioned", null, true, { entity: entity({ logo_url: risky }) });
    const text = await (await post(makeEnvOnce(), ADDRESS)).text();
    expect(JSON.parse(text)).toEqual({ level: "caution", label: "Example Exchange" });
    expect(text).not.toMatch(/sanction/i);
    aegisAnswer = () => aegisBody("low", null, true, { entity: entity({ logo_url: risky }) });
    expect(await (await post(makeEnvOnce(), OTHER)).json()).toEqual({ level: "clear", label: "Example Exchange", logo: risky });
  });

  it("a VASP name without a logo is still shown on caution; a bad logo URL is dropped", async () => {
    aegisAnswer = () => aegisBody("high", null, true, { entity: entity({ logo_url: null }) });
    expect(await (await post(makeEnv().env, ADDRESS)).json()).toEqual({ level: "caution", label: "Example Exchange" });
    aegisAnswer = () => aegisBody("high", null, true, { entity: entity({ logo_url: "https://evil.example/x.png" }) });
    expect(await (await post(makeEnv().env, OTHER)).json()).toEqual({ level: "caution", label: "Example Exchange" });
  });
});

describe("exchange named only in labels[] (Aegis often leaves entity empty)", () => {
  const rows = (...r: Array<[string, string, string]>) => r.map(([source_name, label, category]) => ({ source_name, label, category }));
  const CURATED: [string, string, string] = ["VASP entity defaults (admin-curated)", "Binance", "exchange"];
  const COMMUNITY: [string, string, string] = ["GraphSense Community Tagpacks", "GraphSense: Binance reserve wallets", "exchange"];
  const map = (verdict: Record<string, unknown>) => mapAegisVerdict({ verdict: { risk_level: "low", risk_score: 20, ...verdict }, coverage: { data_available: true } });

  it("a clear address takes the admin-curated VASP name from labels[] and the known-exchange logo", () => {
    expect(map({ label: null, entity: null, labels: rows(COMMUNITY, CURATED) })).toEqual({
      level: "clear",
      label: "Binance",
      logo: "https://cdn.jsdelivr.net/gh/maslovsa/kyt-entity-registry@main/logos/exchanges/binance-com.png",
    });
  });
  it("community tag packs are never used as the name", () => {
    expect(map({ label: null, entity: null, labels: rows(COMMUNITY) })).toEqual({ level: "clear" });
  });
  it("an exchange that is not in the logo table keeps its name with no logo", () => {
    expect(map({ label: null, entity: null, labels: rows(["VASP entity defaults (admin-curated)", "Some Small Exchange", "exchange"]) })).toEqual({ level: "clear", label: "Some Small Exchange" });
  });
  it("an entity's own logo wins over the table; the entity name wins over labels[]", () => {
    expect(map({ entity: { name: "Binance", logo_url: LOGO }, labels: rows(CURATED) })).toEqual({ level: "clear", label: "Binance", logo: LOGO });
    expect(map({ entity: { name: "Entity Name", logo_url: null }, labels: rows(CURATED) })).toEqual({ level: "clear", label: "Entity Name" });
  });
  const VASP_RISKY: [string, string, string] = ["VASP entity defaults (operator override, authority)", "HTX", "sanctioned"];
  const SANCTIONS_LIST: [string, string, string] = ["OFAC SDN Sanctions List", "OFAC SDN: Some Person", "sanctioned"];
  const TETHER: [string, string, string] = ["Tether USDT On-Chain Blacklist", "Tether blacklist - TXXXXX", "tether_blacklist"];
  const TRACE: [string, string, string] = ["Aegis BFS discovery - some trace", "Htx.com - Huobi.com", "sanctioned"];
  const risky = (extra: Record<string, unknown>) => mapAegisVerdict({ verdict: { risk_level: "sanctioned", risk_score: 100, ...extra }, coverage: { data_available: true } });

  it("a risky address shows the VASP identity from the curated VASP row (even though its category is a risk category), with the exchange logo", () => {
    expect(risky({ label: "Htx.com - Huobi.com", entity: null, labels: rows(SANCTIONS_LIST, VASP_RISKY, TRACE) })).toEqual({
      level: "caution",
      label: "HTX",
      logo: "https://cdn.jsdelivr.net/gh/maslovsa/kyt-entity-registry@main/logos/exchanges/htx-com-huobi-com.png",
    });
  });
  it("a risky address with only lists, blacklists, traces and a raw label stays bare: nothing there is a VASP identity", () => {
    expect(risky({ label: "Some Sanctioned Person", entity: null, labels: rows(SANCTIONS_LIST, TETHER, TRACE) })).toEqual({ level: "caution" });
    expect(risky({ label: "Tether USDT: blacklisted", entity: null, labels: rows(TETHER) })).toEqual({ level: "caution" });
  });
  it("a risky address's logo is dropped when its path names a reason, but the name stays", () => {
    const risky_ = "https://cdn.jsdelivr.net/gh/maslovsa/kyt-entity-registry@main/logos/sanctioned/grinex.png";
    expect(risky({ entity: { name: "Grinex", logo_url: risky_ }, labels: rows() })).toEqual({ level: "caution", label: "Grinex" });
  });
  it("the identity of a risky address never carries the reason: no category, list or trace text in the answer", () => {
    const text = JSON.stringify(risky({ label: "Htx.com - Huobi.com", entity: null, labels: rows(SANCTIONS_LIST, VASP_RISKY, TETHER, TRACE) }));
    expect(text).not.toMatch(/sanction|ofac|sdn|blacklist|trace|score|categor/i);
  });
});

describe("alert threshold: risk score 50 and above", () => {
  const map = (verdict: Record<string, unknown>, data = true) => mapAegisVerdict({ verdict, coverage: { data_available: data } });
  it("49 is clear (the VASP name still shows), 50 is caution", () => {
    expect(map({ risk_level: "medium", risk_score: 49, entity: entity() })).toEqual({ level: "clear", label: "Example Exchange", logo: LOGO });
    expect(map({ risk_level: "medium", risk_score: 50, entity: entity() })).toEqual({ level: "caution", label: "Example Exchange", logo: LOGO });
    expect(map({ risk_level: "low", risk_score: 20 })).toEqual({ level: "clear" });
  });
  it("a high score is caution even when the level says low", () => {
    expect(map({ risk_level: "low", risk_score: 80 })).toEqual({ level: "caution" });
    expect(map({ risk_score: 50 })).toEqual({ level: "caution" });
  });
  it("sanctioned level or a sanctions-list match is caution whatever the score", () => {
    expect(map({ risk_level: "sanctioned", risk_score: 10 })).toEqual({ level: "caution" });
    expect(map({ risk_level: "low", risk_score: 5, sdn_match: { list: "OFAC" } })).toEqual({ level: "caution" });
  });
  it("without a numeric score the level decides (medium and above are caution)", () => {
    expect(map({ risk_level: "medium", risk_score: null })).toEqual({ level: "caution" });
    expect(map({ risk_level: "high" })).toEqual({ level: "caution" });
    expect(map({ risk_level: "low", risk_score: null })).toEqual({ level: "clear" });
    expect(map({ risk_level: "low", risk_score: "50" })).toEqual({ level: "clear" }); // not a number: ignored
  });
  it("a score below 50 without any data is still unknown, not clear", () => {
    expect(map({ risk_level: "none", risk_score: 0 }, false)).toEqual({ level: "unknown" });
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
  it("serves the second request for an address from KV with no second Aegis call; a verdict is kept forever (no expiry)", async () => {
    const { env, kv } = makeEnv();
    const first = await (await post(env, ADDRESS)).json();
    const second = await (await post(env, ADDRESS, { ip: "198.51.100.9" })).json();
    expect(second).toEqual(first);
    expect(aegisCalls).toHaveLength(1);
    expect([...kv.store.values()][0]?.ttl).toBeUndefined();
  });

  it("a refusal by our own limits is not cached: another visitor can still get a real answer for the same address", async () => {
    const { env, kv } = makeEnv({ PER_VISITOR_PER_HOUR: "1" });
    await post(env, ADDRESS);
    expect(await (await post(env, OTHER)).json()).toEqual({ level: "unknown" }); // visitor limit hit
    expect(kv.store.has(`v5:TRON:${OTHER}`)).toBe(false);
    expect(await (await post(env, OTHER, { ip: "198.51.100.9" })).json()).toEqual({ level: "clear", label: "Binance", logo: BINANCE_LOGO });
  });

  it("a cache hit does not use up the visitor's or the daily allowance", async () => {
    const { env } = makeEnv({ PER_VISITOR_PER_HOUR: "1", DAILY_BUDGET: "1" });
    await post(env, ADDRESS);
    for (let i = 0; i < 5; i += 1) expect(await (await post(env, ADDRESS)).json()).toEqual({ level: "clear", label: "Binance", logo: BINANCE_LOGO });
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
    expect(await (await post(env, THIRD, { ip: "198.51.100.9" })).json()).toEqual({ level: "clear", label: "Binance", logo: BINANCE_LOGO });
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
    expect(await (await post(env, OTHER)).json()).toEqual({ level: "clear", label: "Binance", logo: BINANCE_LOGO });
    vi.useRealTimers();
  });

  describe("Free-plan guard: refusals are remembered, so a flood costs no Durable Object requests", () => {
    function counted(env: Env): { calls: () => number } {
      const inner = env.COUNTER;
      let n = 0;
      env.COUNTER = { idFromName: (name) => inner.idFromName(name), get: (id) => { const stub = inner.get(id); return { fetch: (r: Request) => (n += 1, stub.fetch(r)) }; } };
      return { calls: () => n };
    }

    it("after the daily budget refused a call, more requests make no Durable Object calls", async () => {
      const { env } = makeEnv({ DAILY_BUDGET: "1" });
      const counter = counted(env);
      await post(env, ADDRESS, { ip: "10.0.0.1" });
      expect(await (await post(env, OTHER, { ip: "10.0.0.2" })).json()).toEqual({ level: "unknown" }); // refused: remembered
      const before = counter.calls();
      for (let i = 0; i < 20; i += 1) expect(await (await post(env, OTHER, { ip: `10.0.1.${i}` })).json()).toEqual({ level: "unknown" });
      expect(counter.calls()).toBe(before);
      expect(aegisCalls).toHaveLength(1);
    });

    it("a visitor over their hourly limit is answered from memory", async () => {
      const { env } = makeEnv({ PER_VISITOR_PER_HOUR: "1" });
      const counter = counted(env);
      await post(env, ADDRESS, { ip: "10.0.0.1" });
      expect(await (await post(env, OTHER, { ip: "10.0.0.1" })).json()).toEqual({ level: "unknown" }); // refused: remembered
      const before = counter.calls();
      for (let i = 0; i < 20; i += 1) await post(env, OTHER, { ip: "10.0.0.1" });
      expect(counter.calls()).toBe(before);
      // another visitor is unaffected
      expect(await (await post(env, OTHER, { ip: "10.0.0.2" })).json()).toEqual({ level: "clear", label: "Binance", logo: BINANCE_LOGO });
    });
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

describe("GET /price (CoinGecko proxy for the charts)", () => {
  const getPrice = (env: Env, query: string, origin: string | null = ORIGIN) =>
    worker.fetch(new Request(`https://worker.example/price${query}`, { headers: origin ? { Origin: origin } : {} }), env);
  const series = (n: number) => ({ prices: Array.from({ length: n }, (_, i) => [1_700_000_000_000 + i * 60_000, 1 + i / 1000]) });

  it("returns {prices} with CORS and a 15 min cache header, downsampled to at most 96 points", async () => {
    aegisAnswer = () => new Response(JSON.stringify(series(288)));
    const res = await getPrice(makeEnv().env, "?id=tether");
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    expect(res.headers.get("cache-control")).toBe("public, max-age=900");
    const body = (await res.json()) as { prices: number[] };
    expect(body.prices.length).toBeLessThanOrEqual(96);
    expect(body.prices[0]).toBe(1);
    expect(aegisCalls[0]?.url).toBe("https://api.coingecko.com/api/v3/coins/tether/market_chart?vs_currency=usd&days=1");
  });

  it.each(["", "?id=", "?id=Tether", "?id=a/b", "?id=../x", `?id=${"a".repeat(65)}`])("rejects a bad id (%s) without calling CoinGecko", async (query) => {
    const res = await getPrice(makeEnv().env, query);
    expect(res.status).toBe(400);
    expect(aegisCalls).toHaveLength(0);
  });

  it("an upstream failure (429, 500, junk, empty) is a 502, never a made-up chart", async () => {
    for (const answer of [() => new Response("", { status: 429 }), () => new Response("", { status: 500 }), () => new Response("<html>"), () => new Response(JSON.stringify({ prices: [] }))]) {
      aegisAnswer = answer;
      expect((await getPrice(makeEnv().env, "?id=tether")).status).toBe(502);
    }
  });

  it("falls back to DefiLlama when CoinGecko refuses (a 429 from a shared cloud address)", async () => {
    let call = 0;
    aegisAnswer = () => (++call === 1 ? new Response("", { status: 429 }) : new Response(JSON.stringify({ coins: { "coingecko:tether": { prices: [{ timestamp: 1, price: 0.999 }, { timestamp: 2, price: 1.001 }, { timestamp: 3, price: "x" }] } } })));
    const res = await getPrice(makeEnv().env, "?id=tether");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ prices: [0.999, 1.001] });
    expect(aegisCalls.map((c) => new URL(c.url).host)).toEqual(["api.coingecko.com", "coins.llama.fi"]);
    expect(aegisCalls[1]?.url).toBe("https://coins.llama.fi/chart/coingecko:tether?span=96&period=15m");
  });

  it("CoinGecko answering is enough: DefiLlama is not asked", async () => {
    aegisAnswer = () => new Response(JSON.stringify(series(10)));
    await getPrice(makeEnv().env, "?id=tether");
    expect(aegisCalls).toHaveLength(1);
  });

  it("uses the Cache API: the second request for an id does not call CoinGecko again", async () => {
    const store = new Map<string, Response>();
    vi.stubGlobal("caches", { default: { match: async (r: Request) => store.get(r.url)?.clone(), put: async (r: Request, res: Response) => void store.set(r.url, res.clone()) } });
    aegisAnswer = () => new Response(JSON.stringify(series(10)));
    const env = makeEnv().env;
    await getPrice(env, "?id=bitcoin");
    const second = await getPrice(env, "?id=bitcoin");
    expect(second.status).toBe(200);
    expect(aegisCalls).toHaveLength(1);
    vi.unstubAllGlobals();
  });

  it("refuses a foreign origin like /check does, and only allows GET", async () => {
    expect((await getPrice(makeEnv().env, "?id=tether", "https://evil.example")).status).toBe(403);
    const post = await worker.fetch(new Request("https://worker.example/price?id=tether", { method: "POST", headers: { Origin: ORIGIN } }), makeEnv().env);
    expect(post.status).toBe(405);
  });
});
