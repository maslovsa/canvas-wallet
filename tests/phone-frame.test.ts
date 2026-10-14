import { describe, it, expect } from "vitest";
import { renderPhoneFrame, setPhoneNavScreen, type PhoneFrameOptions } from "../src/ui/phone-frame.ts";
import type { Token } from "../src/types.ts";

const token = { name: "Tether USD", symbol: "USDT", type: "TRC20", id: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t", decimals: 6, status: "active", widgets: [] } as unknown as Token;
const options = (over: Partial<PhoneFrameOptions> = {}): PhoneFrameOptions => ({
  chromeStyle: "ios",
  chromeTheme: "dark",
  networkName: "Tron",
  networkInfo: undefined,
  registryNetworks: [{ name: "Tron", tokens: [token] }] as unknown as PhoneFrameOptions["registryNetworks"],
  allNetworkInfo: [],
  listName: "Test list",
  listDescription: "",
  onSelectNetwork: () => {},
  onSelectToken: () => {},
  ...over,
});

describe("phone screen transitions", () => {
  it("a new screen slides in (forward when deeper, back when shallower); the same screen re-rendered does not", () => {
    const host = document.createElement("div");
    document.body.append(host);
    setPhoneNavScreen("list");
    renderPhoneFrame(host, token, options()); // first render: nothing to animate from
    expect(host.querySelector(".phone-screen")!.className).toBe("phone-screen");
    setPhoneNavScreen("detail");
    renderPhoneFrame(host, token, options());
    expect(host.querySelector(".phone-screen")!.classList.contains("enter-forward")).toBe(true);
    renderPhoneFrame(host, token, options()); // a live edit: same screen
    expect(host.querySelector(".phone-screen")!.className).toBe("phone-screen");
    setPhoneNavScreen("list");
    renderPhoneFrame(host, token, options());
    expect(host.querySelector(".phone-screen")!.classList.contains("enter-back")).toBe(true);
    host.remove();
  });

  it("re-rendering the same screen keeps its scroll position", () => {
    const host = document.createElement("div");
    document.body.append(host);
    setPhoneNavScreen("detail");
    renderPhoneFrame(host, token, options());
    renderPhoneFrame(host, token, options());
    host.querySelector<HTMLElement>(".phone-screen")!.scrollTop = 240;
    renderPhoneFrame(host, token, options());
    expect(host.querySelector<HTMLElement>(".phone-screen")!.scrollTop).toBe(240);
    host.remove();
  });
});

describe("wallet home", () => {
  const send = { type: "send" } as const;
  const receive = { type: "receive" } as const;
  const usdt = { ...token, actions: { send, receive } } as unknown as Token;
  const trx = { ...token, symbol: "TRX", id: "native", actions: { send } } as unknown as Token;
  const plain = { ...token, symbol: "SUN", id: "TSUN", actions: undefined } as unknown as Token;
  const home = (tokens: Token[], over: Partial<PhoneFrameOptions> = {}) =>
    options({ registryNetworks: [{ name: "Tron", tokens }] as unknown as PhoneFrameOptions["registryNetworks"], ...over });

  it("shows an (illustrative) total balance for the network and a compact bar title that is hidden until scrolled", () => {
    const host = document.createElement("div");
    document.body.append(host);
    setPhoneNavScreen("list");
    renderPhoneFrame(host, undefined, home([usdt, trx, plain]));
    expect(host.querySelector(".wallet-hero-amount")!.textContent).toMatch(/^\$[\d,]+\.\d\d$/);
    expect(host.querySelector(".wallet-hero-note")!.textContent).toBe("3 assets · illustrative amounts");
    expect(host.querySelector(".phone-list-bar-title")!.textContent).toBe("Test list");
    expect(host.querySelector(".phone-list-bar")!.classList.contains("is-scrolled")).toBe(false);
    host.remove();
  });

  it("offers Send and Receive only for actions some token has, and a single candidate is opened directly", () => {
    const host = document.createElement("div");
    document.body.append(host);
    setPhoneNavScreen("list");
    const picked: string[] = [];
    renderPhoneFrame(host, undefined, home([usdt, plain], { onSelectToken: (t) => picked.push(t.symbol) }));
    const labels = [...host.querySelectorAll(".wallet-action")].map((b) => b.textContent);
    expect(labels).toEqual(["Send", "Receive"]);
    (host.querySelector(".wallet-action") as HTMLButtonElement).click(); // only USDT can send: no picker
    expect(picked).toEqual(["USDT"]);
    expect(host.querySelector(".phone-overlay")).toBeNull();
    host.remove();
  });

  it("with several candidates a picker lists them and choosing one opens that token", () => {
    const host = document.createElement("div");
    document.body.append(host);
    setPhoneNavScreen("list");
    const picked: string[] = [];
    renderPhoneFrame(host, undefined, home([usdt, trx], { onSelectToken: (t) => picked.push(t.symbol) }));
    (host.querySelector(".wallet-action") as HTMLButtonElement).click(); // Send: USDT and TRX
    const rows = [...host.querySelectorAll(".pick-row")];
    expect(rows.map((r) => r.querySelector("strong")!.textContent)).toEqual(["USDT", "TRX"]);
    (rows[1] as HTMLButtonElement).click();
    expect(picked).toEqual(["TRX"]);
    expect(host.querySelector(".phone-overlay")).toBeNull();
    host.remove();
  });

  it("a network where no token can send or receive has no shortcuts", () => {
    const host = document.createElement("div");
    document.body.append(host);
    setPhoneNavScreen("list");
    renderPhoneFrame(host, undefined, home([plain]));
    expect(host.querySelector(".wallet-hero-actions")).toBeNull();
    host.remove();
  });

  it("the list bar and the token bar turn into compact blurred bars when the screen scrolls", () => {
    const host = document.createElement("div");
    document.body.append(host);
    setPhoneNavScreen("list");
    renderPhoneFrame(host, undefined, home([usdt]));
    const screen = host.querySelector<HTMLElement>(".phone-screen")!;
    // happy-dom has no layout: offsets are 0, so any positive scroll is past the threshold
    screen.scrollTop = 500;
    screen.dispatchEvent(new Event("scroll"));
    expect(host.querySelector(".phone-list-bar")!.classList.contains("is-scrolled")).toBe(true);
    screen.scrollTop = 0;
    screen.dispatchEvent(new Event("scroll"));
    expect(host.querySelector(".phone-list-bar")!.classList.contains("is-scrolled")).toBe(false);
    host.remove();
  });
});

describe("Android look", () => {
  const press = (el: Element) => el.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 10, clientY: 10 }));
  it("a press on a button spawns a Material ripple that cleans itself up; iOS gets none", () => {
    const host = document.createElement("div");
    document.body.append(host);
    setPhoneNavScreen("list");
    renderPhoneFrame(host, undefined, options({ chromeStyle: "android" }));
    expect(host.className).toContain("chrome-android");
    const chip = host.querySelector(".phone-network-chip")!;
    press(chip);
    const wave = chip.querySelector(".ripple")!;
    expect(wave).not.toBeNull();
    wave.dispatchEvent(new Event("animationend"));
    expect(chip.querySelector(".ripple")).toBeNull();

    renderPhoneFrame(host, undefined, options({ chromeStyle: "ios" }));
    press(host.querySelector(".phone-network-chip")!);
    expect(host.querySelector(".ripple")).toBeNull();
    host.remove();
  });

  it("every back control carries both the iOS chevron + label and the Android arrow (CSS shows one)", () => {
    const host = document.createElement("div");
    document.body.append(host);
    setPhoneNavScreen("detail");
    renderPhoneFrame(host, token, options({ chromeStyle: "android" }));
    const back = host.querySelector(".card-back-btn")!;
    expect(back.getAttribute("aria-label")).toBe("Back to wallet");
    expect(back.querySelector(".back-arrow")).not.toBeNull();
    expect(back.querySelector(".card-back-label")!.textContent).toBe("Back");
    host.remove();
  });
});
