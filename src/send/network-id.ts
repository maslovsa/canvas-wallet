// The networks the Send screen, the risk check (Aegis POST /v2/screen), the risk seed and the address book share, by the
// code they all use, plus one place that validates an address for any of them. Pure: no DOM, no network access.
import { validateTronAddress } from "./tron-address.ts";
import { validateEvmAddress, validateTonAddress, type AddressCheck } from "./address-checks.ts";

export const NETWORK_IDS = ["TRON", "ETH", "BSC", "TON"] as const;
export type NetworkId = (typeof NETWORK_IDS)[number];

export function isNetworkId(value: unknown): value is NetworkId {
  return typeof value === "string" && (NETWORK_IDS as readonly string[]).includes(value);
}

/** Length of a complete address of the network, used for cheap shape checks. */
export const ADDRESS_LENGTH: Readonly<Record<NetworkId, number>> = { TRON: 34, ETH: 42, BSC: 42, TON: 48 };

/** Validates an address for the network. Tron needs WebCrypto (SHA-256): without it the answer is `no_crypto`, never "valid". */
export async function validateNetworkAddress(network: NetworkId, address: string, subtle?: SubtleCrypto | null): Promise<AddressCheck> {
  switch (network) {
    case "TRON":
      return subtle === undefined ? validateTronAddress(address) : validateTronAddress(address, subtle);
    case "ETH":
    case "BSC":
      return validateEvmAddress(address);
    case "TON":
      return validateTonAddress(address);
  }
}

/** The address as the risk check and the seed key it: EVM addresses compare without case, the others exactly. */
export function normalizeAddress(network: NetworkId, address: string): string {
  return network === "ETH" || network === "BSC" ? address.toLowerCase() : address;
}
