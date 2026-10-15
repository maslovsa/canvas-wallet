// The address book as a bottom sheet: the saved recipients for the network being sent on. Choosing one hands its
// address to the caller (the Send screen puts it in the field) and closes the sheet.
import { entriesForNetwork, loadAddressBook, splitAddress, type AddressBookEntry, type BookNetwork } from "../send/address-book.ts";
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
  /** First-run hint: ring the first row and label it "Tap to choose". Ignored when the book is empty. */
  coachFirstRow?: boolean;
  /** Called once when the coached sheet ends (a pick or a plain close), so the hint is not shown again. */
  onCoachDone?: () => void;
}

export async function openAddressBookSheet(options: AddressBookSheetOptions): Promise<OpenSheet> {
  const entries = entriesForNetwork(await (options.load ?? (() => loadAddressBook()))(), options.network);
  const content = document.createElement("div");
  content.className = "book-list";
  let sheet: OpenSheet | null = null;
  const coached = options.coachFirstRow === true && entries.length > 0;

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
    // The whole address, with its first and last four characters picked out (text nodes only; nothing from the book is HTML).
    const parts = splitAddress(entry.address);
    const mark = (text: string) => {
      const span = document.createElement("span");
      span.className = "book-address-edge";
      span.textContent = text;
      return span;
    };
    address.append(document.createTextNode(parts.prefix), mark(parts.head), document.createTextNode(parts.middle), ...(parts.tail ? [mark(parts.tail)] : []));
    text.append(name, address);
    row.append(avatar, text);
    if (coached && content.childElementCount === 0) {
      row.classList.add("is-coached");
      const pill = document.createElement("span");
      pill.className = "coach-pill";
      pill.setAttribute("aria-hidden", "true"); // the row's own label already says what it does
      pill.textContent = "Tap to choose";
      row.append(pill);
    }
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
    onClosed: () => {
      if (coached) options.onCoachDone?.();
      options.onClosed?.();
    },
  });
  return sheet;
}
