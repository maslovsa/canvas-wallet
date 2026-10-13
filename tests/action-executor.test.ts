import { describe, it, expect } from "vitest";
import { resolveAction, demoAlertMessage } from "../src/widgets/action-executor.ts";
import type { Token } from "../src/types.ts";

const token: Token = {
  name: "T",
  symbol: "TWT",
  type: "ERC20",
  id: "0xABC",
  decimals: 18,
  status: "active",
  actions: {
    mint: { type: "external_url", url: "https://app.example.com/mint?token={symbol}&id={id}", openIn: "in_app_browser" },
    move: { type: "deeplink", url: "wallet://swap?from={symbol}" },
    stake: { type: "wallet_connect", dappUrl: "https://stake.example.com" },
  },
};

describe("resolveAction", () => {
  it("substitutes {symbol} and {id}, URL-encoding each value", () => {
    const result = resolveAction("mint", token, undefined);
    expect(result?.targetUrl).toBe("https://app.example.com/mint?token=TWT&id=0xABC");
    expect(result?.requiresInterstitial).toBe(true);
  });

  it("URL-encodes special characters in substituted values (injection prevention)", () => {
    const evil: Token = { ...token, symbol: "TW&T=x" };
    const result = resolveAction("mint", evil, undefined);
    expect(result?.targetUrl).toContain(encodeURIComponent("TW&T=x"));
    expect(result?.targetUrl).not.toContain("TW&T=x&id"); // raw unencoded value never appears mid-query
  });

  it("deeplink actions do not require an interstitial", () => {
    const result = resolveAction("move", token, undefined);
    expect(result?.requiresInterstitial).toBe(false);
  });

  it("wallet_connect resolves to dappUrl with an interstitial", () => {
    const result = resolveAction("stake", token, undefined);
    expect(result?.targetUrl).toBe("https://stake.example.com");
    expect(result?.requiresInterstitial).toBe(true);
  });

  it("returns null for an unknown action key (never throws)", () => {
    expect(resolveAction("does_not_exist", token, undefined)).toBeNull();
  });
});

// Characterization (plan E10): the exact shape every existing action type resolves to. Written
// before the `send` action changes ActionResult, so any accidental change to these results fails.
describe("resolveAction result shape (existing action types)", () => {
  it("external_url", () => {
    expect(resolveAction("mint", token, undefined)).toEqual({
      type: "external_url",
      targetUrl: "https://app.example.com/mint?token=TWT&id=0xABC",
      requiresInterstitial: true,
    });
  });

  it("deeplink", () => {
    expect(resolveAction("move", token, undefined)).toEqual({
      type: "deeplink",
      targetUrl: "wallet://swap?from=TWT",
      requiresInterstitial: false,
    });
  });

  it("wallet_connect", () => {
    expect(resolveAction("stake", token, undefined)).toEqual({
      type: "wallet_connect",
      targetUrl: "https://stake.example.com",
      requiresInterstitial: true,
    });
  });
});

describe("demoAlertMessage", () => {
  it("includes the interstitial warning only when required", () => {
    const result = resolveAction("mint", token, undefined)!;
    const message = demoAlertMessage(result, token);
    expect(message).toContain("third-party dApp");
    expect(message).toContain("Simulated");
  });

  it("exact message text for an external_url action", () => {
    const result = resolveAction("mint", token, undefined)!;
    expect(demoAlertMessage(result, token)).toBe(
      "Action: external_url\nTarget: https://app.example.com/mint?token=TWT&id=0xABC" +
        "\n\nYou're leaving to a third-party dApp for TWT. (Simulated — no real navigation occurs.)",
    );
  });

  it("omits the interstitial warning for deeplinks", () => {
    const result = resolveAction("move", token, undefined)!;
    const message = demoAlertMessage(result, token);
    expect(message).not.toContain("third-party dApp");
  });
});
