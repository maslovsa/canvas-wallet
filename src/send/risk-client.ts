// Address risk check for the Send screen. Two sources, in this order (plan decision R1):
//  1. a CI-validated seed of demo addresses (public/risk-seed.json, produced from Aegis POST /v2/screen
//     results): instant, free, works offline;
//  2. the risk-check Worker (VITE_RISK_PROXY_URL), which holds the Aegis key. Without that URL the site is
//     seed-only and every other address is "unavailable".
// The client NEVER holds an Aegis key and never sees a score or a reason: a result is only clear, caution
// or unavailable. A label (a VASP's name) and its logo may accompany clear and caution results (plan R14; the Worker
// only sends a corroborated VASP identity on caution); never a score or a reason (plan decisions R1, E6, E7).
import { sanitizeLogoUrl } from "./entity-logo.ts";

export type RiskResult =
  | { state: "clear"; label?: string; logo?: string }
  | { state: "caution"; label?: string; logo?: string }
  | { state: "unavailable" };

export interface SeedEntry {
  network: "TRON";
  address: string;
  level: "clear" | "caution";
  /** Owner label from Aegis; only allowed on a clear entry (a label on a risky address can reveal the reason). */
  label?: string;
  /** Logo URL of the labelled VASP (jsDelivr PNG, see entity-logo.ts); only with a label on a clear entry. */
  logo?: string;
  /** ISO date (YYYY-MM-DD) the entry was checked; entries older than SEED_MAX_AGE_DAYS count as a miss. */
  checkedAt: string;
}

export const SEED_MAX_AGE_DAYS = 90;
export const SEED_MAX_ENTRIES = 200;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_LABEL_LENGTH = 60;
const FORBIDDEN_KEYS = ["score", "risk_score", "reason", "reasons", "flags", "categories", "risk_level"];

/** Strict shape check used by CI (scripts/validate-fixtures.ts). Returns human-readable errors; empty means valid. */
export function validateSeedShape(json: unknown): string[] {
  const errors: string[] = [];
  const root = json as { version?: unknown; entries?: unknown } | null;
  if (!root || typeof root !== "object" || root.version !== 1 || !Array.isArray(root.entries)) {
    return ['seed must be {"version": 1, "entries": [...]}'];
  }
  if (root.entries.length > SEED_MAX_ENTRIES) errors.push(`more than ${SEED_MAX_ENTRIES} entries`);
  const seen = new Set<string>();
  root.entries.forEach((raw, i) => {
    const e = raw as Record<string, unknown>;
    const where = `entries[${i}]`;
    for (const key of Object.keys(e)) {
      if (!["network", "address", "level", "label", "logo", "checkedAt"].includes(key)) {
        errors.push(`${where}: unexpected key "${key}"${FORBIDDEN_KEYS.includes(key) ? " (scores and reasons must never be stored)" : ""}`);
      }
    }
    if (e.network !== "TRON") errors.push(`${where}: network must be "TRON"`);
    if (typeof e.address !== "string" || e.address.length !== 34) errors.push(`${where}: address must be a 34-character string`);
    else if (seen.has(e.address)) errors.push(`${where}: duplicate address`);
    else seen.add(e.address);
    if (e.level !== "clear" && e.level !== "caution") errors.push(`${where}: level must be "clear" or "caution"`);
    if (e.label !== undefined) {
      if (e.level !== "clear") errors.push(`${where}: a caution entry must not carry a label`);
      if (typeof e.label !== "string" || e.label.length === 0 || e.label.length > MAX_LABEL_LENGTH) {
        errors.push(`${where}: label must be 1-${MAX_LABEL_LENGTH} characters`);
      }
    }
    if (e.logo !== undefined && (e.level !== "clear" || e.label === undefined || sanitizeLogoUrl(e.logo) === undefined)) {
      errors.push(`${where}: logo must be an acceptable https jsDelivr .png URL, and only on a clear entry that has a label`);
    }
    if (typeof e.checkedAt !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(e.checkedAt) || Number.isNaN(Date.parse(e.checkedAt))) {
      errors.push(`${where}: checkedAt must be a YYYY-MM-DD date`);
    }
  });
  return errors;
}

/** Lenient runtime parse: keeps only well-formed entries, never throws (a bad seed must not break the screen). */
export function parseSeed(json: unknown): SeedEntry[] {
  const entries = (json as { entries?: unknown } | null)?.entries;
  if (!Array.isArray(entries)) return [];
  return entries
    .filter((raw): raw is SeedEntry => validateSeedShape({ version: 1, entries: [raw] }).length === 0)
    .slice(0, SEED_MAX_ENTRIES);
}

/** Seed answer for an address, or null on a miss (unknown address or an entry older than 90 days). */
export function seedLookup(entries: SeedEntry[], address: string, now: Date): RiskResult | null {
  const entry = entries.find((e) => e.address === address);
  if (!entry) return null;
  const ageDays = (now.getTime() - Date.parse(entry.checkedAt)) / DAY_MS;
  if (!(ageDays <= SEED_MAX_AGE_DAYS)) return null; // also false for NaN/future-dated garbage
  if (entry.level === "caution") return { state: "caution" };
  if (!entry.label) return { state: "clear" };
  return entry.logo ? { state: "clear", label: entry.label, logo: entry.logo } : { state: "clear", label: entry.label };
}

let seedPromise: Promise<SeedEntry[]> | undefined;

/** Loads public/risk-seed.json once per page load. The URL always goes through BASE_URL (the site is served from a sub-path on GitHub Pages). */
export function loadSeed(
  fetchImpl: typeof fetch = fetch,
  baseUrl: string = import.meta.env.BASE_URL,
  timeoutMs = 5000,
): Promise<SeedEntry[]> {
  seedPromise ??= (async () => {
    try {
      const res = await fetchImpl(`${baseUrl}risk-seed.json`, { signal: AbortSignal.timeout(timeoutMs) });
      return res.ok ? parseSeed(await res.json()) : [];
    } catch {
      return []; // a missing seed only means every address is "unavailable"
    }
  })();
  return seedPromise;
}

/** For tests. */
export function resetSeedCache(): void {
  seedPromise = undefined;
}

export interface RiskDeps {
  seed: SeedEntry[];
  now: Date;
  /** Base URL of the risk-check Worker; undefined or empty means seed-only. */
  proxyUrl?: string | undefined;
  fetchImpl?: typeof fetch;
  /** Must stay below the screen's 15 s ceiling (plan R10). */
  timeoutMs?: number;
}

/**
 * Parses the Worker's answer strictly: {level:"clear"|"caution", label?, logo?} (a logo only with a label, and
 * only an acceptable URL). A label or logo on any other level is not trusted.
 * Anything else (extra keys, an unknown level, a label on caution) is treated as unavailable rather than trusted.
 */
export function parseProxyAnswer(body: unknown): RiskResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { state: "unavailable" };
  const keys = Object.keys(body);
  const { level, label, logo } = body as { level?: unknown; label?: unknown; logo?: unknown };
  if (keys.some((k) => k !== "level" && k !== "label" && k !== "logo")) return { state: "unavailable" };
  if (level === "clear" || level === "caution") {
    const state = level;
    if (label === undefined && logo === undefined) return { state };
    if (typeof label === "string" && label.length > 0 && label.length <= MAX_LABEL_LENGTH) {
      if (logo === undefined) return { state, label };
      const safe = sanitizeLogoUrl(logo);
      if (safe) return { state, label, logo: safe };
    }
  }
  return { state: "unavailable" }; // "unknown", garbage, or a label where none is allowed
}

/** One POST to the Worker. Never throws: any failure is "unavailable". */
export async function proxyCheck(address: string, proxyUrl: string, fetchImpl: typeof fetch = fetch, timeoutMs = 14_000): Promise<RiskResult> {
  try {
    const res = await fetchImpl(`${proxyUrl.replace(/\/+$/, "")}/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ network: "TRON", address }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return { state: "unavailable" };
    return parseProxyAnswer(await res.json());
  } catch {
    return { state: "unavailable" };
  }
}

/** Seed first; on a miss, the Worker when one is configured. Anything not answered is "unavailable" (never "safe"). */
export async function checkAddress(address: string, deps: RiskDeps): Promise<RiskResult> {
  const fromSeed = seedLookup(deps.seed, address, deps.now);
  if (fromSeed) return fromSeed;
  if (!deps.proxyUrl) return { state: "unavailable" };
  return proxyCheck(address, deps.proxyUrl, deps.fetchImpl, deps.timeoutMs);
}
