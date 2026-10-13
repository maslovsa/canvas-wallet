// Turns a registry token into what the Send screen needs, and decides up front whether Send can open at
// all. A registry may put a `send` action on ANY token (the schema is network-agnostic), so the built-in
// screen refuses everything it cannot handle explicitly instead of failing later: v1 sends only on Tron.
import type { Token } from "../types.ts";
import { generateBalance } from "../ui/fake-balance.ts";
import { validateTronAddress } from "./tron-address.ts";
import type { SendTokenInfo } from "./send-session.ts";

/** Illustrative TRX balance used to check that a token transfer's fee can be paid (the real wallet balance is unknown here). */
export const DEMO_TRX_BALANCE_UNITS = 250_000_000n;

export const REFUSAL_NOT_TRON = "Send is available for Tron tokens only";
export const REFUSAL_NO_CRYPTO = "Can't verify addresses in this browser. Send is unavailable.";

export type SendPreparation = { ok: true; info: SendTokenInfo } | { ok: false; message: string };

/** Illustrative float amount -> base units: at most 6 decimals of the float are kept, the rest is zero-padded. */
export function toUnits(amount: number, decimals: number): bigint {
  const places = Math.min(decimals, 6);
  return BigInt(Math.floor(amount * 10 ** places)) * 10n ** BigInt(decimals - places);
}

export async function prepareSend(
  token: Token,
  networkCanonicalName: string | undefined,
  subtle: SubtleCrypto | null = globalThis.crypto?.subtle ?? null,
): Promise<SendPreparation> {
  if (networkCanonicalName !== "Tron") return { ok: false, message: REFUSAL_NOT_TRON };
  const isNative = token.type === "NATIVE";
  if (!isNative && token.type !== "TRC20") return { ok: false, message: REFUSAL_NOT_TRON };
  if (!isNative) {
    // The contract address is registry-controlled data: it must be a valid Tron address before any request uses it.
    const check = await validateTronAddress(token.id, subtle);
    if (!check.ok) return { ok: false, message: check.reason === "no_crypto" ? REFUSAL_NO_CRYPTO : REFUSAL_NOT_TRON };
  }
  const balance = generateBalance(`${token.id}:${token.symbol}`, token.tags?.includes("stablecoin") ?? false);
  const balanceUnits = toUnits(balance.amount, token.decimals);
  return {
    ok: true,
    info: {
      key: `Tron:${token.id}`,
      symbol: token.symbol,
      name: token.name,
      decimals: token.decimals,
      isNative,
      contract: isNative ? "native" : token.id,
      balanceUnits,
      trxBalanceUnits: isNative ? balanceUnits : DEMO_TRX_BALANCE_UNITS,
    },
  };
}
