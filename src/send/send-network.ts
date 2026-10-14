// What the Send screen needs to know about a network: how its addresses look and are validated, its native coin, the
// token standard it accepts, its fee estimator, and the code the risk check (Aegis POST /v2/screen) knows it by.
// One profile per network the built-in Send screen supports; anything else is refused up front (send-token.ts).
import type { AddressCheck } from "./address-checks.ts";
import { validateNetworkAddress, normalizeAddress, type NetworkId } from "./network-id.ts";
import { estimateFee as estimateTronFee } from "./tron-fee.ts";
import { estimateEvmFee, typicalEvmFee, EVM_FEE_CHAINS } from "./evm-fee.ts";
import { estimateTonFee } from "./ton-fee.ts";
import type { FeeEstimate, FeeToken } from "./fee.ts";

/** The code Aegis /v2/screen, the risk seed and the address book use for the network. */
export type SendNetworkId = NetworkId;

export interface SendNetwork {
  id: SendNetworkId;
  /** The canonical name in public/networks.json. */
  canonicalName: string;
  nativeSymbol: string;
  nativeDecimals: number;
  /** The `type` of a non-native token this network's Send accepts (the registry's token standard). */
  tokenType: string;
  /** Placeholder of the address field. */
  addressHint: string;
  /** Shown under the field for an address that cannot be valid. */
  invalidMessage: string;
  /** Length of a complete address, and the characters allowed so far: while an address is still being typed, no error is shown. */
  addressLength: number;
  typingPattern: RegExp;
  /** Illustrative native balance used to check the fee can be paid for a token transfer (the real wallet balance is unknown here). */
  demoNativeBalanceUnits: bigint;
  /** A fee assumed before an address (and so a real estimate) exists. */
  typicalFeeUnits: (isNative: boolean) => bigint;
  /** The address as the risk check and the seed key it (EVM addresses compare without case). */
  normalizeAddress: (address: string) => string;
  validateAddress: (address: string, subtle?: SubtleCrypto | null) => Promise<AddressCheck>;
  estimateFee: (token: FeeToken, recipient: string) => Promise<FeeEstimate>;
}

const TRON: SendNetwork = {
  id: "TRON",
  canonicalName: "Tron",
  nativeSymbol: "TRX",
  nativeDecimals: 6,
  tokenType: "TRC20",
  addressHint: "Tron address (starts with T)",
  invalidMessage: "Enter a valid Tron address",
  addressLength: 34,
  typingPattern: /^[1-9A-HJ-NP-Za-km-z]*$/,
  demoNativeBalanceUnits: 250_000_000n, // 250 TRX
  typicalFeeUnits: () => 6_500_000n,
  normalizeAddress: (a) => normalizeAddress("TRON", a),
  validateAddress: (address, subtle) => validateNetworkAddress("TRON", address, subtle),
  estimateFee: (token, recipient) => estimateTronFee(token, recipient),
};

const EVM_TYPING = /^(0[xX])?[0-9a-fA-F]*$/;

const ETHEREUM: SendNetwork = {
  id: "ETH",
  canonicalName: "Ethereum",
  nativeSymbol: "ETH",
  nativeDecimals: 18,
  tokenType: "ERC20",
  addressHint: "Ethereum address (starts with 0x)",
  invalidMessage: "Enter a valid Ethereum address",
  addressLength: 42,
  typingPattern: EVM_TYPING,
  demoNativeBalanceUnits: 500_000_000_000_000_000n, // 0.5 ETH
  typicalFeeUnits: (isNative) => (isNative ? 21_000n : 65_000n) * EVM_FEE_CHAINS.ETH.typicalGasPriceWei,
  normalizeAddress: (a) => normalizeAddress("ETH", a),
  validateAddress: (address) => validateNetworkAddress("ETH", address),
  estimateFee: (token) => estimateEvmFee(EVM_FEE_CHAINS.ETH, token),
};

const BSC: SendNetwork = {
  id: "BSC",
  canonicalName: "BNB Smart Chain",
  nativeSymbol: "BNB",
  nativeDecimals: 18,
  tokenType: "BEP20",
  addressHint: "BNB Smart Chain address (starts with 0x)",
  invalidMessage: "Enter a valid BNB Smart Chain address",
  addressLength: 42,
  typingPattern: EVM_TYPING,
  demoNativeBalanceUnits: 1_000_000_000_000_000_000n, // 1 BNB
  typicalFeeUnits: (isNative) => typicalEvmFee(EVM_FEE_CHAINS.BSC, { type: isNative ? "NATIVE" : "BEP20", id: "" }).units,
  normalizeAddress: (a) => normalizeAddress("BSC", a),
  validateAddress: (address) => validateNetworkAddress("BSC", address),
  estimateFee: (token) => estimateEvmFee(EVM_FEE_CHAINS.BSC, token),
};

const TON: SendNetwork = {
  id: "TON",
  canonicalName: "TON",
  nativeSymbol: "GRAM",
  nativeDecimals: 9,
  tokenType: "JETTON",
  addressHint: "TON address (starts with UQ or EQ)",
  invalidMessage: "Enter a valid TON address",
  addressLength: 48,
  typingPattern: /^[A-Za-z0-9_+/=-]*$/,
  demoNativeBalanceUnits: 100_000_000_000n, // 100 GRAM
  typicalFeeUnits: (isNative) => (isNative ? 5_500_000n : 40_000_000n),
  normalizeAddress: (a) => normalizeAddress("TON", a),
  validateAddress: (address) => validateNetworkAddress("TON", address),
  estimateFee: (token) => estimateTonFee(token),
};

export const SEND_NETWORKS: Readonly<Record<SendNetworkId, SendNetwork>> = { TRON, ETH: ETHEREUM, BSC, TON };

export const SEND_NETWORK_IDS = Object.keys(SEND_NETWORKS) as SendNetworkId[];

/** The profile for a network's canonical name ("Tron", "Ethereum", "BNB Smart Chain", "TON"), or undefined when Send does not support it. */
export function sendNetworkFor(canonicalName: string | undefined): SendNetwork | undefined {
  return Object.values(SEND_NETWORKS).find((n) => n.canonicalName === canonicalName);
}
