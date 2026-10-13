// Address risk check for the Send screen. This PR is seed-only: a CI-validated list of demo
// addresses (public/risk-seed.json, produced from Aegis POST /v2/screen results) answers instantly;
// any other address is "unavailable" until the live Worker lands (next PR). The client NEVER holds
// an Aegis key and never sees a score or a reason: a result is only clear, caution or unavailable,
// and a label exists only on a clear result (plan decisions R1, E6, E7).

export type RiskResult =
  | { state: "clear"; label?: string }
  | { state: "caution" }
  | { state: "unavailable" };

export interface SeedEntry {
  network: "TRON";
  address: string;
  level: "clear" | "caution";
  /** Owner label from Aegis; only allowed on a clear entry (a label on a risky address can reveal the reason). */
  label?: string;
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
      if (!["network", "address", "level", "label", "checkedAt"].includes(key)) {
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
  return entry.level === "caution" ? { state: "caution" } : entry.label ? { state: "clear", label: entry.label } : { state: "clear" };
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
}

/** Seed lookup now; the live Worker call is added in the next PR. Anything not answered is "unavailable" (never "safe"). */
export async function checkAddress(address: string, deps: RiskDeps): Promise<RiskResult> {
  return seedLookup(deps.seed, address, deps.now) ?? { state: "unavailable" };
}
