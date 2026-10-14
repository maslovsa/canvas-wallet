// Turns a registry token into what the Send screen needs, and decides up front whether Send can open at
// all. A registry may put a `send` action on ANY token (the schema is network-agnostic), so the built-in
// screen refuses everything it cannot handle explicitly instead of failing later: Send works on the networks that
// have a profile in send-network.ts (Tron, Ethereum, BNB Smart Chain and TON) and their native coin / token standard.
import type { Token } from "../types.ts";
import { generateBalance } from "../ui/fake-balance.ts";
import { SEND_NETWORKS, sendNetworkFor } from "./send-network.ts";
import type { SendTokenInfo } from "./send-session.ts";

export const REFUSAL_UNSUPPORTED = "Send isn't available for this network or token type yet";
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
  const network = sendNetworkFor(networkCanonicalName);
  if (!network) return { ok: false, message: REFUSAL_UNSUPPORTED };
  const isNative = token.type === "NATIVE";
  if (!isNative && token.type !== network.tokenType) return { ok: false, message: REFUSAL_UNSUPPORTED };
  if (!isNative) {
    // The contract address is registry-controlled data: it must be a valid address for the network before any request uses it.
    const check = await network.validateAddress(token.id, subtle);
    if (!check.ok) return { ok: false, message: check.reason === "no_crypto" ? REFUSAL_NO_CRYPTO : REFUSAL_UNSUPPORTED };
  }
  const balance = generateBalance(`${token.id}:${token.symbol}`, token.tags?.includes("stablecoin") ?? false);
  const balanceUnits = toUnits(balance.amount, token.decimals);
  return {
    ok: true,
    info: {
      key: `${network.id}:${token.id}`,
      network: network.id,
      symbol: token.symbol,
      name: token.name,
      decimals: token.decimals,
      isNative,
      contract: isNative ? "native" : token.id,
      balanceUnits,
      nativeBalanceUnits: isNative ? balanceUnits : SEND_NETWORKS[network.id].demoNativeBalanceUnits,
    },
  };
}
