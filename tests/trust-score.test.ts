import { describe, it, expect } from "vitest";
import { contrastRatio, checkBadgeContrast } from "../src/trust-score/contrast.ts";
import { checkHomograph, checkUrlHomograph } from "../src/trust-score/homograph.ts";
import { checkDomainMismatch } from "../src/trust-score/domain-mismatch.ts";
import { checkWidgetCount } from "../src/trust-score/widget-count.ts";
import { computeTrustScore } from "../src/trust-score/index.ts";
import type { Token, Widget } from "../src/types.ts";

describe("contrastRatio", () => {
  it("white on black is maximum contrast (21:1)", () => {
    expect(contrastRatio("#FFFFFF", "#000000")).toBeCloseTo(21, 0);
  });

  it("white on white is minimum contrast (1:1)", () => {
    expect(contrastRatio("#FFFFFF", "#FFFFFF")).toBeCloseTo(1, 1);
  });
});

describe("checkBadgeContrast", () => {
  it("fails when badge text is low-contrast against the worst gradient stop", () => {
    const result = checkBadgeContrast("#FFFFFF", "#FFFFFF", ["#EEEEEE", "#000000"]);
    expect(result.passes).toBe(false);
    expect(result.worstAgainst).toContain("primaryColor");
  });

  it("passes when all candidates have strong contrast", () => {
    const result = checkBadgeContrast("#FFFFFF", "#000000", ["#111111", "#222222"]);
    expect(result.passes).toBe(true);
  });
});

describe("checkHomograph", () => {
  it("flags a punycode-encoded hostname", () => {
    const result = checkHomograph("xn--pple-43d.com");
    expect(result.suspicious).toBe(true);
    expect(result.reason).toContain("Punycode");
  });

  it("flags a label mixing Latin and Cyrillic scripts", () => {
    // "а" here is Cyrillic U+0430, visually identical to Latin "a".
    const result = checkHomograph("аpple.com".replace("a", "а"));
    expect(result.suspicious).toBe(true);
  });

  it("does not flag an ordinary ASCII domain", () => {
    expect(checkHomograph("example.com").suspicious).toBe(false);
  });

  it("checkUrlHomograph extracts the hostname from a full URL", () => {
    expect(checkUrlHomograph("https://example.com/path?x=1").suspicious).toBe(false);
  });
});

describe("checkDomainMismatch", () => {
  it("flags when the action domain differs from the declared website", () => {
    const result = checkDomainMismatch("https://evil.example/mint", "https://real-token.example");
    expect(result.mismatched).toBe(true);
  });

  it("does not flag when domains match", () => {
    const result = checkDomainMismatch("https://real-token.example/mint", "https://real-token.example");
    expect(result.mismatched).toBe(false);
  });

  it("is gameable by design when both are coordinated fakes — documented limitation, not a bug", () => {
    const result = checkDomainMismatch("https://fake.example/mint", "https://fake.example");
    expect(result.mismatched).toBe(false); // matches, so no warning — this is the documented gap.
  });
});

describe("checkWidgetCount", () => {
  it("flags more than 4 widgets as excessive", () => {
    const widgets = Array.from({ length: 5 }, () => ({ type: "notice", message: "x" }) as Widget);
    expect(checkWidgetCount(widgets).excessive).toBe(true);
  });

  it("does not flag 4 or fewer widgets", () => {
    const widgets = Array.from({ length: 4 }, () => ({ type: "notice", message: "x" }) as Widget);
    expect(checkWidgetCount(widgets).excessive).toBe(false);
  });
});

describe("computeTrustScore", () => {
  it("returns no findings for a clean token", () => {
    const token: Token = {
      name: "T",
      symbol: "T",
      type: "ERC20",
      id: "0x1",
      decimals: 18,
      status: "active",
      website: "https://real.example",
      ui: {
        theme: { primaryColor: "#000000", badgeText: "OK" },
        background: { type: "solid", colors: ["#111111"] },
      },
      actions: { a: { type: "external_url", url: "https://real.example/mint" } },
    };
    expect(computeTrustScore(token)).toEqual([]);
  });

  it("surfaces a domain-mismatch finding as advisory info, not blocking", () => {
    const token: Token = {
      name: "T",
      symbol: "T",
      type: "ERC20",
      id: "0x1",
      decimals: 18,
      status: "active",
      website: "https://real.example",
      actions: { a: { type: "external_url", url: "https://different.example/mint" } },
    };
    const findings = computeTrustScore(token);
    expect(findings.some((f) => f.check === "domain_mismatch" && f.severity === "info")).toBe(true);
  });
});
