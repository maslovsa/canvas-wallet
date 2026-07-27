import { seededRandom } from "./rng.ts";

// Illustrative-only "recent activity" feed (see registry.schema.json's
// widgetHistory description) — every row is generated client-side from a
// seed, never real transaction data, no wallet/backend involved. Seeded by
// the token's own id so the same token shows a stable feed across
// re-renders instead of reshuffling on every keystroke.
export interface HistoryEvent {
  direction: "in" | "out";
  amount: number;
  usd: number;
  /** Epoch ms, always within the last DAYS_SPAN days of `now`. */
  timestamp: number;
}

const MAX_USD = 100;
const MIN_USD = 1;
const DAYS_SPAN = 6;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * `isStablecoin` narrows the synthetic per-unit price to ~$1 so amount and
 * usd don't visibly contradict each other on a card that also shows a real
 * "1 USDT = 1 USD" reserve-info row — without it, "received 1.18 USDT" next
 * to "+$44.38" would look like a bug, not a placeholder. For everything else
 * there's no real price to stay consistent with, so a wide log-scale range
 * is just as illustrative as a narrow one.
 *
 * `now` is injectable (defaults to Date.now()) purely for deterministic
 * tests — it's still the seeded PRNG that decides each event's actual
 * offset, so the same token/seed produces the same *pattern* of dates
 * relative to `now`, not a fixed calendar date that goes stale.
 */
export function generateHistory(seed: string, count = 5, isStablecoin = false, now = Date.now()): HistoryEvent[] {
  const rand = seededRandom(seed);
  const events: HistoryEvent[] = [];
  for (let i = 0; i < count; i++) {
    const usd = MIN_USD + rand() * (MAX_USD - MIN_USD);
    const unitPrice = isStablecoin
      ? 0.97 + rand() * 0.06 // ~$0.97..$1.03, like a real pegged stablecoin
      : Math.pow(10, rand() * 6 - 3); // ~0.001 .. ~1000
    const timestamp = now - Math.floor(rand() * DAYS_SPAN * MS_PER_DAY) - Math.floor(rand() * MS_PER_DAY);
    events.push({
      direction: rand() < 0.5 ? "in" : "out",
      amount: usd / unitPrice,
      usd,
      timestamp,
    });
  }
  // Newest first, like every wallet app's activity list — the direction/
  // amount randomness doesn't imply any particular time order on its own.
  return events.sort((a, b) => b.timestamp - a.timestamp);
}

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatHistoryTimestamp(timestamp: number): string {
  return dateFormatter.format(new Date(timestamp));
}

export function formatAmount(amount: number): string {
  if (amount >= 1000) return amount.toFixed(0);
  if (amount >= 1) return amount.toFixed(2);
  return amount.toPrecision(2);
}
