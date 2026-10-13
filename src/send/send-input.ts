// Amount parsing for the Send screen — exact decimal math with BigInt, never floating point
// (a token can have up to 255 decimals and balances exceed 2^53). Pure module, no DOM access.

const MAX_UNITS = 2n ** 256n - 1n; // uint256, the TRC20 balance type

function assertDecimals(decimals: number): void {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) {
    throw new RangeError(`decimals must be an integer from 0 to 255, got ${decimals}`);
  }
}

export type AmountParse =
  | { ok: true; units: bigint }
  | { ok: false; reason: "empty" | "format" | "too_many_decimals" | "zero" | "too_large" };

/** "10.5" with decimals 6 -> 10_500_000n. Accepts "5", "5.", ".5"; rejects signs, exponents, separators and spaces. */
export function parseAmount(input: string, decimals: number): AmountParse {
  assertDecimals(decimals);
  const text = input.trim();
  if (text === "") return { ok: false, reason: "empty" };
  const match = /^(\d*)(?:\.(\d*))?$/.exec(text);
  if (!match || (match[1] === "" && (match[2] ?? "") === "")) return { ok: false, reason: "format" };

  const whole = match[1] ?? "";
  const fraction = (match[2] ?? "").replace(/0+$/, ""); // trailing zeros carry no value ("1.50" at 1 decimal is fine)
  if (fraction.length > decimals) return { ok: false, reason: "too_many_decimals" };

  const units = BigInt(whole === "" ? "0" : whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, "0") || "0");
  if (units === 0n) return { ok: false, reason: "zero" };
  if (units > MAX_UNITS) return { ok: false, reason: "too_large" };
  return { ok: true, units };
}

/** 10_500_000n with decimals 6 -> "10.5" (no trailing zeros). */
export function formatUnits(units: bigint, decimals: number): string {
  assertDecimals(decimals);
  const base = 10n ** BigInt(decimals);
  const whole = units / base;
  const fraction = (units % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return fraction === "" ? whole.toString() : `${whole}.${fraction}`;
}

/** What "Max" fills: the whole balance for a token; balance minus the fee for the native coin (never below zero). */
export function maxSendable(balanceUnits: bigint, feeUnits: bigint, isNative: boolean): bigint {
  if (!isNative) return balanceUnits;
  return balanceUnits > feeUnits ? balanceUnits - feeUnits : 0n;
}
