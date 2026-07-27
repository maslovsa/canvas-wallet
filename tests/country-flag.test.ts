import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { countryFlagAssetUrl, countryFlagEmoji, VENDORED_FLAG_CODES } from "../src/country/country-flag.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FLAGS_DIR = join(__dirname, "..", "public", "flags");

describe("countryFlagAssetUrl", () => {
  it("returns a vendored SVG path for well-known codes", () => {
    expect(countryFlagAssetUrl("US")).toBe("/flags/us.svg");
    expect(countryFlagAssetUrl("HK")).toBe("/flags/hk.svg");
    expect(countryFlagAssetUrl("VG")).toBe("/flags/vg.svg");
    expect(countryFlagAssetUrl("DE")).toBe("/flags/de.svg");
    expect(countryFlagAssetUrl("RU")).toBe("/flags/ru.svg");
  });

  it("is case-insensitive", () => {
    expect(countryFlagAssetUrl("us")).toBe("/flags/us.svg");
  });

  it("returns null for a code that isn't a real/vendored country code, rather than guessing a URL", () => {
    expect(countryFlagAssetUrl("ZZ")).toBeNull();
    expect(countryFlagAssetUrl("XX")).not.toBeNull(); // XX is one of flag-icons' own placeholder codes, actually vendored
  });

  it("returns null when country is undefined", () => {
    expect(countryFlagAssetUrl(undefined)).toBeNull();
  });

  it("vendors the full lipis/flag-icons 4x3 set (257 codes)", () => {
    expect(VENDORED_FLAG_CODES.size).toBe(257);
  });

  it("every vendored code has a matching SVG file on disk", () => {
    for (const cc of VENDORED_FLAG_CODES) {
      const path = join(FLAGS_DIR, `${cc.toLowerCase()}.svg`);
      expect(() => readdirSync(dirname(path))).not.toThrow();
      const files = readdirSync(FLAGS_DIR);
      expect(files).toContain(`${cc.toLowerCase()}.svg`);
    }
  });

  it("every SVG file on disk is registered in VENDORED_FLAG_CODES (no orphaned assets)", () => {
    const svgFiles = readdirSync(FLAGS_DIR).filter((f) => f.endsWith(".svg"));
    for (const file of svgFiles) {
      const cc = file.replace(/\.svg$/, "").toUpperCase();
      expect(VENDORED_FLAG_CODES.has(cc)).toBe(true);
    }
  });
});

describe("countryFlagEmoji", () => {
  it("maps a 2-letter code to its regional-indicator flag emoji", () => {
    expect(countryFlagEmoji("US")).toBe("\u{1F1FA}\u{1F1F8}");
    expect(countryFlagEmoji("DE")).toBe("\u{1F1E9}\u{1F1EA}");
  });

  it("is case-insensitive", () => {
    expect(countryFlagEmoji("us")).toBe(countryFlagEmoji("US"));
  });

  it("falls back to the globe for undefined", () => {
    expect(countryFlagEmoji(undefined)).toBe("\u{1F310}");
  });

  it("falls back to the globe for a non-2-letter string, never guessing", () => {
    expect(countryFlagEmoji("USA")).toBe("\u{1F310}");
    expect(countryFlagEmoji("")).toBe("\u{1F310}");
  });
});
