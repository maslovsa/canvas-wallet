// Network-fee ESTIMATE for a TON send. TON fees are small and nearly flat, so this uses typical figures only (kind
// "typical", always labeled so): a native transfer costs about 0.0055 GRAM; a jetton transfer about 0.04 GRAM (the
// wallet attaches more for the jetton wallets' own execution and the unused part comes back). Nothing is signed or sent.
import type { FeeEstimate, FeeToken } from "./fee.ts";

const NATIVE_NANO = 5_500_000n; // 0.0055
const JETTON_NANO = 40_000_000n; // 0.04

export async function estimateTonFee(token: FeeToken): Promise<FeeEstimate> {
  return { kind: "typical", newRecipient: false, units: token.type === "NATIVE" ? NATIVE_NANO : JETTON_NANO };
}
