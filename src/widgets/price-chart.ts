// The one widget that performs a live network call (see registry.schema.json's
// widgetPriceChart description). Deliberately narrow trust surface: the
// domain is a hardcoded constant (never user-supplied, unlike icon/logo/
// background URLs), and coingeckoId is schema-regex-constrained to
// [a-z0-9-]+ so it can only ever be a path segment — encodeURIComponent
// below is defense-in-depth on top of that, not the only guard.
//
// No API key: CoinGecko's public /market_chart endpoint works unauthenticated
// for reasonable, human-driven request volumes (rate-limited per IP). This
// project ships nothing to a static GitHub Pages site that would need to stay
// secret — see CONTRIBUTING.md.
const COINGECKO_BASE = "https://api.coingecko.com/api/v3";

// Cached by "coingeckoId:days", not by token content — a token's JSON can be
// re-parsed on every editor keystroke, and re-fetching the same chart on
// every keystroke would burn through the rate limit almost immediately.
const cache = new Map<string, Promise<number[] | null>>();

export async function fetchPriceHistory(
  coingeckoId: string,
  days: number,
  fetchImpl: typeof fetch = fetch,
): Promise<number[] | null> {
  const key = `${coingeckoId}:${days}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const promise = fetchPriceHistoryUncached(coingeckoId, days, fetchImpl);
  cache.set(key, promise);
  return promise;
}

async function fetchPriceHistoryUncached(
  coingeckoId: string,
  days: number,
  fetchImpl: typeof fetch,
): Promise<number[] | null> {
  const url = `${COINGECKO_BASE}/coins/${encodeURIComponent(coingeckoId)}/market_chart?vs_currency=usd&days=${days}`;
  try {
    const res = await fetchImpl(url);
    if (!res.ok) {
      console.warn(`[price-chart] CoinGecko fetch failed (${res.status}) for "${coingeckoId}" — falling back to a generated placeholder chart.`);
      return null;
    }
    const data = (await res.json()) as { prices?: [number, number][] };
    if (!Array.isArray(data.prices) || data.prices.length === 0) return null;
    return data.prices.map(([, price]) => price);
  } catch (err) {
    console.warn(`[price-chart] CoinGecko fetch error for "${coingeckoId}" — falling back to a generated placeholder chart.`, err);
    return null;
  }
}

// Deterministic (seeded) pseudo-random walk — same coingeckoId always
// produces the same-looking placeholder, rather than jumping on every
// re-render. mulberry32 is a small, well-known PRNG; cryptographic strength
// is irrelevant here, this is a chart placeholder, not a security control.
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (Math.imul(31, hash) + input.charCodeAt(i)) | 0;
  }
  return hash;
}

const PLACEHOLDER_POINTS = 48;

/** A clearly-synthetic-only fallback chart — never presented as real market data by its caller. */
export function generatePlaceholderSeries(seed: string): number[] {
  const rand = mulberry32(hashString(seed));
  const series: number[] = [100];
  for (let i = 1; i < PLACEHOLDER_POINTS; i++) {
    const prev = series[i - 1]!;
    const drift = (rand() - 0.5) * 6;
    series.push(Math.max(1, prev + drift));
  }
  return series;
}

export interface SparklineResult {
  pathD: string;
  latest: number;
  changePct: number;
  isRising: boolean;
}

/** Pure/testable: normalizes a price series into an SVG polyline path plus summary stats. */
export function buildSparkline(prices: number[], width: number, height: number): SparklineResult {
  const first = prices[0]!;
  const last = prices[prices.length - 1]!;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;

  const points = prices.map((price, i) => {
    const x = (i / (prices.length - 1 || 1)) * width;
    const y = height - ((price - min) / range) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return {
    pathD: `M${points.join(" L")}`,
    latest: last,
    changePct: first === 0 ? 0 : ((last - first) / first) * 100,
    isRising: last >= first,
  };
}
