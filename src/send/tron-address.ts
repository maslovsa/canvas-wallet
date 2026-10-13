// Tron address validation (Base58Check) — a pure module with no DOM access, shared by the phone's
// Send screen and the risk-proxy Worker (plan decision E9): one implementation, one test table.
// A Tron address is 34 Base58 characters decoding to 25 bytes: 0x41 prefix + 20-byte hash + 4-byte
// checksum, where checksum = first 4 bytes of SHA-256(SHA-256(prefix + hash)). The check is strict:
// surrounding whitespace is NOT trimmed here (callers trim user input; the Worker must reject padding).

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const ADDRESS_LENGTH = 34;
const DECODED_BYTES = 25;
const TRON_PREFIX = 0x41;

export type TronAddressCheck =
  | { ok: true }
  | { ok: false; reason: "empty" | "length" | "charset" | "prefix" | "checksum" | "no_crypto" };

/** Base58 string -> big-endian bytes of exactly `size` bytes, or null if it does not fit. */
function base58ToBytes(text: string, size: number): Uint8Array | null {
  let value = 0n;
  for (const ch of text) {
    value = value * 58n + BigInt(BASE58_ALPHABET.indexOf(ch));
  }
  const bytes = new Uint8Array(size);
  for (let i = size - 1; i >= 0; i -= 1) {
    bytes[i] = Number(value & 0xffn);
    value >>= 8n;
  }
  return value === 0n ? bytes : null;
}

async function sha256(subtle: SubtleCrypto, data: BufferSource) {
  return new Uint8Array(await subtle.digest("SHA-256", data));
}

/**
 * Validate a Tron address. Pass `null` (or run where `crypto.subtle` is missing) to model "no WebCrypto": the answer is `no_crypto` (never "valid"): callers must
 * block Send and say so rather than skip the checksum.
 */
export async function validateTronAddress(
  input: string,
  subtle: SubtleCrypto | null = globalThis.crypto?.subtle ?? null,
): Promise<TronAddressCheck> {
  if (typeof input !== "string" || input.length === 0) return { ok: false, reason: "empty" };
  if (input.length !== ADDRESS_LENGTH) return { ok: false, reason: "length" };
  for (const ch of input) {
    if (!BASE58_ALPHABET.includes(ch)) return { ok: false, reason: "charset" };
  }
  if (!subtle) return { ok: false, reason: "no_crypto" };

  const bytes = base58ToBytes(input, DECODED_BYTES);
  if (!bytes || bytes[0] !== TRON_PREFIX) return { ok: false, reason: "prefix" };

  const payload = bytes.slice(0, 21);
  const checksum = (await sha256(subtle, await sha256(subtle, payload))).slice(0, 4);
  for (let i = 0; i < 4; i += 1) {
    if (checksum[i] !== bytes[21 + i]) return { ok: false, reason: "checksum" };
  }
  return { ok: true };
}

export async function isValidTronAddress(
  input: string,
  subtle: SubtleCrypto | null = globalThis.crypto?.subtle ?? null,
): Promise<boolean> {
  return (await validateTronAddress(input, subtle)).ok;
}
