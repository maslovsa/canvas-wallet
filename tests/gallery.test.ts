import { describe, it, expect, vi } from "vitest";
import { renderGalleryCards } from "../src/ui/gallery.ts";
import type { Registry } from "../src/types.ts";

const registry = {
  schemaVersion: "1.2.0",
  networks: [
    { name: "Tron", tokens: ["TRX", "USDT", "USDC", "SUN"].map((symbol) => ({ name: symbol, symbol, type: "TRC20", id: `id-${symbol}`, decimals: 6, status: "active" })) },
    { name: "Ethereum", tokens: [] },
  ],
} as unknown as Registry;

describe("gallery cards", () => {
  it("each card shows a decorative mini phone with the list's first network and first three assets", () => {
    const host = document.createElement("div");
    renderGalleryCards(host, [{ meta: { id: "x", name: "My list", description: "d", file: "x.json" }, registry }], vi.fn());
    const preview = host.querySelector(".gallery-card-preview")!;
    expect(preview.getAttribute("aria-hidden")).toBe("true");
    expect([...preview.querySelectorAll(".mini-phone-symbol")].map((e) => e.textContent)).toEqual(["TRX", "USDT", "USDC"]);
    expect(preview.querySelectorAll(".mini-phone-chip")).toHaveLength(2);
    expect(host.querySelector(".gallery-card-stats")!.textContent).toBe("4 tokens2 networks");
  });

  it("a list that failed to load has no preview and cannot be opened", () => {
    const host = document.createElement("div");
    const onOpen = vi.fn();
    renderGalleryCards(host, [{ meta: { id: "x", name: "Broken", description: "d", file: "x.json" }, registry: undefined }], onOpen);
    expect(host.querySelector(".gallery-card-preview")).toBeNull();
    host.querySelector<HTMLButtonElement>(".gallery-card")!.click();
    expect(onOpen).not.toHaveBeenCalled();
  });
});
