// Network-fee types and formatting shared by every network's estimator (tron-fee.ts, evm-fee.ts, ton-fee.ts).
// The fee is always an ESTIMATE in the network's native coin, in its smallest unit (SUN, wei, nanoton).

export interface FeeToken {
  type: string; // "NATIVE" or the network's token standard
  id: string; // contract / master address for a token
}

export interface FeeEstimate {
  /** "live": prices came from the network. "typical": fallback figures. */
  kind: "live" | "typical";
  /** The fee in the native coin's smallest unit. */
  units: bigint;
  /** The recipient is new (empty token balance, or an account that does not exist yet), which makes the fee higher. */
  newRecipient: boolean;
}

/**
 * Native smallest units -> a short decimal: one decimal from 1 up ("6.5", "13.0", rounded half up), and two significant
 * digits below 1 ("0.3", "0.00055", "0.000031"), trailing zeros dropped. Integer math only.
 */
export function formatFeeAmount(units: bigint, decimals: number): string {
  const base = 10n ** BigInt(decimals);
  if (units >= base) {
    const step = base / 10n || 1n;
    const tenths = (units + step / 2n) / step;
    return `${tenths / 10n}.${tenths % 10n}`;
  }
  if (units === 0n) return "0.0";
  const leadingZeros = decimals - units.toString().length; // zeros right after the decimal point
  const places = BigInt(leadingZeros + 2); // two significant digits
  const scale = 10n ** places;
  const rounded = (units * scale + base / 2n) / base;
  if (rounded >= scale) return "1.0"; // 0.996 rounds up to a whole unit
  return `0.${rounded.toString().padStart(Number(places), "0").replace(/0+$/, "")}`;
}
