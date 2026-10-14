// A bottom sheet inside the phone (a child of .phone-frame, like phone-overlay): it slides up over a dimmed screen to
// about two thirds of its height, has a grabber and a close button, and is dismissed by Esc, a tap on the scrim, the
// close button, or by dragging it down. Text is set with textContent only; the caller builds `content` with DOM APIs.
// Accessibility: role=dialog + aria-modal, the screen underneath is inert, focus is trapped and returns on close.
import type { ChromeStyle } from "./phone-frame.ts";
import { icon } from "./icons.ts";

export interface SheetOptions {
  frame: HTMLElement;
  /** The screen under the sheet: made inert while it is open. */
  screen: HTMLElement;
  chromeStyle: ChromeStyle;
  title: string;
  subtitle?: string;
  content: HTMLElement;
  /** Called once, after the sheet has been removed (however it was dismissed). */
  onClosed?: () => void;
}

export interface OpenSheet {
  /** `restoreFocus: false` leaves focus where the caller put it (e.g. on the next field after a pick). */
  close: (restoreFocus?: boolean) => void;
  element: HTMLElement;
}

const CLOSE_MS = 240;
const DISMISS_DISTANCE_PX = 110;
const DISMISS_VELOCITY_PX_MS = 0.6;

let counter = 0;

export function openSheet(options: SheetOptions): OpenSheet {
  const id = `phone-sheet-${++counter}`;
  const scrim = document.createElement("div");
  scrim.className = `phone-overlay is-sheet chrome-${options.chromeStyle}`;

  const sheet = document.createElement("div");
  sheet.className = "phone-sheet";
  sheet.setAttribute("role", "dialog");
  sheet.setAttribute("aria-modal", "true");
  sheet.setAttribute("aria-labelledby", `${id}-title`);

  // The grab area: the grabber and the header. Dragging it down dismisses the sheet.
  const grab = document.createElement("div");
  grab.className = "phone-sheet-grab";
  const grabber = document.createElement("div");
  grabber.className = "phone-sheet-grabber";
  grabber.setAttribute("aria-hidden", "true");
  const header = document.createElement("div");
  header.className = "phone-sheet-header";
  const titles = document.createElement("div");
  titles.className = "phone-sheet-titles";
  const title = document.createElement("h3");
  title.id = `${id}-title`;
  title.className = "phone-sheet-title";
  title.textContent = options.title;
  titles.append(title);
  if (options.subtitle) {
    const subtitle = document.createElement("div");
    subtitle.className = "phone-sheet-subtitle";
    subtitle.textContent = options.subtitle;
    titles.append(subtitle);
  }
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "phone-sheet-close";
  closeBtn.setAttribute("aria-label", "Close");
  closeBtn.append(icon("x", { size: 18, strokeWidth: 2.25 }));
  header.append(titles, closeBtn);
  grab.append(grabber, header);

  const body = document.createElement("div");
  body.className = "phone-sheet-body";
  body.append(options.content);
  sheet.append(grab, body);
  scrim.append(sheet);

  const previouslyFocused = document.activeElement as HTMLElement | null;
  options.screen.setAttribute("inert", "");
  options.frame.append(scrim);

  let closing = false;
  const close = (restoreFocus = true): void => {
    if (closing) return;
    closing = true;
    options.screen.removeAttribute("inert");
    scrim.classList.add("is-closing");
    setTimeout(() => {
      scrim.remove();
      if (restoreFocus && previouslyFocused?.isConnected) previouslyFocused.focus();
      options.onClosed?.();
    }, CLOSE_MS);
  };

  closeBtn.addEventListener("click", () => close());
  scrim.addEventListener("click", (event) => {
    if (event.target === scrim) close();
  });
  scrim.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "Tab") {
      const focusable = [...sheet.querySelectorAll<HTMLElement>("button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex='-1'])")];
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
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

  // Drag down on the grab area to dismiss: follows the finger, then closes past a distance or a quick flick, else springs back.
  let startY = 0;
  let startTime = 0;
  let dragging = false;
  grab.addEventListener("pointerdown", (event) => {
    if ((event.target as HTMLElement).closest(".phone-sheet-close")) return;
    dragging = true;
    startY = event.clientY;
    startTime = event.timeStamp;
    grab.setPointerCapture?.(event.pointerId);
    sheet.classList.add("is-dragging");
  });
  grab.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    sheet.style.transform = `translateY(${Math.max(0, event.clientY - startY)}px)`;
  });
  const endDrag = (event: PointerEvent): void => {
    if (!dragging) return;
    dragging = false;
    sheet.classList.remove("is-dragging");
    const distance = event.clientY - startY;
    const velocity = distance / Math.max(1, event.timeStamp - startTime);
    if (distance > DISMISS_DISTANCE_PX || (distance > 24 && velocity > DISMISS_VELOCITY_PX_MS)) {
      sheet.style.transform = "";
      close();
    } else {
      sheet.style.transform = "";
    }
  };
  grab.addEventListener("pointerup", endDrag);
  grab.addEventListener("pointercancel", endDrag);

  (body.querySelector<HTMLElement>("button, input") ?? closeBtn).focus();

  return { element: scrim, close };
}
