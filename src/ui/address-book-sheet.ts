// The address book as a bottom sheet: the saved recipients for the network being sent on. Choosing one hands its
// address to the caller (the Send screen puts it in the field) and closes the sheet.
import { entriesForNetwork, loadAddressBook, shortAddress, type AddressBookEntry, type BookNetwork } from "../send/address-book.ts";
import { openSheet, type OpenSheet } from "./phone-sheet.ts";
import type { ChromeStyle } from "./phone-frame.ts";
import { createAvatar } from "./avatar.ts";

export interface AddressBookSheetOptions {
  frame: HTMLElement;
  screen: HTMLElement;
  chromeStyle: ChromeStyle;
  network: BookNetwork | undefined;
  /** Display name of the network ("Tron"), used in the sheet's subtitle. */
  networkLabel: string;
  onPick: (entry: AddressBookEntry) => void;
  onClosed?: () => void;
  /** Injected for tests; defaults to the cached fetch of public/address-book.json. */
  load?: () => Promise<AddressBookEntry[]>;
}

export async function openAddressBookSheet(options: AddressBookSheetOptions): Promise<OpenSheet> {
  const entries = entriesForNetwork(await (options.load ?? (() => loadAddressBook()))(), options.network);
  const content = document.createElement("div");
  content.className = "book-list";
  let sheet: OpenSheet | null = null;

  if (entries.length === 0) {
    const empty = document.createElement("div");
    empty.className = "book-empty";
    empty.textContent = `No saved ${options.networkLabel} addresses yet.`;
    content.append(empty);
  }
  for (const entry of entries) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "book-row";
    row.setAttribute("aria-label", `${entry.comment}, ${entry.address}`);
    const avatar = createAvatar(entry.comment, entry.avatar, "book-avatar");
    const text = document.createElement("span");
    text.className = "book-text";
    const name = document.createElement("span");
    name.className = "book-name";
    name.textContent = entry.comment;
    const address = document.createElement("span");
    address.className = "book-address";
    address.textContent = shortAddress(entry.address);
    text.append(name, address);
    row.append(avatar, text);
    row.addEventListener("click", () => {
      sheet?.close(false); // the caller moves focus on (to the amount); restoring it here would undo that
      options.onPick(entry);
    });
    content.append(row);
  }

  sheet = openSheet({
    frame: options.frame,
    screen: options.screen,
    chromeStyle: options.chromeStyle,
    title: "Address book",
    subtitle: `${options.networkLabel} · ${entries.length} saved`,
    content,
    ...(options.onClosed ? { onClosed: options.onClosed } : {}),
  });
  return sheet;
}
