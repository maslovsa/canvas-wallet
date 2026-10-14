// The in-phone Send screen (plan DR1-DR14). It renders from the controller's view model and PATCHES
// the existing DOM on every change, so an input never loses focus or caret while a verdict arrives.
// All text goes in with textContent; nothing here builds HTML from data.
import type { ChromeStyle } from "./phone-frame.ts";
import { openOverlay, type OpenOverlay } from "./phone-overlay.ts";
import { icon } from "./icons.ts";
import { createAvatar } from "./avatar.ts";
import { openAddressBookSheet } from "./address-book-sheet.ts";
import { bookNetworkFor, entriesForNetwork, loadAddressBook, type AddressBookEntry } from "../send/address-book.ts";
import type { SendController, SendView, Tone } from "../send/send-session.ts";

export interface SendScreenOptions {
  frame: HTMLElement;
  screen: HTMLElement;
  chromeStyle: ChromeStyle;
  controller: SendController;
  networkLabel: string;
  onBack: () => void;
  onDone: () => void;
  /** Called (debounced) after the address in the field changes, so the page URL can follow it (?to=). */
  onAddressChange?: () => void;
}

const ADDRESS_URL_DEBOUNCE_MS = 350; // the address bar is rewritten once typing pauses, not per keystroke (Safari rate-limits history.replaceState)
let addressTimer: ReturnType<typeof setTimeout> | undefined;

let unsubscribe: (() => void) | null = null;
let activeOverlay: OpenOverlay | null = null;

/** Drops the live subscription and any open dialog; called before the phone wipes and rebuilds its DOM. */
export function unmountSendScreen(): void {
  unsubscribe?.();
  unsubscribe = null;
  clearTimeout(addressTimer);
  activeOverlay?.close();
  activeOverlay = null;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * The VASP badge next to its name: an initial-letter placeholder that is always there, with the logo laid over it
 * once (and only if) the image loads, so a slow or broken logo never shows a broken-image icon. The <img> URL has
 * already passed sanitizeLogoUrl (https jsDelivr .png); no referrer is sent.
 */
function fillOwnerBadge(badge: HTMLElement, name: string, logo: string | null): void {
  badge.textContent = "";
  const initial = el("span", "send-owner-initial", [...name][0]?.toUpperCase() ?? "?");
  badge.append(initial);
  if (!logo) return;
  const img = document.createElement("img");
  img.className = "send-owner-logo";
  img.alt = "";
  img.width = 24;
  img.height = 24;
  img.decoding = "async";
  img.referrerPolicy = "no-referrer";
  img.hidden = true;
  img.addEventListener("load", () => {
    img.hidden = false;
  });
  img.addEventListener("error", () => img.remove());
  img.src = logo;
  badge.append(img);
}

type Verdict = "checking" | "known" | "clear" | "caution" | "contract" | "unverified";

/** Which look the risk answer gets: derived from the status the controller already built (text and facts unchanged). */
function verdictOf(s: SendView["address"]["status"]): Verdict | null {
  if (!s) return null;
  if (s.spinner) return "checking";
  if (s.tone === "caution") return s.contract ? "contract" : "caution";
  if (s.tone === "success") return "known";
  return s.checkAgain ? "unverified" : "clear";
}

const ICONS = { check: "✓", alert: "⚠", help: "?", none: "" } as const;

export function mountSendScreen(options: SendScreenOptions): void {
  unmountSendScreen();
  const { controller, screen, frame } = options;
  screen.textContent = "";

  const root = el("div", "send-screen");

  // --- navigation bar (iOS HIG: back control with chevron + label, centered title)
  const nav = el("div", "send-nav");
  const back = el("button", "send-back");
  back.type = "button";
  back.setAttribute("aria-label", "Back to token");
  const arrow = icon("arrow-left", { size: 24, strokeWidth: 2, className: "back-arrow" }); // Android shows this instead
  back.append(el("span", "send-back-chevron", "‹"), el("span", "send-back-label", "Back"), arrow);
  back.addEventListener("click", () => {
    if (controller.view().backEnabled) options.onBack();
  });
  const titleBox = el("div", "send-nav-title-box");
  const title = el("div", "send-nav-title");
  titleBox.append(title, el("div", "send-nav-sub", options.networkLabel));
  nav.append(back, titleBox, el("span", "send-nav-spacer"));
  root.append(nav);

  const form = el("div", "send-form");

  // --- recipient
  const addrBlock = el("div", "send-block");
  const addrRow = el("div", "send-label-row");
  const addrLabel = el("label", "send-label", "To");
  addrLabel.htmlFor = "send-address";
  // "To: NAME": the saved name of the address in the field, when it is one of the address book's (see patch()).
  const addrLabelName = el("span", "send-label-name");
  addrLabel.append(addrLabelName);
  const paste = el("button", "send-link", "Paste");
  paste.type = "button";
  addrRow.append(addrLabel, paste);
  const addrField = el("div", "send-field");
  const addrInput = el("input", "send-input send-address-input");
  addrInput.id = "send-address";
  addrInput.type = "text";
  addrInput.setAttribute("autocapitalize", "off");
  addrInput.setAttribute("autocorrect", "off");
  addrInput.setAttribute("autocomplete", "off");
  addrInput.spellcheck = false;
  addrInput.placeholder = "Tron address (starts with T)"; // a hint only: the visible "To" label stays
  addrInput.setAttribute("aria-describedby", "send-address-status");
  const bookBtn = el("button", "send-book-btn");
  bookBtn.type = "button";
  bookBtn.title = "Address book";
  bookBtn.setAttribute("aria-label", "Address book");
  bookBtn.setAttribute("aria-haspopup", "dialog");
  bookBtn.append(icon("book-user", { size: 20, strokeWidth: 1.75 }));
  addrField.append(addrInput, bookBtn);
  const identityRow = el("div", "send-identity");
  identityRow.hidden = true;
  const identityBadge = el("span", "send-owner");
  identityBadge.setAttribute("aria-hidden", "true");
  const identityName = el("span", "send-identity-name");
  identityRow.append(identityBadge, identityName);
  const status = el("div", "send-status");
  status.id = "send-address-status";
  status.setAttribute("aria-live", "polite");
  const statusIcon = el("span", "send-status-icon");
  statusIcon.setAttribute("aria-hidden", "true");
  const spinner = el("span", "send-spinner");
  spinner.setAttribute("aria-hidden", "true");
  const ownerBadge = el("span", "send-owner");
  ownerBadge.setAttribute("aria-hidden", "true"); // decorative: the name beside it is the text
  ownerBadge.hidden = true;
  const statusText = el("span", "send-status-text");
  const checkAgain = el("button", "send-link", "Check again");
  checkAgain.type = "button";
  status.append(statusIcon, ownerBadge, spinner, statusText, checkAgain);
  const addrError = el("div", "send-error");
  addrError.setAttribute("role", "alert");
  addrBlock.append(addrRow, addrField, identityRow, status, addrError);

  // --- amount
  const amountBlock = el("div", "send-block");
  const amountRow = el("div", "send-label-row");
  const amountLabel = el("label", "send-label", "Amount");
  amountLabel.htmlFor = "send-amount";
  const balance = el("span", "send-balance");
  amountRow.append(amountLabel, balance);
  const amountField = el("div", "send-field");
  const amountInput = el("input", "send-input send-amount-input");
  amountInput.id = "send-amount";
  amountInput.type = "text";
  amountInput.setAttribute("inputmode", "decimal");
  amountInput.setAttribute("autocomplete", "off");
  amountInput.setAttribute("aria-describedby", "send-amount-error");
  amountInput.placeholder = "0.00";
  const max = el("button", "send-link", "Max");
  max.type = "button";
  amountField.append(amountInput, max);
  const amountError = el("div", "send-error");
  amountError.id = "send-amount-error";
  amountBlock.append(amountRow, amountField, amountError);

  // --- fee (tertiary)
  const fee = el("div", "send-fee");
  const feeLabel = el("span", "send-fee-label");
  const feeValue = el("span", "send-fee-value");
  fee.append(feeLabel, feeValue);

  // --- action
  const reason = el("div", "send-reason");
  const submit = el("button", "send-submit");
  submit.type = "button";
  const hint = el("div", "send-spacer");

  form.append(addrBlock, amountBlock, fee, hint, reason, submit);

  // --- sent confirmation (replaces the form)
  const sentBox = el("div", "send-sent");
  sentBox.hidden = true;
  const sentIcon = el("div", "send-sent-icon", "✓");
  sentIcon.setAttribute("aria-hidden", "true");
  const sentHeadline = el("div", "send-sent-headline");
  sentHeadline.setAttribute("role", "status");
  const sentAddress = el("div", "send-sent-address");
  const sentFee = el("div", "send-sent-fee");
  const sentPill = el("div", "send-sent-pill");
  const done = el("button", "send-submit", "Done");
  done.type = "button";
  sentBox.append(sentIcon, sentHeadline, sentAddress, sentFee, sentPill, done);

  root.append(form, sentBox);
  screen.append(root);

  // --- events
  addrInput.addEventListener("input", () => void controller.setAddress(addrInput.value));
  amountInput.addEventListener("input", () => controller.setAmount(amountInput.value));
  paste.addEventListener("click", async () => {
    try {
      const text = await navigator.clipboard.readText();
      addrInput.value = text.trim();
      await controller.setAddress(text);
    } catch {
      addrInput.focus(); // clipboard blocked: leave the field ready for a manual paste
    }
  });
  bookBtn.addEventListener("click", () => {
    void openAddressBookSheet({
      frame,
      screen,
      chromeStyle: options.chromeStyle,
      network: bookNetworkFor(options.networkLabel),
      networkLabel: options.networkLabel,
      onPick: (entry: AddressBookEntry) => {
        // Exactly what typing the address would do: the controller validates it and starts the risk check.
        addrInput.value = entry.address;
        addrInput.dispatchEvent(new Event("input", { bubbles: true }));
        amountInput.focus();
      },
    });
  });
  checkAgain.addEventListener("click", () => controller.checkAgain());
  max.addEventListener("click", () => controller.pressMax());
  submit.addEventListener("click", () => controller.pressSend());
  done.addEventListener("click", options.onDone);

  // --- address book names for the "To: NAME" label (this network's saved addresses; loaded once, cached)
  let bookEntries: AddressBookEntry[] = [];
  void loadAddressBook().then((entries) => {
    bookEntries = entriesForNetwork(entries, bookNetworkFor(options.networkLabel));
    if (root.isConnected) patch(controller.view());
  });

  // --- patching
  let seenFocusRequests = controller.state.focusAddressRequests;

  const toneClass = (tone: Tone) => `send-tone-${tone}`;

  function patch(view: SendView): void {
    title.textContent = view.title;
    // The name shows only while the field holds exactly a saved address: type or paste any other and it goes away.
    const saved = bookEntries.find((e) => e.address === view.address.value);
    const savedKey = saved ? `${saved.comment}\n${saved.avatar ?? ""}` : "";
    if (addrLabelName.dataset.key !== savedKey) {
      addrLabelName.dataset.key = savedKey;
      addrLabelName.replaceChildren(...(saved ? [document.createTextNode(": "), ...(saved.avatar ? [createAvatar(saved.comment, saved.avatar, "send-label-avatar", false)] : []), document.createTextNode(saved.comment)] : []));
    }
    addrLabelName.hidden = !saved;
    if (addrInput.value !== view.address.value && document.activeElement !== addrInput) addrInput.value = view.address.value;
    if (amountInput.value !== view.amount.value && document.activeElement !== amountInput) amountInput.value = view.amount.value;
    addrInput.disabled = view.phase !== "form";
    bookBtn.disabled = view.phase !== "form";
    amountInput.disabled = view.phase !== "form";
    addrInput.setAttribute("aria-invalid", String(view.address.error !== null));
    amountInput.setAttribute("aria-invalid", String(view.amount.error !== null));
    addrField.classList.toggle("is-invalid", view.address.error !== null);
    const verdict = verdictOf(view.address.status);
    addrField.classList.toggle("is-caution", verdict === "caution");
    addrField.classList.toggle("is-contract", verdict === "contract");
    addrField.classList.toggle("is-known", verdict === "known");
    addrField.classList.toggle("is-clear", verdict === "clear");
    amountField.classList.toggle("is-invalid", view.amount.error !== null);

    const s = view.address.status;
    status.className = "send-status" + (s ? ` ${toneClass(s.tone)} send-v-${verdict}` : "");
    // A risky address that is a known VASP: its name and logo, above the risk line.
    const identity = s?.identity ?? null;
    identityRow.hidden = identity === null;
    const identityKey = identity ? `${identity.name}\n${identity.logo ?? ""}` : "";
    if (identityBadge.dataset.key !== identityKey) {
      identityBadge.dataset.key = identityKey;
      if (identity) fillOwnerBadge(identityBadge, identity.name, identity.logo);
    }
    identityName.textContent = identity ? identity.name : "";
    const owner = s?.owner ?? null;
    const emoji = s?.emoji ?? null;
    // "nothing found" has no glyph of its own in the model; the verdict card gives it a check in a teal badge
    statusIcon.textContent = s && !owner && !emoji ? (verdict === "clear" ? ICONS.check : ICONS[s.icon]) : "";
    ownerBadge.hidden = owner === null && emoji === null;
    const ownerKey = emoji ? `emoji:${emoji}` : owner && s ? `${s.text}\n${owner.logo ?? ""}` : "";
    if (ownerBadge.dataset.key !== ownerKey) {
      ownerBadge.dataset.key = ownerKey;
      if (emoji) {
        // an emoji in the same 24 px slot an owner logo uses
        ownerBadge.replaceChildren(el("span", "send-owner-emoji", emoji));
      } else if (owner && s) {
        fillOwnerBadge(ownerBadge, s.text, owner.logo);
      }
    }
    spinner.hidden = !s?.spinner;
    statusText.textContent = s ? s.text : "";
    checkAgain.hidden = !s?.checkAgain;
    const wait = s?.checkAgainWaitSec ?? 0;
    checkAgain.disabled = wait > 0;
    checkAgain.textContent = wait > 0 ? `Check again (${wait}s)` : "Check again";
    addrError.textContent = view.address.error ?? "";

    balance.textContent = view.amount.balanceText;
    amountError.textContent = view.amount.error ?? "";
    feeLabel.textContent = view.fee.label;
    feeValue.textContent = view.fee.note ? `${view.fee.value} · ${view.fee.note}` : view.fee.value;

    submit.textContent = view.button.label;
    submit.disabled = !view.button.enabled;
    submit.classList.toggle("is-busy", view.phase === "sending");
    reason.textContent = view.button.reason ?? "";
    back.classList.toggle("is-inactive", !view.backEnabled);

    const sent = view.phase === "sent" ? view.sent : null;
    form.hidden = sent !== null;
    sentBox.hidden = sent === null;
    if (sent) {
      sentHeadline.textContent = sent.headline;
      sentAddress.textContent = sent.address;
      sentFee.textContent = sent.feeLine;
      sentPill.textContent = sent.pill;
    }

    // Caution popup: opens only on a Send press (controller sets popup), closes on Cancel / Send anyway.
    const contractPopup = view.popupKind === "contract";
    if (view.popup && !activeOverlay) {
      activeOverlay = openOverlay({
        frame,
        screen,
        chromeStyle: options.chromeStyle,
        tone: "caution",
        title: contractPopup ? "This is a token smart contract" : "Risk signals found for this address",
        body: contractPopup
          ? "You're sending to a token's smart contract, not to a person's wallet. Funds sent here are lost and can't be returned. Is this really what you want to do?"
          : "Aegis data at the time of the check shows risk signals. This is information, not advice, and details aren't shown. The decision is yours.",
        buttons: [
          { label: "Cancel", primary: true, onClick: () => controller.popupCancel() },
          { label: "Continue", onClick: () => controller.popupSendAnyway() },
        ],
        onDismiss: () => controller.popupCancel(),
      });
    } else if (!view.popup && activeOverlay) {
      activeOverlay.close();
      activeOverlay = null;
    }

    if (controller.state.focusAddressRequests !== seenFocusRequests) {
      seenFocusRequests = controller.state.focusAddressRequests;
      addrInput.focus();
    }
  }

  let lastReportedAddress = controller.state.address;
  unsubscribe = controller.subscribe(() => {
    patch(controller.view());
    if (controller.state.address !== lastReportedAddress) {
      lastReportedAddress = controller.state.address;
      clearTimeout(addressTimer);
      addressTimer = setTimeout(() => options.onAddressChange?.(), ADDRESS_URL_DEBOUNCE_MS);
    }
  });
  patch(controller.view());
}
