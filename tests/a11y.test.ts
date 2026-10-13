import { describe, it, expect, vi } from "vitest";
import { makeActivatable } from "../src/ui/a11y.ts";

describe("makeActivatable", () => {
  it("makes an element focusable, a button, and operable with click, Enter and Space only", () => {
    const el = document.createElement("div");
    const onActivate = vi.fn();
    makeActivatable(el, onActivate);
    expect(el.tabIndex).toBe(0);
    expect(el.getAttribute("role")).toBe("button");
    el.click();
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    el.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
    expect(onActivate).toHaveBeenCalledTimes(3);
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    expect(onActivate).toHaveBeenCalledTimes(3);
  });
});
