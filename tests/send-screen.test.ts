import { describe, it, expect, afterEach, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { mountSendScreen, unmountSendScreen } from "../src/ui/send-screen.ts";
import { SendController, type SendDeps, type SendTokenInfo } from "../src/send/send-session.ts";
import { validateTronAddress } from "../src/send/tron-address.ts";
import type { RiskResult } from "../src/send/risk-client.ts";

const CLEAR = "TMuA6YqfCeX8EhbfYEg5y7S4DqzSJireY9";
const RISKY = "THJUJFyTnrBWb1ijWav7qfRBrjUuKgP49Z";

const USDT: SendTokenInfo = {
  key: "Tron:TR7NHq", symbol: "USDT", name: "Tether USD", decimals: 6, isNative: false,
  contract: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t", balanceUnits: 120_000_000n, trxBalanceUnits: 250_000_000n,
};

const LOGO_ADDR = "TJDENsfBJs4RFETt1X1W8wMDc8M5XnJhCe";
const NAMED_ADDR = "TWd4WrZ9wn84f5x1hZhL4DHvk738ns5jwb";
const LOGO_URL = "https://cdn.jsdelivr.net/gh/example/kyt-entity-registry@main/logos/example.png";
const SEED: Record<string, RiskResult> = {
  [LOGO_ADDR]: { state: "clear", label: "Example Exchange", logo: LOGO_URL },
  [NAMED_ADDR]: { state: "clear", label: "Åland Exchange" }, [CLEAR]: { state: "clear", label: "Binance" }, [RISKY]: { state: "caution" } };
const deps: SendDeps = {
  validateAddress: (a) => validateTronAddress(a, webcrypto.subtle as SubtleCrypto),
  estimateFee: async () => ({ kind: "live", newRecipient: false, sun: 6_400_000n }),
  checkRisk: async (a) => SEED[a] ?? { state: "unavailable" },
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

const settle = () => new Promise((r) => setTimeout(r, 0));

function mount(chromeStyle: "ios" | "android" = "ios") {
  document.body.innerHTML = "";
  const frame = document.createElement("div");
  frame.className = `phone-frame chrome-${chromeStyle}`;
  const screen = document.createElement("div");
  screen.className = "phone-screen";
  frame.append(screen);
  document.body.append(frame);
  const controller = new SendController(USDT, deps);
  const onBack = vi.fn();
  const onDone = vi.fn();
  mountSendScreen({ frame, screen, chromeStyle, controller, networkLabel: "Tron", onBack, onDone });
  const q = <T extends Element>(sel: string) => screen.querySelector(sel) as T;
  const type = async (input: HTMLInputElement, value: string) => {
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    if (input.id === "send-address") {
      // Validation uses real (async) WebCrypto: wait for the controller to finish instead of guessing a delay.
      await vi.waitFor(() => {
        const st = controller.state;
        if (st.address !== value.trim()) throw new Error("address not applied yet");
        if (st.addressStatus.kind === "empty" || st.addressStatus.kind === "pending") throw new Error("not validated yet");
        if (st.addressStatus.kind === "valid" && (st.risk.kind === "idle" || st.risk.kind === "checking")) throw new Error("risk pending");
      });
    } else {
      await settle();
    }
  };
  return { frame, screen, controller, onBack, onDone, q, type };
}

afterEach(() => {
  unmountSendScreen();
  document.body.innerHTML = "";
});

describe("Send screen markup", () => {
  it("title, network, labeled fields and the input attributes from DR11", () => {
    const { q } = mount();
    expect(q(".send-nav-title").textContent).toBe("Send USDT");
    expect(q(".send-nav-sub").textContent).toBe("Tron");
    const address = q<HTMLInputElement>("#send-address");
    expect(address.getAttribute("autocapitalize")).toBe("off");
    expect(address.getAttribute("autocorrect")).toBe("off");
    expect(address.getAttribute("autocomplete")).toBe("off");
    expect(address.spellcheck).toBe(false);
    expect(q<HTMLLabelElement>("label[for=send-address]").textContent).toBe("To");
    expect(q<HTMLInputElement>("#send-amount").getAttribute("inputmode")).toBe("decimal");
    expect(q<HTMLLabelElement>("label[for=send-amount]").textContent).toBe("Amount");
    expect(q("#send-address-status").getAttribute("aria-live")).toBe("polite");
    expect(q(".send-balance").textContent).toBe("Balance 120.00 USDT");
  });

  it("starts with Send disabled and a reason line (never a bare grey button)", () => {
    const { q } = mount();
    expect(q<HTMLButtonElement>(".send-submit").disabled).toBe(true);
    expect(q(".send-reason").textContent).toBe("Enter an address");
  });
});

describe("clear and caution flows", () => {
  it("a labeled address shows the label and no caption line; Send then reaches the Sent view with the Simulated pill", async () => {
    const { q, type, onDone } = mount();
    await type(q("#send-address"), CLEAR);
    await type(q("#send-amount"), "25.5");
    expect(q(".send-status-text").textContent).toBe("Binance");
    expect(document.querySelector(".send-caption")).toBeNull();
    const submit = q<HTMLButtonElement>(".send-submit");
    expect(submit.disabled).toBe(false);
    submit.click();
    submit.click(); // double click
    expect(q<HTMLButtonElement>(".send-submit").textContent).toBe("Sending…");
    await new Promise((r) => setTimeout(r, 700));
    expect(q(".send-sent").hasAttribute("hidden")).toBe(false);
    expect(q(".send-sent-headline").textContent).toBe("25.5 USDT sent");
    expect(q(".send-sent-pill").textContent).toBe("Simulated — no transaction was sent");
    expect(q(".send-sent-address").textContent).toBe(CLEAR);
    (q(".send-sent .send-submit") as HTMLButtonElement).click();
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("caution: amber status first, popup only after Send, with the agreed copy and no score/level/reason words", async () => {
    const { q, type, frame, screen } = mount();
    await type(q("#send-address"), RISKY);
    await type(q("#send-amount"), "10");
    expect(q(".send-status-text").textContent).toBe("Risk signals found for this address");
    expect(frame.querySelector(".phone-overlay")).toBeNull(); // not on paste, not on the verdict
    q<HTMLButtonElement>(".send-submit").click();

    const overlay = frame.querySelector(".phone-overlay")!;
    expect(overlay.parentElement).toBe(frame); // inside the phone, not on document.body
    const dialog = overlay.querySelector(".phone-dialog")!;
    expect(dialog.getAttribute("role")).toBe("alertdialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.querySelector(".phone-dialog-title")!.textContent).toBe("Risk signals found for this address");
    expect(dialog.querySelector(".phone-dialog-body")!.textContent).toBe("Aegis data at the time of the check shows risk signals. This is information, not advice, and details aren't shown. The decision is yours.");
    expect((dialog.textContent ?? "").toLowerCase()).not.toMatch(/score|level|reason|flag|sanction|critical|high|medium|mixer|scam/);
    expect(screen.hasAttribute("inert")).toBe(true);
    // Cancel is the primary, safe action and has focus
    const buttons = [...dialog.querySelectorAll("button")];
    expect(buttons.map((b) => b.textContent)).toEqual(["Cancel", "Continue"]);
    expect(document.activeElement).toBe(buttons[0]);
  });

  describe("VASP name and logo", () => {
    it("shows the name with its logo laid over an initial placeholder; no check mark; the image carries no referrer", async () => {
      const { q, type } = mount();
      await type(q("#send-address"), LOGO_ADDR);
      expect(q(".send-status-text").textContent).toBe("Example Exchange");
      expect(q(".send-status-icon").textContent).toBe(""); // the badge replaces the check mark
      expect(q<HTMLElement>(".send-owner").hidden).toBe(false);
      expect(q(".send-owner-initial").textContent).toBe("E");
      const img = q<HTMLImageElement>(".send-owner-logo");
      expect(img.getAttribute("src")).toBe(LOGO_URL);
      expect(img.alt).toBe("");
      expect(img.referrerPolicy).toBe("no-referrer");
      expect(img.hidden).toBe(true); // hidden until it has loaded: never a broken-image icon
      img.dispatchEvent(new Event("load"));
      expect(img.hidden).toBe(false);
    });

    it("a logo that fails to load is removed and the initial stays", async () => {
      const { q, type } = mount();
      await type(q("#send-address"), LOGO_ADDR);
      q<HTMLImageElement>(".send-owner-logo").dispatchEvent(new Event("error"));
      expect(document.querySelector(".send-owner-logo")).toBeNull();
      expect(q(".send-owner-initial").textContent).toBe("E");
    });

    it("a name without a logo shows just the initial (works for non-Latin first letters too)", async () => {
      const { q, type } = mount();
      await type(q("#send-address"), NAMED_ADDR);
      expect(q(".send-status-text").textContent).toBe("Åland Exchange");
      expect(document.querySelector(".send-owner-logo")).toBeNull();
      expect(q(".send-owner-initial").textContent).toBe("Å");
    });

    it("a caution address shows no badge and no name", async () => {
      const { q, type } = mount();
      await type(q("#send-address"), RISKY);
      expect(q<HTMLElement>(".send-owner").hidden).toBe(true);
      expect(document.querySelector(".send-owner-logo")).toBeNull();
    });
  });

  it("Esc cancels: the popup closes, address and amount stay, and focus returns to the address field", async () => {
    const { q, type, frame, screen } = mount();
    await type(q("#send-address"), RISKY);
    await type(q("#send-amount"), "10");
    q<HTMLButtonElement>(".send-submit").click();
    frame.querySelector(".phone-overlay")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(frame.querySelector(".phone-overlay")).toBeNull();
    expect(screen.hasAttribute("inert")).toBe(false);
    expect(q<HTMLInputElement>("#send-address").value).toBe(RISKY);
    expect(q<HTMLInputElement>("#send-amount").value).toBe("10");
    expect(document.activeElement).toBe(q("#send-address"));
  });

  it("Tab and Shift+Tab stay inside the dialog", async () => {
    const { q, type, frame } = mount();
    await type(q("#send-address"), RISKY);
    await type(q("#send-amount"), "10");
    q<HTMLButtonElement>(".send-submit").click();
    const overlay = frame.querySelector(".phone-overlay")!;
    const [cancel, anyway] = [...overlay.querySelectorAll("button")] as HTMLButtonElement[];
    anyway!.focus();
    overlay.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(cancel);
    overlay.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(anyway);
  });

  it("Continue goes straight to Sending", async () => {
    const { q, type, frame } = mount();
    await type(q("#send-address"), RISKY);
    await type(q("#send-amount"), "10");
    q<HTMLButtonElement>(".send-submit").click();
    ([...frame.querySelectorAll(".phone-dialog button")][1] as HTMLButtonElement).click();
    expect(frame.querySelector(".phone-overlay")).toBeNull();
    expect(q<HTMLButtonElement>(".send-submit").textContent).toBe("Sending…");
  });

  it("an address nobody answered for shows 'Couldn't verify' with Check again, and Send stays possible", async () => {
    const { q, type } = mount();
    await type(q("#send-address"), "TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7");
    await type(q("#send-amount"), "10");
    expect(q(".send-status-text").textContent).toBe("Couldn't verify this address.");
    expect(q<HTMLButtonElement>(".send-status .send-link").hidden).toBe(false);
    expect(q<HTMLButtonElement>(".send-submit").disabled).toBe(false);
  });
});

describe("validation messages and amount states", () => {
  it("a wrong address and amount problems are shown inline with a reason under the disabled button", async () => {
    const { q, type } = mount();
    await type(q("#send-address"), RISKY.slice(0, -1) + "j");
    expect(q(".send-error").textContent).toBe("Enter a valid Tron address");
    await type(q("#send-address"), CLEAR);
    await type(q("#send-amount"), "500");
    expect((q("#send-amount-error") as HTMLElement).textContent).toBe("Not enough USDT");
    expect(q(".send-reason").textContent).toBe(""); // already shown once, inline under the field
    expect(q<HTMLButtonElement>(".send-submit").disabled).toBe(true);
  });

  it("Max fills the whole token balance", async () => {
    const { q, type } = mount();
    await type(q("#send-address"), CLEAR);
    (q(".send-field .send-link") as HTMLButtonElement).click();
    expect(q<HTMLInputElement>("#send-amount").value).toBe("120");
  });

  it("Back is a real control and is inactive while Sending", async () => {
    const { q, type, onBack } = mount();
    q<HTMLButtonElement>(".send-back").click();
    expect(onBack).toHaveBeenCalledTimes(1);
    await type(q("#send-address"), CLEAR);
    await type(q("#send-amount"), "5");
    q<HTMLButtonElement>(".send-submit").click();
    q<HTMLButtonElement>(".send-back").click();
    expect(onBack).toHaveBeenCalledTimes(1); // ignored during Sending
  });
});

describe("re-render survival", () => {
  it("remounting the screen from the same controller rebuilds the typed values (the phone wipes its DOM on re-render)", async () => {
    const first = mount();
    await first.type(first.q("#send-address"), CLEAR);
    await first.type(first.q("#send-amount"), "7");
    const { frame, screen, controller } = first;
    screen.textContent = "";
    mountSendScreen({ frame, screen, chromeStyle: "ios", controller, networkLabel: "Tron", onBack: () => {}, onDone: () => {} });
    expect(screen.querySelector<HTMLInputElement>("#send-address")!.value).toBe(CLEAR);
    expect(screen.querySelector<HTMLInputElement>("#send-amount")!.value).toBe("7");
    expect(screen.querySelector(".send-status-text")!.textContent).toBe("Binance");
  });

  it("a popup that was open when the phone re-rendered comes back", async () => {
    const first = mount();
    await first.type(first.q("#send-address"), RISKY);
    await first.type(first.q("#send-amount"), "10");
    first.q<HTMLButtonElement>(".send-submit").click();
    const { frame, screen, controller } = first;
    unmountSendScreen(); // what renderPhoneFrame does before wiping the DOM
    frame.innerHTML = "";
    const newScreen = document.createElement("div");
    frame.append(newScreen);
    mountSendScreen({ frame, screen: newScreen, chromeStyle: "ios", controller, networkLabel: "Tron", onBack: () => {}, onDone: () => {} });
    expect(frame.querySelectorAll(".phone-overlay")).toHaveLength(1);
    void screen;
  });
});

describe("Android skin", () => {
  it("uses the same copy and button order", async () => {
    const { q, type, frame } = mount("android");
    await type(q("#send-address"), RISKY);
    await type(q("#send-amount"), "10");
    q<HTMLButtonElement>(".send-submit").click();
    expect(frame.querySelector(".phone-overlay")!.classList.contains("chrome-android")).toBe(true);
    expect([...frame.querySelectorAll(".phone-dialog button")].map((b) => b.textContent)).toEqual(["Cancel", "Continue"]);
  });
});
