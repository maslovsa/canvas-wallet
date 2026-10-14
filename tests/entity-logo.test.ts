import { describe, it, expect } from "vitest";
import { sanitizeLogoUrl, MAX_LOGO_URL_LENGTH } from "../src/send/entity-logo.ts";

const GOOD = "https://cdn.jsdelivr.net/gh/example/kyt-entity-registry@main/logos/example.png";

describe("sanitizeLogoUrl for a risky address", () => {
  it("refuses a logo whose path names a risk reason (it would show in the network tab and the DOM); a neutral path passes", () => {
    const risky = "https://cdn.jsdelivr.net/gh/example/kyt-entity-registry@main/logos/sanctioned/grinex.png";
    expect(sanitizeLogoUrl(risky)).toBe(risky); // on a clear address the path is not a reason
    expect(sanitizeLogoUrl(risky, true)).toBeUndefined();
    expect(sanitizeLogoUrl("https://cdn.jsdelivr.net/gh/example/r@main/logos/OFAC/x.png", true)).toBeUndefined();
    expect(() => sanitizeLogoUrl("https://cdn.jsdelivr.net/gh/example/r@main/logos/%E0%A4%A/x.png", true)).not.toThrow();
    expect(sanitizeLogoUrl("https://cdn.jsdelivr.net/gh/example/r@main/logos/%E0%A4%A/x.png", true)).toBeUndefined();
    expect(sanitizeLogoUrl("https://cdn.jsdelivr.net/gh/example/r@main/logos/exchanges/bybit-com.png", true)).toBe("https://cdn.jsdelivr.net/gh/example/r@main/logos/exchanges/bybit-com.png");
  });
});

describe("sanitizeLogoUrl", () => {
  it("accepts an https jsDelivr PNG and returns it normalized", () => {
    expect(sanitizeLogoUrl(GOOD)).toBe(GOOD);
    expect(sanitizeLogoUrl(GOOD.replace(".png", ".PNG"))).toBe(GOOD.replace(".png", ".PNG"));
  });
  it.each([
    ["not a string", 42],
    ["empty", ""],
    ["leading space", ` ${GOOD}`],
    ["http", GOOD.replace("https", "http")],
    ["other host", "https://example.com/logo.png"],
    ["subdomain trick", "https://cdn.jsdelivr.net.evil.example/logo.png"],
    ["userinfo", "https://cdn.jsdelivr.net@evil.example/logo.png"],
    ["credentials", "https://u:p@cdn.jsdelivr.net/logo.png"],
    ["port", "https://cdn.jsdelivr.net:8443/logo.png"],
    ["query", `${GOOD}?a=1`],
    ["fragment", `${GOOD}#x`],
    ["svg", GOOD.replace(".png", ".svg")],
    ["javascript:", "javascript:alert(1)"],
    ["data:", "data:image/png;base64,AAAA"],
    ["too long", `https://cdn.jsdelivr.net/${"a".repeat(MAX_LOGO_URL_LENGTH)}.png`],
    ["garbage", "not a url"],
  ])("rejects %s", (_why, value) => {
    expect(sanitizeLogoUrl(value)).toBeUndefined();
  });
});
