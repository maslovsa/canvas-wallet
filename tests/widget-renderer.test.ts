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
    // price_chart kicks off an async fetch — stub global fetch so this
    // synchronous test never makes a real network call.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    const widgets: Widget[] = [
      { type: "banner", title: "Title", action: "a" },
      { type: "action_group", items: [{ label: "L", action: "a" }] },
      { type: "key_value", items: [{ label: "L", value: "V" }] },
      { type: "notice", message: "M" },
      { type: "price_chart", coingeckoId: "tron" },
    ];
    for (const widget of widgets) {
      const el = renderWidget(widget, token, () => {});
      expect(el).not.toBeNull();
      expect(el?.classList.contains("widget")).toBe(true);
    }

    vi.unstubAllGlobals();
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

  it("price_chart renders live data (no placeholder caption) when the fetch succeeds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          prices: [
            [0, 100],
            [1, 110],
          ],
        }),
      }),
    );
    const el = renderWidget({ type: "price_chart", coingeckoId: "widget-test-success" }, token, () => {});
    await vi.waitFor(() => {
      expect(el?.querySelector(".price-chart-svg")).not.toBeNull();
    });
    expect(el?.querySelector(".price-chart-caption")).toBeNull();
    vi.unstubAllGlobals();
  });

  it("price_chart falls back to a labeled placeholder chart when the fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const el = renderWidget({ type: "price_chart", coingeckoId: "widget-test-failure" }, token, () => {});
    await vi.waitFor(() => {
      expect(el?.querySelector(".price-chart-caption")).not.toBeNull();
    });
    expect(el?.querySelector(".price-chart-svg")).not.toBeNull();
    vi.unstubAllGlobals();
  });
});
