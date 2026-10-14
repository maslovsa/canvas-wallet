// Risk-check proxy for the Send window (plan T9). It exists because a static GitHub Pages site cannot
// hold a secret: the Aegis key lives ONLY here, as the Worker secret AEGIS_API_KEY.
//
//   POST /check {"network":"TRON","address":"T..."}  ->  {"level":"clear"|"caution","label"?:"...","logo"?:"https://..."} | {"level":"unknown"}
//
//   GET /price?id=<coingecko id>  ->  {"prices": number[]}  (24 h chart, cached 15 min; the browser cannot call CoinGecko)
//
// The response is exactly that: never a score, a reason, flags or the Aegis session. A VASP's name and logo may
// accompany a clear or a caution result (plan R14: on caution only a corroborated VASP identity, never a raw
// label that could name a sanctioned person). Anything that goes wrong becomes {"level":"unknown"} (fail closed:
// no live call when the cache or the counters are unavailable). Aegis POST /v2/screen is synchronous and costs 0.1 credit per
// call; a replay with the same Idempotency-Key within 24 h is free (docs.aegis-kyt.com/api-reference/v2-screen).
import { validateTronAddress } from "../../src/send/tron-address.ts";
import { sanitizeLogoUrl } from "../../src/send/entity-logo.ts";
import { Counter, type CounterStorage } from "./counter.ts";

export { Counter } from "./counter.ts";

// ---- structural types (no @cloudflare/workers-types: the project's tsconfig does not cover this directory)
interface KV {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}
interface DurableObjectStub {
  fetch(request: Request): Promise<Response>;
}
interface DurableObjectNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): DurableObjectStub;
}
interface DurableObjectState {
  storage: CounterStorage;
}

export interface Env {
  /** Secret. Never logged, never returned. */
  AEGIS_API_KEY?: string | undefined;
  /** Secret kill switch (plan E5): live checks run only when this is exactly "true". */
  RISK_ENABLED?: string | undefined;
  AEGIS_BASE_URL: string;
  /** Comma-separated exact origins allowed to call the Worker. */
  ALLOWED_ORIGIN: string;
  DAILY_BUDGET: string;
  PER_VISITOR_PER_HOUR: string;
  RISK_CACHE: KV;
  COUNTER: DurableObjectNamespace;
}

type Level = "clear" | "caution" | "unknown";
interface Verdict {
  level: Level;
  label?: string;
  logo?: string;
}

const AEGIS_TIMEOUT_MS = 8000; // inside the client's 15 s ceiling (plan R10)
// A definitive verdict (clear / caution, with its name and logo) is kept FOREVER: the owner of an address rarely changes,
// and every repeat is then a free KV read, never a paid Aegis call. To drop all of them, bump the key version below.
const NEGATIVE_TTL_S = 60; // KV's minimum: a failed check is retried soon, not for a day
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const MAX_LABEL_LENGTH = 60;

// ---------------------------------------------------------------- helpers

function allowedOrigins(env: Env): string[] {
  return env.ALLOWED_ORIGIN.split(",").map((o) => o.trim()).filter(Boolean);
}

function corsHeaders(origin: string | null, env: Env): Record<string, string> {
  const headers: Record<string, string> = { Vary: "Origin" };
  if (origin && allowedOrigins(env).includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Content-Type";
    headers["Access-Control-Max-Age"] = "86400";
  }
  return headers;
}

function json(body: unknown, status: number, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...extra },
  });
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Owner label: printable text only, collapsed whitespace, at most 60 characters. Empty means no label. */
export function sanitizeLabel(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const cleaned = raw.replace(/[\p{C}\p{Zl}\p{Zp}]/gu, " ").replace(/\s+/g, " ").trim().slice(0, MAX_LABEL_LENGTH).trim();
  return cleaned === "" ? undefined : cleaned;
}

/** Aegis risk_score (0-100) at or above which the client shows the risk line and the confirmation alert. */
export const RISK_ALERT_SCORE = 50;

/**
 * Aegis /v2/screen answer -> the three client levels (plan E6). Caution when the risk score is 50 or more, or the
 * level is `sanctioned` / there is a sanctions-list match (always, whatever the score); without a numeric score the
 * level decides (medium and above). The reason (categories, score, sanctions match) never leaves the Worker.
 *
 * Identity (plan R14): a clear result carries the owner's name (verdict.entity.name, else verdict.label) and logo.
 * A caution result carries ONLY the corroborated VASP identity (verdict.entity.name and its logo): never
 * verdict.label, which on a risky address can be a sanctioned person's name or a risk annotation.
 */
export function mapAegisVerdict(body: unknown): Verdict {
  const root = body as {
    verdict?: {
      risk_level?: unknown;
      risk_score?: unknown;
      label?: unknown;
      sdn_match?: unknown;
      entity?: { name?: unknown; logo_url?: unknown } | null;
    };
    coverage?: { data_available?: unknown };
  } | null;
  const verdict = root?.verdict;
  const level = verdict?.risk_level;
  const score = typeof verdict?.risk_score === "number" && Number.isFinite(verdict.risk_score) ? verdict.risk_score : null;
  const entity = verdict?.entity;
  const withIdentity = (base: "clear" | "caution", name: string | undefined): Verdict => {
    if (!name) return { level: base };
    const logo = sanitizeLogoUrl(entity?.logo_url, base === "caution");
    return logo ? { level: base, label: name, logo } : { level: base, label: name };
  };
  const caution = (): Verdict => withIdentity("caution", sanitizeLabel(entity?.name));

  if (level === "sanctioned" || (verdict?.sdn_match !== undefined && verdict.sdn_match !== null)) return caution();
  if (score !== null && score >= RISK_ALERT_SCORE) return caution();
  const hasData = root?.coverage?.data_available === true;
  const known = level === "none" || level === "low" || level === "medium" || level === "high" || level === "critical";
  const belowThreshold = score !== null && known && (level === "low" || hasData);
  // No numeric score: the level decides (medium and above are caution, as before).
  if (score === null && (level === "medium" || level === "high" || level === "critical")) return caution();
  if (belowThreshold || (score === null && (level === "low" || (level === "none" && hasData)))) {
    return withIdentity("clear", sanitizeLabel(entity?.name) ?? sanitizeLabel(verdict?.label));
  }
  return { level: "unknown" }; // none without data, an unknown level, or a malformed answer
}

function log(event: Record<string, unknown>): void {
  console.log(JSON.stringify(event)); // never includes the address, the key or the label
}

// ---------------------------------------------------------------- request handling

async function counters(env: Env): Promise<{ take: (key: string, limit: number, windowMs: number) => Promise<boolean>; peek: (key: string, windowMs: number) => Promise<number> }> {
  const stub = env.COUNTER.get(env.COUNTER.idFromName("risk"));
  const call = async (op: string, key: string, limit: number, windowMs: number) => {
    const res = await stub.fetch(new Request("https://counter/op", { method: "POST", body: JSON.stringify({ op, key, limit, windowMs }) }));
    if (!res.ok) throw new Error(`counter ${res.status}`);
    return (await res.json()) as { allowed?: boolean; count: number };
  };
  return {
    take: async (key, limit, windowMs) => (await call("take", key, limit, windowMs)).allowed === true,
    peek: async (key, windowMs) => (await call("peek", key, 0, windowMs)).count,
  };
}

/** Per-isolate memory of refusals (keyed by the Durable Object namespace binding, so each deployment/test env has its own). */
const REFUSAL_MEMORY_MS = 60_000;
const MAX_REMEMBERED_REFUSALS = 1000;
const refusals = new WeakMap<object, Map<string, number>>();

function isBlocked(env: Env, key: string, now: number): boolean {
  const until = refusals.get(env.COUNTER)?.get(key);
  return until !== undefined && now < until;
}

function block(env: Env, key: string, now: number): void {
  let map = refusals.get(env.COUNTER);
  if (!map) refusals.set(env.COUNTER, (map = new Map()));
  if (map.size >= MAX_REMEMBERED_REFUSALS) map.clear(); // bounded memory
  map.set(key, now + REFUSAL_MEMORY_MS);
}

/** What to remember about a result: a real Aegis answer for 24 h, an Aegis failure for 60 s, and nothing when WE declined to call (limits, budget, configuration). */
type CachePolicy = "definitive" | "brief" | "none";

async function liveCheck(address: string, request: Request, env: Env): Promise<{ verdict: Verdict; cache: CachePolicy }> {
  const dailyBudget = Number.parseInt(env.DAILY_BUDGET, 10);
  const perVisitor = Number.parseInt(env.PER_VISITOR_PER_HOUR, 10);
  if (!Number.isFinite(dailyBudget) || !Number.isFinite(perVisitor) || !env.AEGIS_API_KEY) return { verdict: { level: "unknown" }, cache: "none" };

  const now = Date.now();
  const visitor = await sha256Hex(request.headers.get("CF-Connecting-IP") ?? "unknown");
  // Free-plan guard: once the budget or this visitor's limit has refused a call, this isolate remembers it for a
  // minute and answers without touching the Durable Object, so a flood of refused requests costs no DO requests.
  if (isBlocked(env, "budget", now) || isBlocked(env, `visitor:${visitor}`, now)) return { verdict: { level: "unknown" }, cache: "none" };
  const c = await counters(env); // any counter failure throws and is caught by the caller: fail closed
  // Read the global budget first; it is only written when a call is really made, so a flood of rejected
  // requests does not burn the Durable Object's free daily writes.
  if ((await c.peek("budget", DAY_MS)) >= dailyBudget) {
    block(env, "budget", now);
    return { verdict: { level: "unknown" }, cache: "none" };
  }
  if (!(await c.take(`visitor:${visitor}`, perVisitor, HOUR_MS))) {
    block(env, `visitor:${visitor}`, now);
    return { verdict: { level: "unknown" }, cache: "none" };
  }
  if (!(await c.take("budget", dailyBudget, DAY_MS))) {
    block(env, "budget", now);
    return { verdict: { level: "unknown" }, cache: "none" };
  }

  const day = new Date(now).toISOString().slice(0, 10);
  const idempotencyKey = await sha256Hex(`TRON:${address}:${day}`); // 64 hex chars, the documented maximum
  try {
    const res = await fetch(`${env.AEGIS_BASE_URL}/v2/screen`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.AEGIS_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({ address, network: "TRON" }),
      signal: AbortSignal.timeout(AEGIS_TIMEOUT_MS),
    });
    if (!res.ok) {
      log({ event: "aegis_error", status: res.status }); // 402 insufficient funds, 429, 5xx...
      return { verdict: { level: "unknown" }, cache: "brief" };
    }
    const verdict = mapAegisVerdict(await res.json());
    return { verdict, cache: verdict.level === "unknown" ? "brief" : "definitive" };
  } catch {
    log({ event: "aegis_unreachable" });
    return { verdict: { level: "unknown" }, cache: "brief" };
  }
}

async function handleCheck(request: Request, env: Env, cors: Record<string, string>): Promise<Response> {
  let body: { network?: unknown; address?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: "bad_request" }, 400, cors);
  }
  if (body.network !== "TRON" || typeof body.address !== "string") return json({ error: "bad_request" }, 400, cors);
  const address = body.address;
  // Strict validation before ANY paid call (Aegis charges even for an address with no data).
  if (!(await validateTronAddress(address)).ok) return json({ error: "bad_request" }, 400, cors);

  if (env.RISK_ENABLED !== "true") return json({ level: "unknown" } satisfies Verdict, 200, cors);

  const cacheKey = `v3:TRON:${address}`;
  try {
    const cached = await env.RISK_CACHE.get(cacheKey);
    if (cached) return json(JSON.parse(cached) as Verdict, 200, cors);
    const { verdict, cache } = await liveCheck(address, request, env);
    // A refusal by our own limits is never cached: it must not turn into "unknown" for every other visitor.
    if (cache === "definitive") await env.RISK_CACHE.put(cacheKey, JSON.stringify(verdict)); // no expiry
    else if (cache === "brief") await env.RISK_CACHE.put(cacheKey, JSON.stringify(verdict), { expirationTtl: NEGATIVE_TTL_S });
    log({ event: "check", level: verdict.level });
    return json(verdict, 200, cors);
  } catch {
    log({ event: "failed_closed" }); // KV or counter unavailable: no live call, the client shows "Couldn't verify"
    return json({ level: "unknown" } satisfies Verdict, 200, cors);
  }
}

// ---------------------------------------------------------------- price proxy

const PRICE_ID = /^[a-z0-9-]{1,64}$/;
const PRICE_TTL_S = 15 * 60; // a chart is cached 15 min per CoinGecko id (Cache API: no KV writes, no extra cost)
const PRICE_MAX_POINTS = 96;
const COINGECKO_MARKET_CHART = "https://api.coingecko.com/api/v3/coins";

interface PriceCache {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
}

/** 24 h of USD prices for one CoinGecko id, as {prices: number[]} (at most 96 points). The browser cannot call CoinGecko itself: it is rate-limited and sends no CORS header. */
async function handlePrice(url: URL, cors: Record<string, string>): Promise<Response> {
  const id = url.searchParams.get("id") ?? "";
  if (!PRICE_ID.test(id)) return json({ error: "bad_request" }, 400, cors);
  const cache = (globalThis as { caches?: { default?: PriceCache } }).caches?.default;
  const cacheRequest = new Request(`https://price-cache.invalid/${id}`);
  try {
    const hit = await cache?.match(cacheRequest);
    if (hit) return json(await hit.json(), 200, { ...cors, "Cache-Control": `public, max-age=${PRICE_TTL_S}` });
  } catch {
    // the miss path below still works
  }
  // CoinGecko first; some of its public rate limits hit shared cloud egress addresses, so DefiLlama (keyless, same ids
  // under "coingecko:<id>") is the fallback.
  const series = (await fromCoinGecko(id)) ?? (await fromDefiLlama(id));
  if (!series) return json({ error: "upstream" }, 502, cors);
  const stride = Math.max(1, Math.ceil(series.length / PRICE_MAX_POINTS));
  const body = { prices: series.filter((_, i) => i % stride === 0) };
  try {
    await cache?.put(cacheRequest, new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${PRICE_TTL_S}` } }));
  } catch {
    // not cached this time; the answer is still good
  }
  return json(body, 200, { ...cors, "Cache-Control": `public, max-age=${PRICE_TTL_S}` });
}

async function fromCoinGecko(id: string): Promise<number[] | null> {
  try {
    const res = await fetch(`${COINGECKO_MARKET_CHART}/${id}/market_chart?vs_currency=usd&days=1`, { headers: { Accept: "application/json", "User-Agent": "canvas-wallet-price-proxy" }, signal: AbortSignal.timeout(6000) });
    if (!res.ok) {
      log({ event: "price_upstream", provider: "coingecko", status: res.status });
      return null;
    }
    const data = (await res.json()) as { prices?: unknown };
    const prices = Array.isArray(data.prices) ? data.prices.map((p) => (Array.isArray(p) ? Number(p[1]) : NaN)).filter((n) => Number.isFinite(n)) : [];
    return prices.length > 0 ? prices : null;
  } catch {
    log({ event: "price_upstream", provider: "coingecko", status: "error" });
    return null;
  }
}

async function fromDefiLlama(id: string): Promise<number[] | null> {
  try {
    const res = await fetch(`https://coins.llama.fi/chart/coingecko:${id}?span=${PRICE_MAX_POINTS}&period=15m`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(6000) });
    if (!res.ok) {
      log({ event: "price_upstream", provider: "defillama", status: res.status });
      return null;
    }
    const data = (await res.json()) as { coins?: Record<string, { prices?: Array<{ price?: unknown }> }> };
    const points = data.coins?.[`coingecko:${id}`]?.prices;
    const prices = Array.isArray(points) ? points.map((p) => Number(p?.price)).filter((n) => Number.isFinite(n)) : [];
    return prices.length > 0 ? prices : null;
  } catch {
    log({ event: "price_upstream", provider: "defillama", status: "error" });
    return null;
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") return json({ ok: true }, 200);

    const origin = request.headers.get("Origin");
    if (origin && !allowedOrigins(env).includes(origin)) return json({ error: "forbidden" }, 403);
    const cors = corsHeaders(origin, env);

    if (url.pathname === "/check") {
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
      if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, cors);
      return handleCheck(request, env, cors);
    }
    if (url.pathname === "/price") {
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
      if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405, cors);
      return handlePrice(url, cors);
    }
    return json({ error: "not_found" }, 404, cors);
  },
};

// ---------------------------------------------------------------- Durable Object (thin wrapper)

/** Every operation runs strictly one after another, so the read-modify-write in Counter is atomic. */
export class RiskCounter {
  private counter: Counter;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(state: DurableObjectState) {
    this.counter = new Counter(state.storage);
  }

  fetch(request: Request): Promise<Response> {
    const run = this.queue.then(async () => {
      const { op, key, limit, windowMs } = (await request.json()) as { op: string; key: string; limit: number; windowMs: number };
      if (op === "peek") return json({ count: await this.counter.peek(key, Date.now(), windowMs) }, 200);
      if (op === "take") return json(await this.counter.take(key, limit, Date.now(), windowMs), 200);
      return json({ error: "bad_op" }, 400);
    });
    this.queue = run.catch(() => undefined);
    return run;
  }
}
