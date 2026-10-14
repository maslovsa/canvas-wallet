import { describe, it, expect } from "vitest";
import { sanitizeAvatarUrl } from "../src/send/avatar-url.ts";
import { parseAddressBook } from "../src/send/address-book.ts";
import { validateAddressBook } from "../src/send/address-book-validate.ts";
import { webcrypto } from "node:crypto";

const WIKI = "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6a/Roger_Ver.jpg/250px-Roger_Ver.jpg";
const LOGO = "https://cdn.jsdelivr.net/gh/trustwallet/assets@master/blockchains/tron/assets/TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t/logo.png";
const DICE = "https://api.dicebear.com/9.x/avataaars/png?seed=Contact%201&size=128";
const ADDR = "TAzsQ9Gx8eqFNFSKbeXrbi45CuVPHzA8wr";

describe("sanitizeAvatarUrl", () => {
  it("accepts an image file on jsDelivr or Wikimedia, and a DiceBear png with a seed", () => {
    for (const u of [WIKI, LOGO, DICE]) expect(sanitizeAvatarUrl(u)).toBe(u);
  });

  it.each([
    ["http", "http://upload.wikimedia.org/a.png"],
    ["another host", "https://example.com/a.png"],
    ["a look-alike host", "https://upload.wikimedia.org.evil.test/a.png"],
    ["credentials", "https://u:p@upload.wikimedia.org/a.png"],
    ["a port", "https://upload.wikimedia.org:8443/a.png"],
    ["a query on a file host", "https://upload.wikimedia.org/a.png?x=1"],
    ["a fragment", "https://upload.wikimedia.org/a.png#x"],
    ["a non-image file", "https://upload.wikimedia.org/a.svg"],
    ["dicebear svg", "https://api.dicebear.com/9.x/avataaars/svg?seed=a"],
    ["dicebear without a seed", "https://api.dicebear.com/9.x/avataaars/png"],
    ["dicebear with an unknown parameter", "https://api.dicebear.com/9.x/avataaars/png?seed=a&track=1"],
    ["surrounding spaces", ` ${WIKI}`],
    ["not a string", 42],
  ])("refuses %s", (_name, value) => {
    expect(sanitizeAvatarUrl(value)).toBeUndefined();
  });
});

describe("address book avatars", () => {
  it("parseAddressBook keeps a good avatar and drops a bad one without dropping the entry", () => {
    const entries = parseAddressBook({
      version: 1,
      entries: [
        { network: "TRON", address: ADDR, comment: "A", avatar: WIKI },
        { network: "TRON", address: "TDZiHNjB3gMbHkMQ4mVvPiYcfXnRcrdmrw", comment: "B", avatar: "https://evil.test/x.png" },
      ],
    });
    expect(entries.map((e) => e.avatar)).toEqual([WIKI, undefined]);
    expect(entries).toHaveLength(2);
  });

  it("CI validation accepts avatar and flags a bad one", async () => {
    const book = (avatar: string) => ({ version: 1, entries: [{ network: "TRON", address: ADDR, comment: "CZ", avatar }] });
    expect(await validateAddressBook(book(WIKI), webcrypto.subtle as SubtleCrypto)).toEqual([]);
    expect((await validateAddressBook(book("https://evil.test/x.png"), webcrypto.subtle as SubtleCrypto)).join()).toContain("avatar must be an https image URL");
  });
});
