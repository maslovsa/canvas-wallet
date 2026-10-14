// Network-fee ESTIMATE for a Tron send, from keyless TronGrid (no secret, CORS-open). Always labeled an
// estimate: the Send screen is a simulation and nothing here ever signs or broadcasts.
//
//   TRC20 transfer: energy x energy price. A USDT transfer costs ~65k energy to an address that already
//     holds the token and ~130k to an empty one (measured on TronGrid, 2026-10-13: 64,285 / 130,285).
//     "Holds the token?" comes from a free read-only balanceOf call, so no sender wallet is needed
//     (a simulated transfer from an address without USDT reverts and gives no estimate).
//   Native TRX transfer: bandwidth (~345 bytes x price) plus the account-creation fee when the
//     recipient account does not exist yet.
//   Any failure: the typical figures below, flagged kind "typical" — never zero, never shown as live.

import type { FeeEstimate, FeeToken } from "./fee.ts";

export type { FeeEstimate, FeeToken };

const TRONGRID = "https://api.trongrid.io";

const TYPICAL = {
  energyPriceSun: 100n, // SUN per energy unit
  bandwidthPriceSun: 1000n, // SUN per byte
  newAccountFeeSun: 1_000_000n, // 1 TRX
  energyExisting: 65_000n,
  energyNewHolder: 130_000n,
  nativeBytes: 345n,
};

interface ChainPrices {
  energyPriceSun: bigint;
  bandwidthPriceSun: bigint;
  newAccountFeeSun: bigint;
}

let pricesPromise: Promise<ChainPrices | null> | undefined;

/** For tests. */
export function resetFeeCache(): void {
  pricesPromise = undefined;
}

async function getJson(fetchImpl: typeof fetch, url: string, body: unknown, timeoutMs: number): Promise<any> {
  const signal = AbortSignal.timeout(timeoutMs);
  const res =
    body === undefined
      ? await fetchImpl(url, { signal })
      : await fetchImpl(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal,
        });
  if (!res.ok) throw new Error(`TronGrid ${res.status}`);
  return res.json();
}

/** Chain prices, fetched once per session; null when TronGrid is unreachable or answers something unexpected. */
function loadPrices(fetchImpl: typeof fetch, timeoutMs: number): Promise<ChainPrices | null> {
  pricesPromise ??= (async () => {
    try {
      const data = await getJson(fetchImpl, `${TRONGRID}/wallet/getchainparameters`, undefined, timeoutMs);
      const byKey = new Map<string, number>(
        (data.chainParameter as Array<{ key: string; value: number }>).map((p) => [p.key, p.value]),
      );
      const energy = byKey.get("getEnergyFee");
      const tx = byKey.get("getTransactionFee");
      const create = byKey.get("getCreateNewAccountFeeInSystemContract");
      if (!energy || !tx || !create) return null;
      return { energyPriceSun: BigInt(energy), bandwidthPriceSun: BigInt(tx), newAccountFeeSun: BigInt(create) };
    } catch {
      return null;
    }
  })();
  return pricesPromise;
}

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
/** Tron base58 address -> 20-byte hex (the 0x41 prefix dropped) left-padded to a 32-byte ABI word. */
function abiAddressWord(address: string): string {
  let value = 0n;
  for (const ch of address) value = value * 58n + BigInt(BASE58.indexOf(ch));
  const bytes = new Uint8Array(25);
  for (let i = 24; i >= 0; i -= 1) {
    bytes[i] = Number(value & 0xffn);
    value >>= 8n;
  }
  return Array.from(bytes.slice(1, 21), (b) => b.toString(16).padStart(2, "0")).join("").padStart(64, "0");
}

/** Does the recipient already hold this TRC20 token? (read-only balanceOf; any owner address is accepted by TronGrid) */
async function holdsToken(fetchImpl: typeof fetch, contract: string, recipient: string, timeoutMs: number): Promise<boolean> {
  const data = await getJson(
    fetchImpl,
    `${TRONGRID}/wallet/triggerconstantcontract`,
    {
      owner_address: recipient,
      contract_address: contract,
      function_selector: "balanceOf(address)",
      parameter: abiAddressWord(recipient),
      visible: true,
    },
    timeoutMs,
  );
  const word = data?.constant_result?.[0];
  if (typeof word !== "string") throw new Error("no balanceOf result");
  return /[1-9a-f]/i.test(word);
}

/** Does the recipient account exist on chain? (getaccount answers {} for an address that was never activated) */
async function accountExists(fetchImpl: typeof fetch, recipient: string, timeoutMs: number): Promise<boolean> {
  const data = await getJson(fetchImpl, `${TRONGRID}/wallet/getaccount`, { address: recipient, visible: true }, timeoutMs);
  return data !== null && typeof data === "object" && Object.keys(data).length > 0;
}

function typicalEstimate(token: FeeToken, newRecipient: boolean): FeeEstimate {
  return { kind: "typical", newRecipient, units: compute(token, newRecipient, TYPICAL) };
}

function compute(token: FeeToken, newRecipient: boolean, p: { energyPriceSun: bigint; bandwidthPriceSun: bigint; newAccountFeeSun: bigint }): bigint {
  if (token.type === "NATIVE") {
    return TYPICAL.nativeBytes * p.bandwidthPriceSun + (newRecipient ? p.newAccountFeeSun : 0n);
  }
  return (newRecipient ? TYPICAL.energyNewHolder : TYPICAL.energyExisting) * p.energyPriceSun;
}

export async function estimateFee(
  token: FeeToken,
  recipient: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 5000,
): Promise<FeeEstimate> {
  const prices = await loadPrices(fetchImpl, timeoutMs);
  if (!prices) return typicalEstimate(token, false);
  try {
    const newRecipient =
      token.type === "NATIVE" ? !(await accountExists(fetchImpl, recipient, timeoutMs)) : !(await holdsToken(fetchImpl, token.id, recipient, timeoutMs));
    return { kind: "live", newRecipient, units: compute(token, newRecipient, prices) };
  } catch {
    return typicalEstimate(token, false);
  }
}
