import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import { parseAddressBook, entriesForNetwork, bookNetworkFor, shortAddress, loadAddressBook, resetAddressBookCache } from "../src/send/address-book.ts";
import { validateAddressBook, isValidEvmAddress, isValidTonAddress } from "../src/send/address-book-validate.ts";

const subtle = webcrypto.subtle as SubtleCrypto;
const TRON = "TAzsQ9Gx8eqFNFSKbeXrbi45CuVPHzA8wr";
const EVM = "0x28c6c06298d514db089934071355e5743bf21d60";
const TON = "UQDKHZ7e70CzqdvZCC83Z4WVR8POC_ZB0J1Y4zo88G-zCSRH"; // Binance Hot Wallet on TON (tonviewer.com)
const file = JSON.parse(readFileSync("public/address-book.json", "utf8"));

describe("the shipped address book (public/address-book.json)", () => {
  it("passes the strict validator: every address is valid for its network, no duplicates", async () => {
    expect(await validateAddressBook(file, subtle)).toEqual([]);
  });
  it("names owners only: no comment states a risk reason", () => {
    const wording = /sanction|ofac|sdn|blacklist|frozen|mixer|illicit|scam|hack|stolen/i;
    expect(parseAddressBook(file).filter((e) => wording.test(e.comment))).toEqual([]);
  });
  it("has entries for Tron, Ethereum and BSC, with the saved comments", () => {
    const entries = parseAddressBook(file);
    expect(entries).toHaveLength(file.entries.length); // every entry of the file is well-formed (none dropped)
    expect(entries.length).toBeGreaterThanOrEqual(36);
    expect(entriesForNetwork(entries, "TRON").length).toBeGreaterThan(5);
    expect(entriesForNetwork(entries, "ETH").length).toBeGreaterThan(5);
    expect(entriesForNetwork(entries, "BSC")).toHaveLength(1);
    expect(entries.find((e) => e.address === TRON)!.comment.length).toBeGreaterThan(0); // the names are the owner's to edit
  });
});

describe("TON addresses", () => {
  it("accepts a user-friendly address with a correct checksum, in the UQ and EQ forms", () => {
    expect(isValidTonAddress(TON)).toBe(true);
    expect(isValidTonAddress("EQBugU5kUOjFeAZ7tlYpj7TQE5fdFQGNfzTcNp6rpMIRHLwm")).toBe(true);
  });
  it.each([
    ["a changed character", `${TON.slice(0, -1)}A`],
    ["a short string", TON.slice(0, 47)],
    ["a Tron address", TRON],
    ["an EVM address", EVM],
  ])("refuses %s", (_n, address) => {
    expect(isValidTonAddress(address)).toBe(false);
  });
  it("the book accepts TON entries and offers them for the TON network only", async () => {
    const entries = [{ network: "TON", address: TON, comment: "Binance Hot Wallet" }];
    expect(await validateAddressBook({ version: 1, entries }, subtle)).toEqual([]);
    expect(bookNetworkFor("TON")).toBe("TON");
    const parsed = parseAddressBook({ version: 1, entries });
    expect(entriesForNetwork(parsed, "TON")).toHaveLength(1);
    expect(entriesForNetwork(parsed, "TRON")).toHaveLength(0);
  });
});

describe("validateAddressBook", () => {
  const book = (entries: unknown[]) => ({ version: 1, entries });
  it("accepts good entries", async () => {
    expect(await validateAddressBook(book([{ network: "TRON", address: TRON, comment: "x" }, { network: "BSC", address: EVM, comment: "y" }]), subtle)).toEqual([]);
  });
  it.each([
    ["a bad Tron checksum", { network: "TRON", address: `${TRON.slice(0, -1)}x`, comment: "c" }, "not a valid Tron address"],
    ["an EVM address on Tron", { network: "TRON", address: EVM, comment: "c" }, "not a valid Tron address"],
    ["a Tron address on ETH", { network: "ETH", address: TRON, comment: "c" }, "not a valid EVM address"],
    ["a short EVM address", { network: "ETH", address: "0x1234", comment: "c" }, "not a valid EVM address"],
    ["an unknown network", { network: "SOL", address: TRON, comment: "c" }, "network must be one of"],
    ["an empty comment", { network: "TRON", address: TRON, comment: " " }, "comment must be"],
    ["a too long comment", { network: "TRON", address: TRON, comment: "x".repeat(81) }, "comment must be"],
    ["an extra key (a score, say)", { network: "TRON", address: TRON, comment: "c", risk_score: 9 }, 'unexpected key "risk_score"'],
    ["a risk reason in the comment (sanctions)", { network: "TRON", address: TRON, comment: "Exchange (EU sanctions)" }, "not a risk reason"],
    ["a risk reason in the comment (OFAC SDN)", { network: "TRON", address: TRON, comment: "OFAC SDN: Someone" }, "not a risk reason"],
    ["a risk reason in the comment (blacklist)", { network: "TRON", address: TRON, comment: "Tether blacklist" }, "not a risk reason"],
    ["a risk reason in the comment (mixer)", { network: "ETH", address: EVM, comment: "Sanctioned mixer" }, "not a risk reason"],
    ["surrounding spaces", { network: "TRON", address: ` ${TRON}`, comment: "c" }, "without surrounding spaces"],
  ])("rejects %s", async (_why, entry, message) => {
    expect((await validateAddressBook(book([entry]), subtle)).join("\n")).toContain(message);
  });
  it("rejects a duplicate and a wrong envelope", async () => {
    const dup = { network: "TRON", address: TRON, comment: "c" };
    expect((await validateAddressBook(book([dup, dup]), subtle)).join("\n")).toContain("duplicate");
    expect(await validateAddressBook({ entries: [] }, subtle)).toHaveLength(1);
  });
  it("EVM: all-lowercase passes, a correct EIP-55 mix passes, a wrong mix fails", () => {
    expect(isValidEvmAddress(EVM)).toBe(true);
    expect(isValidEvmAddress("0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed")).toBe(true); // the EIP-55 reference address
    expect(isValidEvmAddress("0x5AAeb6053F3E94C9b9A09f33669435E7Ef1BeAed")).toBe(false);
  });
});

describe("parseAddressBook (runtime, lenient)", () => {
  it("drops malformed and duplicate entries without throwing", () => {
    const entries = parseAddressBook({ version: 1, entries: [null, 5, { network: "X" }, { network: "TRON", address: TRON, comment: "ok" }, { network: "TRON", address: TRON, comment: "dup" }, { network: "TRON", address: "short", comment: "c" }] });
    expect(entries).toEqual([{ network: "TRON", address: TRON, comment: "ok" }]);
    expect(parseAddressBook(null)).toEqual([]);
    expect(parseAddressBook({ entries: "nope" })).toEqual([]);
  });
});

describe("helpers", () => {
  it("maps network names to book codes", () => {
    expect([bookNetworkFor("Tron"), bookNetworkFor("Ethereum"), bookNetworkFor("BNB Smart Chain"), bookNetworkFor("Polygon"), bookNetworkFor(undefined)]).toEqual(["TRON", "ETH", "BSC", undefined, undefined]);
    expect(entriesForNetwork(parseAddressBook(file), undefined)).toEqual([]);
  });
  it("shortens an address in the middle, and leaves short ones alone", () => {
    expect(shortAddress(TRON)).toBe("TAzsQ9Gx…HzA8wr");
    expect(shortAddress("0xabc")).toBe("0xabc");
  });
});

describe("loadAddressBook", () => {
  beforeEach(() => resetAddressBookCache());
  it("fetches once, through the base URL, and returns the parsed entries", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(file))) as unknown as typeof fetch;
    const first = await loadAddressBook(fetchImpl, "/canvas-wallet/");
    await loadAddressBook(fetchImpl, "/canvas-wallet/");
    expect(first).toHaveLength(file.entries.length);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect((fetchImpl as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]![0]).toBe("/canvas-wallet/address-book.json");
  });
  it("a missing or broken file is an empty book, never an error", async () => {
    expect(await loadAddressBook((async () => new Response("", { status: 404 })) as unknown as typeof fetch, "/")).toEqual([]);
    resetAddressBookCache();
    expect(await loadAddressBook((async () => { throw new Error("offline"); }) as unknown as typeof fetch, "/")).toEqual([]);
  });
});
