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
import { seededRandom } from "./rng.ts";

const COINGECKO_BASE = "https://api.coingecko.com/api/v3";

// Cached by "coingeckoId:days", not by token content — a token's JSON can be
// re-parsed on every editor keystroke, and re-fetching the same chart on
// every keystroke would burn through the rate limit almost immediately.
const cache = new Map<string, Promise<number[] | null>>();

/**
 * With a Worker URL (VITE_RISK_PROXY_URL) the chart comes from the Worker's /price endpoint: CoinGecko rate-limits
 * browsers and sends no CORS header, so a direct call fails for most visitors. Without one (local dev) it calls
 * CoinGecko directly.
 */
export async function fetchPriceHistory(
  coingeckoId: string,
  days: number,
  fetchImpl: typeof fetch = fetch,
  proxyUrl: string | undefined = import.meta.env.VITE_RISK_PROXY_URL,
): Promise<number[] | null> {
  const key = `${coingeckoId}:${days}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const promise = proxyUrl && days === 1 ? fetchViaProxy(coingeckoId, proxyUrl, fetchImpl) : fetchPriceHistoryUncached(coingeckoId, days, fetchImpl);
  cache.set(key, promise);
  return promise;
}

async function fetchViaProxy(coingeckoId: string, proxyUrl: string, fetchImpl: typeof fetch): Promise<number[] | null> {
  try {
    const res = await fetchImpl(`${proxyUrl.replace(/\/+$/, "")}/price?id=${encodeURIComponent(coingeckoId)}`, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const data = (await res.json()) as { prices?: unknown };
    if (!Array.isArray(data.prices) || data.prices.length === 0) return null;
    const prices = data.prices.filter((p): p is number => typeof p === "number" && Number.isFinite(p));
    return prices.length > 0 ? prices : null;
  } catch {
    return null;
  }
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

const PLACEHOLDER_POINTS = 48;

/** A clearly-synthetic-only fallback chart — never presented as real market data by its caller. */
export function generatePlaceholderSeries(seed: string): number[] {
  const rand = seededRandom(seed);
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

// ---- Full chart: smooth line, soft area, grid with price labels, and a scrub position per point -------------------

export interface ChartPoint {
  x: number;
  y: number;
}

export interface ChartGeometry {
  points: ChartPoint[];
  /** Smooth (monotone cubic) line through every point. */
  linePath: string;
  /** The same line closed down to the baseline, for the gradient fill. */
  areaPath: string;
  /** Grid lines from the highest to the lowest price (top, middle, bottom). */
  ticks: { y: number; value: number }[];
  /** Right edge of the plotted line; price labels sit to its right. */
  plotRight: number;
  baseline: number;
}

export interface ChartLayout {
  width: number;
  height: number;
  padTop: number;
  padBottom: number;
  /** Space reserved at the right for the price labels. */
  gutterRight: number;
}

/** Monotone cubic (Fritsch–Carlson) Bézier path: smooth like a modern chart, but never overshoots a real high or low. */
export function smoothPath(points: ChartPoint[]): string {
  const n = points.length;
  if (n === 0) return "";
  if (n === 1) return `M${points[0]!.x.toFixed(1)},${points[0]!.y.toFixed(1)}`;
  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const w = points[i + 1]!.x - points[i]!.x || 1e-9;
    dx.push(w);
    slope.push((points[i + 1]!.y - points[i]!.y) / w);
  }
  const tangent: number[] = [slope[0]!];
  for (let i = 1; i < n - 1; i++) tangent.push(slope[i - 1]! * slope[i]! <= 0 ? 0 : (slope[i - 1]! + slope[i]!) / 2);
  tangent.push(slope[n - 2]!);
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) {
      tangent[i] = 0;
      tangent[i + 1] = 0;
      continue;
    }
    const a = tangent[i]! / slope[i]!;
    const b = tangent[i + 1]! / slope[i]!;
    const h = Math.hypot(a, b);
    if (h > 3) {
      tangent[i] = (3 * a * slope[i]!) / h;
      tangent[i + 1] = (3 * b * slope[i]!) / h;
    }
  }
  let d = `M${points[0]!.x.toFixed(1)},${points[0]!.y.toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const p = points[i]!;
    const q = points[i + 1]!;
    const w = dx[i]! / 3;
    d += ` C${(p.x + w).toFixed(1)},${(p.y + tangent[i]! * w).toFixed(1)} ${(q.x - w).toFixed(1)},${(q.y - tangent[i + 1]! * w).toFixed(1)} ${q.x.toFixed(1)},${q.y.toFixed(1)}`;
  }
  return d;
}

/** Pure/testable: lays a price series out in a box (x evenly spaced, y scaled between the series' low and high). */
export function buildChartGeometry(prices: number[], layout: ChartLayout): ChartGeometry {
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const plotRight = layout.width - layout.gutterRight;
  const top = layout.padTop;
  const baseline = layout.height - layout.padBottom;
  const yFor = (v: number) => baseline - ((v - min) / range) * (baseline - top);
  const points = prices.map((v, i) => ({ x: (i / (prices.length - 1 || 1)) * plotRight, y: max === min ? (top + baseline) / 2 : yFor(v) }));
  const linePath = smoothPath(points);
  const last = points[points.length - 1]!;
  const areaPath = `${linePath} L${last.x.toFixed(1)},${layout.height} L${points[0]!.x.toFixed(1)},${layout.height} Z`;
  const ticks = [max, (max + min) / 2, min].map((value) => ({ value, y: max === min ? (top + baseline) / 2 : yFor(value) }));
  return { points, linePath, areaPath, ticks, plotRight, baseline };
}

/**
 * A grid label: "$67,432", "$3.42", "$0.0123". `step` is the distance between grid lines: a stablecoin's whole day can
 * span a hundredth of a cent, and then the labels get as many decimals as it takes for the three of them to differ.
 */
export function formatAxisPrice(v: number, step = 0): string {
  if (step > 0) {
    if (v >= 1000 && step >= 1) return `$${Math.round(v).toLocaleString("en-US")}`;
    const decimals = Math.min(6, Math.max(v >= 1 ? 2 : 3, Math.ceil(-Math.log10(step))));
    return `$${v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
  }
  if (v >= 1000) return `$${Math.round(v).toLocaleString("en-US")}`;
  if (v >= 1) return `$${v.toFixed(2)}`;
  return `$${v.toPrecision(3)}`;
}

/** The headline price: cents above $1, three significant digits below, thousands separated. */
export function formatPrice(v: number): string {
  if (v >= 1) return `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `$${v.toPrecision(3)}`;
}

/** The moment of point `index` out of `count`, spread evenly over the last `days` days ending at `now`. */
export function pointTime(index: number, count: number, days: number, now: number): Date {
  const fraction = count > 1 ? index / (count - 1) : 1;
  return new Date(now - (1 - fraction) * days * 86_400_000);
}

export function formatPointTime(date: Date, days: number): string {
  return days <= 1
    ? date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })
    : date.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + (days <= 7 ? `, ${date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}` : "");
}

/** "24h ago", "7d ago": the left end of the time axis (the right end is always "Now"). */
export function rangeLabel(days: number): string {
  return days <= 1 ? "24h ago" : `${Math.round(days)}d ago`;
}
