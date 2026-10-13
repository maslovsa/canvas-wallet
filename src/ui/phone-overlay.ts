// A modal dialog that lives INSIDE the phone (a child of .phone-frame), not on the page: the scrim is
// clipped to the screen's rounded corners, focus is trapped inside the phone, and everything else on
// the site (editor, sidebar) stays usable (plan decision DR10). Used for the caution popup, the Send
// refusal notice and the Receive address dialog. Text is always set with textContent (never innerHTML).
import type { ChromeStyle } from "./phone-frame.ts";

export interface OverlayButton {
  label: string;
  /** The filled button; also the one focused first for a safety dialog, so make it the SAFE choice (Cancel). */
  primary?: boolean;
  /** Receives the button itself so a handler can give feedback on it (e.g. "Copied") without closing the dialog. */
  onClick: (button: HTMLButtonElement) => void;
}

export interface OverlayOptions {
  frame: HTMLElement;
  /** The screen under the dialog: made inert while the dialog is open. */
  screen: HTMLElement;
  chromeStyle: ChromeStyle;
  title: string;
  body?: string;
  /** Extra content under the body (e.g. the Receive QR code). Built by the caller with DOM APIs, never innerHTML. */
  content?: HTMLElement;
  /** "caution" shows a warning icon; "info" shows none. */
  tone: "caution" | "info";
  buttons: OverlayButton[];
  /** Esc and a click on the scrim call this (the dialog's safe action). */
  onDismiss: () => void;
}

export interface OpenOverlay {
  close: () => void;
  element: HTMLElement;
}

let counter = 0;

export function openOverlay(options: OverlayOptions): OpenOverlay {
  const id = `phone-dialog-${++counter}`;
  const scrim = document.createElement("div");
  scrim.className = `phone-overlay chrome-${options.chromeStyle}`;

  const dialog = document.createElement("div");
  dialog.className = "phone-dialog";
  dialog.setAttribute("role", "alertdialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", `${id}-title`);
  if (options.body) dialog.setAttribute("aria-describedby", `${id}-body`);

  if (options.tone === "caution") {
    const icon = document.createElement("div");
    icon.className = "phone-dialog-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "⚠";
    dialog.append(icon);
  }
  const title = document.createElement("h3");
  title.id = `${id}-title`;
  title.className = "phone-dialog-title";
  title.textContent = options.title;
  dialog.append(title);
  if (options.body) {
    const body = document.createElement("p");
    body.id = `${id}-body`;
    body.className = "phone-dialog-body";
    body.textContent = options.body;
    dialog.append(body);
  }
  if (options.content) dialog.append(options.content);

  const row = document.createElement("div");
  row.className = "phone-dialog-buttons";
  const buttonEls: HTMLButtonElement[] = [];
  for (const b of options.buttons) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "phone-dialog-btn" + (b.primary ? " primary" : "");
    el.textContent = b.label;
    el.addEventListener("click", () => b.onClick(el));
    row.append(el);
    buttonEls.push(el);
  }
  dialog.append(row);
  scrim.append(dialog);

  const previouslyFocused = document.activeElement as HTMLElement | null;
  options.screen.setAttribute("inert", "");
  options.frame.append(scrim);

  scrim.addEventListener("click", (event) => {
    if (event.target === scrim) options.onDismiss();
  });
  scrim.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      options.onDismiss();
    } else if (event.key === "Tab" && buttonEls.length > 0) {
      // Trap: Tab / Shift+Tab cycle inside the dialog.
      const first = buttonEls[0]!;
      const last = buttonEls[buttonEls.length - 1]!;
      const active = document.activeElement;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });

  (buttonEls.find((_, i) => options.buttons[i]?.primary) ?? buttonEls[0])?.focus();

  return {
    element: scrim,
    close: () => {
      scrim.remove();
      options.screen.removeAttribute("inert");
      if (previouslyFocused && previouslyFocused.isConnected) previouslyFocused.focus();
    },
  };
}
