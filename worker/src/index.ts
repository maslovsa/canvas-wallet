// Risk-check proxy for the Send window (plan T9). It exists because a static GitHub Pages site cannot
// hold a secret: the Aegis key lives ONLY here, as the Worker secret AEGIS_API_KEY.
//
//   POST /check {"network":"TRON","address":"T..."}  ->  {"level":"clear","label"?:"...","logo"?:"https://..."} | {"level":"caution"} | {"level":"unknown"}
//
// The response is exactly that: never a score, a reason, flags or the Aegis session. A label (the VASP's
// name) and its logo are returned only with a clear result (a name like a mixer or a sanctioned person would
// itself reveal the reason, plan E7; Aegis can name an exchange on an address it also marks as sanctioned). Anything that goes wrong becomes {"level":"unknown"} (fail closed: no live call when the
// cache or the counters are unavailable). Aegis POST /v2/screen is synchronous and costs 0.1 credit per
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
const DEFINITIVE_TTL_S = 24 * 60 * 60; // matches Aegis's 24 h Idempotency-Key replay window
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
    headers["Access-Control-Allow-Methods"] = "POST, OPTIONS";
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

/**
 * Aegis /v2/screen answer -> the three client levels (plan E6) and, for clear only, the owner's name and logo
 * (plan E7). The name is verdict.entity.name (a corroborated VASP), else verdict.label; the logo is only taken
 * together with a name and only if it is an acceptable URL (sanitizeLogoUrl).
 */
export function mapAegisVerdict(body: unknown): Verdict {
  const root = body as {
    verdict?: { risk_level?: unknown; label?: unknown; entity?: { name?: unknown; logo_url?: unknown } | null };
    coverage?: { data_available?: unknown };
  } | null;
  const level = root?.verdict?.risk_level;
  if (level === "medium" || level === "high" || level === "critical" || level === "sanctioned") return { level: "caution" };
  const hasData = root?.coverage?.data_available === true;
  if (level === "low" || (level === "none" && hasData)) {
    const entity = root?.verdict?.entity;
    const label = sanitizeLabel(entity?.name) ?? sanitizeLabel(root?.verdict?.label);
    if (!label) return { level: "clear" };
    const logo = sanitizeLogoUrl(entity?.logo_url);
    return logo ? { level: "clear", label, logo } : { level: "clear", label };
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

/** What to remember about a result: a real Aegis answer for 24 h, an Aegis failure for 60 s, and nothing when WE declined to call (limits, budget, configuration). */
type CachePolicy = "definitive" | "brief" | "none";

async function liveCheck(address: string, request: Request, env: Env): Promise<{ verdict: Verdict; cache: CachePolicy }> {
  const dailyBudget = Number.parseInt(env.DAILY_BUDGET, 10);
  const perVisitor = Number.parseInt(env.PER_VISITOR_PER_HOUR, 10);
  if (!Number.isFinite(dailyBudget) || !Number.isFinite(perVisitor) || !env.AEGIS_API_KEY) return { verdict: { level: "unknown" }, cache: "none" };

  const now = Date.now();
  const c = await counters(env); // any counter failure throws and is caught by the caller: fail closed
  // Read the global budget first; it is only written when a call is really made, so a flood of rejected
  // requests does not burn the Durable Object's free daily writes.
  if ((await c.peek("budget", DAY_MS)) >= dailyBudget) return { verdict: { level: "unknown" }, cache: "none" };
  const visitor = await sha256Hex(request.headers.get("CF-Connecting-IP") ?? "unknown");
  if (!(await c.take(`visitor:${visitor}`, perVisitor, HOUR_MS))) return { verdict: { level: "unknown" }, cache: "none" };
  if (!(await c.take("budget", dailyBudget, DAY_MS))) return { verdict: { level: "unknown" }, cache: "none" };

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

  const cacheKey = `v2:TRON:${address}`;
  try {
    const cached = await env.RISK_CACHE.get(cacheKey);
    if (cached) return json(JSON.parse(cached) as Verdict, 200, cors);
    const { verdict, cache } = await liveCheck(address, request, env);
    // A refusal by our own limits is never cached: it must not turn into "unknown" for every other visitor.
    if (cache !== "none") await env.RISK_CACHE.put(cacheKey, JSON.stringify(verdict), { expirationTtl: cache === "definitive" ? DEFINITIVE_TTL_S : NEGATIVE_TTL_S });
    log({ event: "check", level: verdict.level });
    return json(verdict, 200, cors);
  } catch {
    log({ event: "failed_closed" }); // KV or counter unavailable: no live call, the client shows "Couldn't verify"
    return json({ level: "unknown" } satisfies Verdict, 200, cors);
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
