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
}

const MAX_USD = 100;
const MIN_USD = 1;

/**
 * `isStablecoin` narrows the synthetic per-unit price to ~$1 so amount and
 * usd don't visibly contradict each other on a card that also shows a real
 * "1 USDT = 1 USD" reserve-info row — without it, "received 1.18 USDT" next
 * to "+$44.38" would look like a bug, not a placeholder. For everything else
 * there's no real price to stay consistent with, so a wide log-scale range
 * is just as illustrative as a narrow one.
 */
export function generateHistory(seed: string, count = 5, isStablecoin = false): HistoryEvent[] {
  const rand = seededRandom(seed);
  const events: HistoryEvent[] = [];
  for (let i = 0; i < count; i++) {
    const usd = MIN_USD + rand() * (MAX_USD - MIN_USD);
    const unitPrice = isStablecoin
      ? 0.97 + rand() * 0.06 // ~$0.97..$1.03, like a real pegged stablecoin
      : Math.pow(10, rand() * 6 - 3); // ~0.001 .. ~1000
    events.push({
      direction: rand() < 0.5 ? "in" : "out",
      amount: usd / unitPrice,
      usd,
    });
  }
  return events;
}

export function formatAmount(amount: number): string {
  if (amount >= 1000) return amount.toFixed(0);
  if (amount >= 1) return amount.toFixed(2);
  return amount.toPrecision(2);
}
