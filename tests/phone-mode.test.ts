import { describe, it, expect } from "vitest";
import { parseViewParam, isPhoneDevice, resolvePhoneMode, detectChromeStyle, withViewParam } from "../src/share-link/phone-mode.ts";

const desktop = { width: 1440, coarsePointer: false };
const iphone = { width: 390, coarsePointer: true };
const ipad = { width: 820, coarsePointer: true };

describe("parseViewParam", () => {
  it("reads phone and studio, ignores anything else", () => {
    expect(parseViewParam("?view=phone")).toBe("phone");
    expect(parseViewParam("?list=x&view=studio")).toBe("studio");
    expect(parseViewParam("?view=tablet")).toBeUndefined();
    expect(parseViewParam("")).toBeUndefined();
  });
});

describe("isPhoneDevice", () => {
  it("a narrow viewport is a phone whatever the pointer; a touch device up to 900 px is too", () => {
    expect(isPhoneDevice({ width: 600, coarsePointer: false })).toBe(true);
    expect(isPhoneDevice(iphone)).toBe(true);
    expect(isPhoneDevice(ipad)).toBe(true);
    expect(isPhoneDevice({ width: 820, coarsePointer: false })).toBe(false);
    expect(isPhoneDevice(desktop)).toBe(false);
  });
});

describe("resolvePhoneMode", () => {
  it("a phone gets the fullscreen phone interface automatically", () => {
    expect(resolvePhoneMode("?list=aegis-super-list", iphone)).toEqual({ phoneMode: true, fullscreen: true });
  });
  it("a desktop gets the studio by default", () => {
    expect(resolvePhoneMode("?list=aegis-super-list", desktop)).toEqual({ phoneMode: false, fullscreen: false });
  });
  it("?view=phone on a desktop shows only the phone, drawn as a device (not fullscreen)", () => {
    expect(resolvePhoneMode("?view=phone", desktop)).toEqual({ phoneMode: true, fullscreen: false });
  });
  it("?view=phone on a phone is fullscreen", () => {
    expect(resolvePhoneMode("?view=phone", iphone)).toEqual({ phoneMode: true, fullscreen: true });
  });
  it("?view=studio forces the studio even on a phone", () => {
    expect(resolvePhoneMode("?view=studio", iphone)).toEqual({ phoneMode: false, fullscreen: false });
  });
});

describe("detectChromeStyle", () => {
  it("iPhone, iPad and iPadOS (a touch Mac) are iOS; Android is Android; others undefined", () => {
    expect(detectChromeStyle("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", 5)).toBe("ios");
    expect(detectChromeStyle("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5)).toBe("ios");
    expect(detectChromeStyle("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 0)).toBeUndefined();
    expect(detectChromeStyle("Mozilla/5.0 (Linux; Android 15; Pixel 9)", 5)).toBe("android");
    expect(detectChromeStyle("Mozilla/5.0 (Windows NT 10.0)", 0)).toBeUndefined();
  });
});

describe("withViewParam", () => {
  it("adds or removes view and keeps the rest of the link", () => {
    const base = "https://maslovsa.github.io/canvas-wallet/?list=aegis-super-list&network=Tron&token=USDT";
    expect(withViewParam(base, "phone")).toBe(`${base}&view=phone`);
    expect(withViewParam(`${base}&view=phone`, undefined)).toBe(base);
    expect(withViewParam(`${base}&view=phone`, "studio")).toBe(`${base}&view=studio`);
  });
});
