import { describe, it, expect, vi } from "vitest";
import { renderWidget } from "../src/widgets/widget-renderer.ts";
import type { Widget, Token } from "../src/types.ts";

const token: Token = {
  name: "T",
  symbol: "T",
  type: "ERC20",
  id: "0x1",
  decimals: 18,
  status: "active",
};

describe("renderWidget", () => {
  it("renders each known widget type without throwing", () => {
    const widgets: Widget[] = [
      { type: "banner", title: "Title", action: "a" },
      { type: "action_group", items: [{ label: "L", action: "a" }] },
      { type: "key_value", items: [{ label: "L", value: "V" }] },
      { type: "notice", message: "M" },
    ];
    for (const widget of widgets) {
      const el = renderWidget(widget, token, () => {});
      expect(el).not.toBeNull();
      expect(el?.classList.contains("widget")).toBe(true);
    }
  });

  it("silently ignores an unknown widget.type (never throws) and logs a warning", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const unknown = { type: "carousel_of_scams" } as unknown as Widget;
    const el = renderWidget(unknown, token, () => {});
    expect(el).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("fires onAction with the widget's action key when clicked", () => {
    const onAction = vi.fn();
    const el = renderWidget({ type: "banner", title: "T", action: "mint_dapp" }, token, onAction);
    el?.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onAction).toHaveBeenCalledWith("mint_dapp");
  });
});
