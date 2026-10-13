// The in-phone Send screen (plan DR1-DR14). It renders from the controller's view model and PATCHES
// the existing DOM on every change, so an input never loses focus or caret while a verdict arrives.
// All text goes in with textContent; nothing here builds HTML from data.
import type { ChromeStyle } from "./phone-frame.ts";
import { openOverlay, type OpenOverlay } from "./phone-overlay.ts";
import type { SendController, SendView, Tone } from "../send/send-session.ts";

export interface SendScreenOptions {
  frame: HTMLElement;
  screen: HTMLElement;
  chromeStyle: ChromeStyle;
  controller: SendController;
  networkLabel: string;
  onBack: () => void;
  onDone: () => void;
}

let unsubscribe: (() => void) | null = null;
let activeOverlay: OpenOverlay | null = null;

/** Drops the live subscription and any open dialog; called before the phone wipes and rebuilds its DOM. */
export function unmountSendScreen(): void {
  unsubscribe?.();
  unsubscribe = null;
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
  back.append(el("span", "send-back-chevron", "‹"), el("span", "send-back-label", "Back"));
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
  addrField.append(addrInput);
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
  addrBlock.append(addrRow, addrField, status, addrError);

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
  checkAgain.addEventListener("click", () => controller.checkAgain());
  max.addEventListener("click", () => controller.pressMax());
  submit.addEventListener("click", () => controller.pressSend());
  done.addEventListener("click", options.onDone);

  // --- patching
  let seenFocusRequests = controller.state.focusAddressRequests;

  const toneClass = (tone: Tone) => `send-tone-${tone}`;

  function patch(view: SendView): void {
    title.textContent = view.title;
    if (addrInput.value !== view.address.value && document.activeElement !== addrInput) addrInput.value = view.address.value;
    if (amountInput.value !== view.amount.value && document.activeElement !== amountInput) amountInput.value = view.amount.value;
    addrInput.disabled = view.phase !== "form";
    amountInput.disabled = view.phase !== "form";
    addrInput.setAttribute("aria-invalid", String(view.address.error !== null));
    amountInput.setAttribute("aria-invalid", String(view.amount.error !== null));
    addrField.classList.toggle("is-invalid", view.address.error !== null);
    addrField.classList.toggle("is-caution", view.address.status?.tone === "caution");
    amountField.classList.toggle("is-invalid", view.amount.error !== null);

    const s = view.address.status;
    status.className = "send-status" + (s ? ` ${toneClass(s.tone)}` : "");
    const owner = s?.owner ?? null;
    statusIcon.textContent = s && !owner ? ICONS[s.icon] : "";
    ownerBadge.hidden = owner === null;
    const ownerKey = owner && s ? `${s.text}\n${owner.logo ?? ""}` : "";
    if (ownerBadge.dataset.key !== ownerKey) {
      ownerBadge.dataset.key = ownerKey;
      if (owner && s) fillOwnerBadge(ownerBadge, s.text, owner.logo);
    }
    spinner.hidden = !s?.spinner;
    statusText.textContent = s ? s.text : "";
    checkAgain.hidden = !s?.checkAgain;
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
    if (view.popup && !activeOverlay) {
      activeOverlay = openOverlay({
        frame,
        screen,
        chromeStyle: options.chromeStyle,
        tone: "caution",
        title: "Risk signals found for this address",
        body: "Aegis data at the time of the check shows risk signals. This is information, not advice, and details aren't shown. The decision is yours.",
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

  unsubscribe = controller.subscribe(() => patch(controller.view()));
  patch(controller.view());
}
