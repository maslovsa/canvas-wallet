// Network-fee ESTIMATE for an Ethereum / BNB Smart Chain send: the node's current gas price (keyless public RPC,
// CORS-open) times a typical gas amount. Always labeled an estimate; nothing here signs or broadcasts.
//   native transfer: 21,000 gas.   token (ERC-20 / BEP-20) transfer: ~65,000 gas.
// Any failure: the typical gas price below, flagged kind "typical" - never zero, never shown as live.
import type { FeeEstimate, FeeToken } from "./fee.ts";

const GAS_NATIVE = 21_000n;
const GAS_TOKEN = 65_000n;

export interface EvmFeeChain {
  rpc: string;
  /** Wei per gas to assume when the node cannot be reached. */
  typicalGasPriceWei: bigint;
}

export const EVM_FEE_CHAINS = {
  ETH: { rpc: "https://ethereum-rpc.publicnode.com", typicalGasPriceWei: 1_000_000_000n }, // 1 gwei
  BSC: { rpc: "https://bsc-rpc.publicnode.com", typicalGasPriceWei: 100_000_000n }, // 0.1 gwei
} as const satisfies Record<string, EvmFeeChain>;

const gasFor = (token: FeeToken): bigint => (token.type === "NATIVE" ? GAS_NATIVE : GAS_TOKEN);

export function typicalEvmFee(chain: EvmFeeChain, token: FeeToken): FeeEstimate {
  return { kind: "typical", newRecipient: false, units: gasFor(token) * chain.typicalGasPriceWei };
}

export async function estimateEvmFee(chain: EvmFeeChain, token: FeeToken, fetchImpl: typeof fetch = fetch, timeoutMs = 5000): Promise<FeeEstimate> {
  try {
    const res = await fetchImpl(chain.rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_gasPrice", params: [] }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`rpc ${res.status}`);
    const result = ((await res.json()) as { result?: unknown }).result;
    if (typeof result !== "string" || !/^0x[0-9a-f]+$/i.test(result)) throw new Error("no gas price");
    const price = BigInt(result);
    if (price === 0n) throw new Error("zero gas price");
    return { kind: "live", newRecipient: false, units: gasFor(token) * price };
  } catch {
    return typicalEvmFee(chain, token);
  }
}
