import { describe, it, expect, vi, afterEach } from "vitest";
import { openSheet } from "../src/ui/phone-sheet.ts";
import { openAddressBookSheet } from "../src/ui/address-book-sheet.ts";

function setup() {
  document.body.innerHTML = "";
  const frame = document.createElement("div");
  frame.className = "phone-frame";
  const screen = document.createElement("div");
  const outside = document.createElement("button");
  outside.textContent = "outside";
  screen.append(outside);
  frame.append(screen);
  document.body.append(frame);
  outside.focus();
  return { frame, screen, outside };
}
const content = () => {
  const c = document.createElement("div");
  const b = document.createElement("button");
  b.textContent = "row";
  c.append(b);
  return c;
};

afterEach(() => vi.useRealTimers());

describe("openSheet", () => {
  it("is a modal dialog inside the phone: titled, the screen underneath is inert, focus moves in", () => {
    const { frame, screen } = setup();
    openSheet({ frame, screen, chromeStyle: "ios", title: "Address book", subtitle: "Tron · 3 saved", content: content() });
    const sheet = frame.querySelector(".phone-sheet")!;
    expect(sheet.getAttribute("role")).toBe("dialog");
    expect(sheet.getAttribute("aria-modal")).toBe("true");
    expect(document.getElementById(sheet.getAttribute("aria-labelledby")!)!.textContent).toBe("Address book");
    expect(frame.querySelector(".phone-sheet-subtitle")!.textContent).toBe("Tron · 3 saved");
    expect(screen.hasAttribute("inert")).toBe(true);
    expect(document.activeElement!.textContent).toBe("row");
    expect(frame.querySelector(".phone-overlay")!.parentElement).toBe(frame);
  });

  it("closes with the close button, Escape and a tap on the scrim, then restores focus and the screen", () => {
    vi.useFakeTimers();
    for (const how of ["button", "escape", "scrim"] as const) {
      const { frame, screen, outside } = setup();
      const onClosed = vi.fn();
      openSheet({ frame, screen, chromeStyle: "ios", title: "t", content: content(), onClosed });
      const scrim = frame.querySelector<HTMLElement>(".phone-overlay")!;
      if (how === "button") frame.querySelector<HTMLButtonElement>(".phone-sheet-close")!.click();
      if (how === "escape") scrim.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      if (how === "scrim") scrim.click();
      expect(scrim.classList.contains("is-closing")).toBe(true);
      expect(screen.hasAttribute("inert")).toBe(false);
      vi.advanceTimersByTime(300);
      expect(frame.querySelector(".phone-overlay")).toBeNull();
      expect(document.activeElement).toBe(outside);
      expect(onClosed).toHaveBeenCalledTimes(1);
    }
  });

  it("a tap inside the sheet does not close it; close(false) leaves focus where the caller put it", () => {
    vi.useFakeTimers();
    const { frame, screen } = setup();
    const sheet = openSheet({ frame, screen, chromeStyle: "ios", title: "t", content: content() });
    frame.querySelector<HTMLElement>(".phone-sheet")!.click();
    expect(frame.querySelector(".is-closing")).toBeNull();
    const next = document.createElement("input");
    screen.append(next);
    sheet.close(false);
    next.focus();
    vi.advanceTimersByTime(300);
    expect(document.activeElement).toBe(next);
  });

  it("Tab and Shift+Tab cycle inside the sheet", () => {
    const { frame, screen } = setup();
    openSheet({ frame, screen, chromeStyle: "ios", title: "t", content: content() });
    const scrim = frame.querySelector<HTMLElement>(".phone-overlay")!;
    const close = frame.querySelector<HTMLButtonElement>(".phone-sheet-close")!;
    const row = [...frame.querySelectorAll<HTMLButtonElement>(".phone-sheet button")].find((b) => b.textContent === "row")!;
    row.focus(); // the last focusable: Tab wraps to the first
    scrim.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(close);
    scrim.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true })); // first: Shift+Tab wraps to the last
    expect(document.activeElement).toBe(row);
  });

  it("dragging the grab area down far enough dismisses it; a short drag springs back", () => {
    vi.useFakeTimers();
    const drag = (dy: number, ms: number) => {
      const { frame, screen } = setup();
      openSheet({ frame, screen, chromeStyle: "ios", title: "t", content: content() });
      const grab = frame.querySelector<HTMLElement>(".phone-sheet-grab")!;
      const ev = (type: string, y: number, t: number) => {
        const e = new MouseEvent(type, { bubbles: true, clientY: y });
        Object.defineProperty(e, "pointerId", { value: 1 });
        Object.defineProperty(e, "timeStamp", { value: t });
        return e;
      };
      Object.defineProperty(grab, "setPointerCapture", { value: () => {} });
      grab.dispatchEvent(ev("pointerdown", 100, 0));
      grab.dispatchEvent(ev("pointermove", 100 + dy, ms));
      grab.dispatchEvent(ev("pointerup", 100 + dy, ms));
      return frame.querySelector(".phone-overlay")!.classList.contains("is-closing");
    };
    expect(drag(160, 400)).toBe(true); // a long, slow pull
    expect(drag(60, 40)).toBe(true); // a quick flick (1.5 px/ms)
    expect(drag(40, 600)).toBe(false); // short and slow: stays
  });
});

describe("openAddressBookSheet", () => {
  const entries = [
    { network: "TRON" as const, address: "TAzsQ9Gx8eqFNFSKbeXrbi45CuVPHzA8wr", comment: "Binance hot wallet" },
    { network: "ETH" as const, address: "0x28c6c06298d514db089934071355e5743bf21d60", comment: "Binance hot wallet" },
    { network: "TRON" as const, address: "TNaRAoLUyYEV2uF7GUrzSjRQTU8v5ZJ5VR", comment: "HTX hot wallet" },
  ];
  it("lists only the entries of the network, newest first as saved, with a short address; picking one hands it over and closes", async () => {
    vi.useFakeTimers();
    const { frame, screen } = setup();
    const onPick = vi.fn();
    await openAddressBookSheet({ frame, screen, chromeStyle: "ios", network: "TRON", networkLabel: "Tron", onPick, load: async () => entries });
    const rows = [...frame.querySelectorAll<HTMLButtonElement>(".book-row")];
    expect(rows.map((r) => r.querySelector(".book-name")!.textContent)).toEqual(["Binance hot wallet", "HTX hot wallet"]);
    expect(rows[0]!.querySelector(".book-address")!.textContent).toBe("TAzsQ9Gx…HzA8wr");
    expect(frame.querySelector(".phone-sheet-subtitle")!.textContent).toBe("Tron · 2 saved");
    expect(rows[0]!.getAttribute("aria-label")).toBe("Binance hot wallet, TAzsQ9Gx8eqFNFSKbeXrbi45CuVPHzA8wr");
    rows[1]!.click();
    expect(onPick).toHaveBeenCalledWith(entries[2]);
    expect(frame.querySelector(".is-closing")).not.toBeNull();
  });

  it("an empty book for the network says so; a network the book does not know has none", async () => {
    const { frame, screen } = setup();
    await openAddressBookSheet({ frame, screen, chromeStyle: "ios", network: undefined, networkLabel: "Polygon", onPick: vi.fn(), load: async () => entries });
    expect(frame.querySelector(".book-empty")!.textContent).toBe("No saved Polygon addresses yet.");
    expect(frame.querySelector(".phone-sheet-subtitle")!.textContent).toBe("Polygon · 0 saved");
  });
});
