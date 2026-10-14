// Shareable URL state for the Studio: which bundled list is open, which network filter is selected and,
// when an asset card is open in the phone, which asset, and (on the Send screen) the destination address. All of it
// lives in the query string so a link like  ?list=aegis-super-list&network=Tron&token=USDT&to=T...  opens exactly that view. Other query parameters
// (for example ?registry=owner/repo) are preserved untouched. Pure functions, no DOM access.

export interface StudioUrlState {
  list?: string;
  network?: string;
  token?: string;
  /** Destination address for the Send screen (a demo link opens Send with this recipient filled in). */
  to?: string;
}

const KEYS = ["list", "network", "token", "to"] as const;
export const MAX_TO_LENGTH = 128;

/** Reads the three keys; empty values count as absent. */
export function parseStudioQuery(search: string): StudioUrlState {
  const params = new URLSearchParams(search);
  const out: StudioUrlState = {};
  for (const key of KEYS) {
    const value = params.get(key)?.trim();
    if (value && (key !== "to" || value.length <= MAX_TO_LENGTH)) out[key] = value;
  }
  return out;
}

/** Returns the new search string (with a leading "?", or "" when nothing is left), keeping unrelated parameters. */
export function buildStudioQuery(currentSearch: string, next: StudioUrlState): string {
  const params = new URLSearchParams(currentSearch);
  for (const key of KEYS) {
    const value = next[key];
    if (value) params.set(key, value);
    else params.delete(key);
  }
  const text = params.toString();
  return text ? `?${text}` : "";
}

/** Case-insensitive lookup that returns the registry's own spelling, or undefined. */
export function findByName<T>(items: readonly T[], wanted: string | undefined, nameOf: (item: T) => string): T | undefined {
  if (!wanted) return undefined;
  const needle = wanted.toLowerCase();
  return items.find((item) => nameOf(item).toLowerCase() === needle);
}
