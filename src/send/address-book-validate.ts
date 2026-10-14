// Strict validation of public/address-book.json for CI (scripts/validate-fixtures.ts). Not part of the site bundle:
// it needs keccak (EIP-55) and runs only in Node.
import { keccak256 } from "js-sha3";
import { validateTronAddress } from "./tron-address.ts";
import { BOOK_NETWORKS, MAX_BOOK_ENTRIES, MAX_COMMENT_LENGTH } from "./address-book.ts";

/** An EVM address is 0x + 40 hex. All-lowercase or all-uppercase carry no checksum; mixed case must be a valid EIP-55 checksum. */
export function isValidEvmAddress(address: string): boolean {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return false;
  const hex = address.slice(2);
  if (hex === hex.toLowerCase() || hex === hex.toUpperCase()) return true;
  const hash = keccak256(hex.toLowerCase());
  return [...hex].every((c, i) => /\d/.test(c) || (parseInt(hash[i]!, 16) >= 8 ? c === c.toUpperCase() : c === c.toLowerCase()));
}

/**
 * A saved name says WHO an address is, never WHY it might be risky: the Send screen's rule is that a reason is not
 * disclosed anywhere, and the book sits right above the risk check. These words are therefore refused in a comment.
 */
export const RISK_WORDING = /sanction|ofac|\bsdn\b|blacklist|black-list|frozen|mixer|laundering|illicit|scam|hack|stolen|exploit|terror|criminal|fraud|designated/i;

export async function validateAddressBook(json: unknown, subtle: SubtleCrypto | null = globalThis.crypto?.subtle ?? null): Promise<string[]> {
  const root = json as { version?: unknown; entries?: unknown } | null;
  if (!root || typeof root !== "object" || root.version !== 1 || !Array.isArray(root.entries)) return ['address book must be {"version": 1, "entries": [...]}'];
  const errors: string[] = [];
  if (root.entries.length > MAX_BOOK_ENTRIES) errors.push(`more than ${MAX_BOOK_ENTRIES} entries`);
  const seen = new Set<string>();
  for (const [i, raw] of root.entries.entries()) {
    const e = raw as Record<string, unknown>;
    const where = `entries[${i}]`;
    for (const key of Object.keys(e)) if (!["network", "address", "comment"].includes(key)) errors.push(`${where}: unexpected key "${key}"`);
    if (!BOOK_NETWORKS.includes(e.network as never)) errors.push(`${where}: network must be one of ${BOOK_NETWORKS.join(", ")}`);
    if (typeof e.address !== "string" || e.address !== e.address.trim() || e.address === "") {
      errors.push(`${where}: address must be a non-empty string without surrounding spaces`);
    } else {
      const key = `${String(e.network)}:${e.address}`;
      if (seen.has(key)) errors.push(`${where}: duplicate ${String(e.network)} address`);
      seen.add(key);
      if (e.network === "TRON") {
        const check = await validateTronAddress(e.address, subtle);
        if (!check.ok) errors.push(`${where}: not a valid Tron address (${check.reason})`);
      } else if ((e.network === "ETH" || e.network === "BSC") && !isValidEvmAddress(e.address)) {
        errors.push(`${where}: not a valid EVM address (0x + 40 hex, EIP-55 when mixed case)`);
      }
    }
    if (typeof e.comment !== "string" || e.comment.trim() === "" || e.comment.length > MAX_COMMENT_LENGTH) {
      errors.push(`${where}: comment must be 1-${MAX_COMMENT_LENGTH} characters`);
    } else if (RISK_WORDING.test(e.comment)) {
      errors.push(`${where}: comment must name the owner, not a risk reason (found "${RISK_WORDING.exec(e.comment)![0]}")`);
    }
  }
  return errors;
}
