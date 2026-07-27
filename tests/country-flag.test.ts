import { describe, it, expect } from "vitest";
import { countryFlagAssetUrl, countryFlagEmoji, VENDORED_FLAG_CODES } from "../src/country/country-flag.ts";

describe("countryFlagAssetUrl", () => {
  it("returns a vendored SVG path for a code we have an asset for", () => {
    expect(countryFlagAssetUrl("US")).toBe("/flags/us.svg");
    expect(countryFlagAssetUrl("HK")).toBe("/flags/hk.svg");
    expect(countryFlagAssetUrl("VG")).toBe("/flags/vg.svg");
  });

  it("is case-insensitive", () => {
    expect(countryFlagAssetUrl("us")).toBe("/flags/us.svg");
  });

  it("returns null for a code we haven't vendored, rather than guessing a URL", () => {
    expect(countryFlagAssetUrl("DE")).toBeNull();
    expect(countryFlagAssetUrl("RU")).toBeNull();
  });

  it("returns null when country is undefined", () => {
    expect(countryFlagAssetUrl(undefined)).toBeNull();
  });

  it("VENDORED_FLAG_CODES matches exactly the files this project ships", () => {
    expect(VENDORED_FLAG_CODES).toEqual(new Set(["US", "HK", "VG"]));
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
