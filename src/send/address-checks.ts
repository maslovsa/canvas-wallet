// Address validation for the EVM networks (Ethereum, BNB Smart Chain) and TON: pure modules with no DOM access,
// shared by the phone's Send screen, the risk-proxy Worker and CI (like tron-address.ts for Tron). Strict: surrounding
// whitespace is NOT trimmed here (callers trim user input; the Worker must reject padding).
import { keccak256 } from "js-sha3";

export type AddressReason = "empty" | "length" | "charset" | "prefix" | "checksum" | "no_crypto";
export type AddressCheck = { ok: true } | { ok: false; reason: AddressReason };

/**
 * An EVM address: 0x + 40 hex. All-lowercase or all-uppercase carry no checksum; mixed case must be a valid EIP-55
 * checksum (so a typo in a checksummed address is caught).
 */
export function validateEvmAddress(address: string): AddressCheck {
  if (typeof address !== "string" || address.length === 0) return { ok: false, reason: "empty" };
  if (!address.startsWith("0x") && !address.startsWith("0X")) return { ok: false, reason: "prefix" };
  if (address.length !== 42) return { ok: false, reason: "length" };
  if (!/^0[xX][0-9a-fA-F]{40}$/.test(address)) return { ok: false, reason: "charset" };
  const hex = address.slice(2);
  if (hex === hex.toLowerCase() || hex === hex.toUpperCase()) return { ok: true };
  const hash = keccak256(hex.toLowerCase());
  const good = [...hex].every((c, i) => /\d/.test(c) || (parseInt(hash[i]!, 16) >= 8 ? c === c.toUpperCase() : c === c.toLowerCase()));
  return good ? { ok: true } : { ok: false, reason: "checksum" };
}

export function isValidEvmAddress(address: string): boolean {
  return validateEvmAddress(address).ok;
}

/**
 * A TON address in the user-friendly form: 48 base64 / base64url characters = tag (1 byte: 0x11 bounceable or 0x51
 * non-bounceable, +0x80 for testnet) + workchain (1) + account hash (32) + CRC16-XMODEM of the first 34 bytes (2).
 * "UQ..." and "EQ..." are the two usual prefixes of workchain 0.
 */
export function validateTonAddress(address: string): AddressCheck {
  if (typeof address !== "string" || address.length === 0) return { ok: false, reason: "empty" };
  if (address.length !== 48) return { ok: false, reason: "length" };
  if (!/^[A-Za-z0-9_+/=-]{48}$/.test(address)) return { ok: false, reason: "charset" };
  let binary: string;
  try {
    binary = atob(address.replace(/-/g, "+").replace(/_/g, "/"));
  } catch {
    return { ok: false, reason: "charset" };
  }
  if (binary.length !== 36) return { ok: false, reason: "length" };
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  const tag = bytes[0]! & 0x7f;
  if (tag !== 0x11 && tag !== 0x51) return { ok: false, reason: "prefix" };
  let crc = 0;
  for (let i = 0; i < 34; i++) {
    crc ^= bytes[i]! << 8;
    for (let bit = 0; bit < 8; bit++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return bytes[34] === crc >> 8 && bytes[35] === (crc & 0xff) ? { ok: true } : { ok: false, reason: "checksum" };
}

export function isValidTonAddress(address: string): boolean {
  return validateTonAddress(address).ok;
}
