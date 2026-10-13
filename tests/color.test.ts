import { describe, it, expect } from "vitest";
import { relativeLuminance, readableTextColor } from "../src/widgets/color.ts";

describe("relativeLuminance", () => {
  it("black is 0, white is 1, malformed is undefined", () => {
    expect(relativeLuminance("#000000")).toBe(0);
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 5);
    for (const bad of ["", "#fff", "red", "#12345g", "rgb(0,0,0)", "#1234567"]) expect(relativeLuminance(bad)).toBeUndefined();
  });
});

describe("readableTextColor", () => {
  it("dark accents get white text, light accents get black text", () => {
    expect(readableTextColor("#3375bb")).toBe("#ffffff"); // the app accent
    expect(readableTextColor("#26a17b")).toBe("#000000"); // Tether green: black reads better (7.7:1 vs 3.0:1)
    expect(readableTextColor("#ff060a")).toBe("#000000"); // Tron red
    expect(readableTextColor("#0b3025")).toBe("#ffffff");
    expect(readableTextColor("#ffd400")).toBe("#000000");
  });
  it("a malformed color falls back to white", () => {
    expect(readableTextColor("blue")).toBe("#ffffff");
  });
  it("always achieves at least 4.5:1 for the chosen text on any sampled color", () => {
    const ratio = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    for (let r = 0; r < 256; r += 51) for (let g = 0; g < 256; g += 51) for (let b = 0; b < 256; b += 51) {
      const bg = `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
      const text = readableTextColor(bg);
      expect(ratio(relativeLuminance(bg)!, relativeLuminance(text)!)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
