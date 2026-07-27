import { seededRandom } from "../widgets/rng.ts";

// Illustrative-only wallet-home balance — same spirit as src/widgets/history.ts:
// a client-generated number for the phone simulator's token-list screen, never
// a real balance. Seeded by the token's own id so a given token shows a
// stable balance across re-renders instead of reshuffling on every keystroke.
export interface FakeBalance {
  amount: number;
  usd: number;
}

export function generateBalance(seed: string, isStablecoin: boolean): FakeBalance {
  const rand = seededRandom(seed);
  const usd = isStablecoin
    ? 10 + rand() * 5000 // stablecoin holdings tend to look like round dollar amounts
    : Math.pow(10, rand() * 4 - 1); // ~$0.1 .. ~$1000, wide range for volatile assets
  // Same "keep it consistent with a real ~$1 peg" reasoning as history.ts.
  const unitPrice = isStablecoin ? 0.97 + rand() * 0.06 : Math.pow(10, rand() * 6 - 3);
  return { amount: usd / unitPrice, usd };
}
