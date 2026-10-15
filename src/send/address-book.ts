// The address book offered by the Send screen's book button: a static list of saved recipients (network, address,
// comment) read from public/address-book.json. Entries are shown for the network being sent on, so a Tron send lists
// the Tron entries only. This module is bundled with the site; the strict validator used by CI lives in
// address-book-validate.ts and is not.
import { sanitizeAvatarUrl } from "./avatar-url.ts";

export type BookNetwork = "ETH" | "BSC" | "TRON" | "TON";

export interface AddressBookEntry {
  network: BookNetwork;
  address: string;
  comment: string;
  /** A picture of the owner: an https image URL on an accepted host (see avatar-url.ts). Optional; the initial letter is the fallback. */
  avatar?: string;
}

export const BOOK_NETWORKS: readonly BookNetwork[] = ["ETH", "BSC", "TRON", "TON"];
export const MAX_COMMENT_LENGTH = 80;
export const MAX_BOOK_ENTRIES = 200;

/** The book's network code for a canonical network name from networks.json, or undefined when the book has none for it. */
export function bookNetworkFor(canonicalName: string | undefined): BookNetwork | undefined {
  switch (canonicalName) {
    case "Tron":
      return "TRON";
    case "Ethereum":
      return "ETH";
    case "BNB Smart Chain":
      return "BSC";
    case "TON":
      return "TON";
    default:
      return undefined;
  }
}

/** Lenient runtime parse: keeps only well-formed entries, never throws (a bad book must not break the Send screen). */
export function parseAddressBook(json: unknown): AddressBookEntry[] {
  const raw = (json as { entries?: unknown } | null)?.entries;
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const entries: AddressBookEntry[] = [];
  for (const item of raw.slice(0, MAX_BOOK_ENTRIES)) {
    const e = item as Partial<AddressBookEntry> | null;
    if (!e || !BOOK_NETWORKS.includes(e.network as BookNetwork)) continue;
    if (typeof e.address !== "string" || e.address.length < 20 || e.address.length > 64 || e.address !== e.address.trim()) continue;
    if (typeof e.comment !== "string" || e.comment.trim() === "" || e.comment.length > MAX_COMMENT_LENGTH) continue;
    const key = `${e.network}:${e.address}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const avatar = sanitizeAvatarUrl(e.avatar);
    entries.push({ network: e.network as BookNetwork, address: e.address, comment: e.comment.trim(), ...(avatar ? { avatar } : {}) });
  }
  return entries;
}

export function entriesForNetwork(entries: readonly AddressBookEntry[], network: BookNetwork | undefined): AddressBookEntry[] {
  return network ? entries.filter((e) => e.network === network) : [];
}

/** "TAzsQ9Gx…VPHzA8wr": enough of both ends to recognise an address, short enough for one line. */
export function shortAddress(address: string, head = 8, tail = 6): string {
  return address.length <= head + tail + 1 ? address : `${address.slice(0, head)}…${address.slice(-tail)}`;
}

/**
 * An address in three parts for display: the first and last four characters (the ones people compare by eye) and
 * everything between. An EVM address keeps its "0x" out of the highlighted head, since every one starts with it.
 */
export function splitAddress(address: string, edge = 4): { prefix: string; head: string; middle: string; tail: string } {
  const prefix = /^0x/i.test(address) ? address.slice(0, 2) : "";
  const body = address.slice(prefix.length);
  if (body.length <= edge * 2) return { prefix, head: body, middle: "", tail: "" };
  return { prefix, head: body.slice(0, edge), middle: body.slice(edge, -edge), tail: body.slice(-edge) };
}

let bookPromise: Promise<AddressBookEntry[]> | undefined;

/** Loads public/address-book.json once per page load (through BASE_URL: the site lives under a sub-path on GitHub Pages). */
export function loadAddressBook(fetchImpl: typeof fetch = fetch, baseUrl: string = import.meta.env.BASE_URL, timeoutMs = 5000): Promise<AddressBookEntry[]> {
  bookPromise ??= (async () => {
    try {
      const res = await fetchImpl(`${baseUrl}address-book.json`, { signal: AbortSignal.timeout(timeoutMs) });
      return res.ok ? parseAddressBook(await res.json()) : [];
    } catch {
      return [];
    }
  })();
  return bookPromise;
}

/** For tests. */
export function resetAddressBookCache(): void {
  bookPromise = undefined;
}
