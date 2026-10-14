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
