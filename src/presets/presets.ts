import type { Registry, Token } from "../types.ts";

// Bundled default registry + presets. Must work with zero GitHub API calls
// so a GitHub outage/rate-limit never bricks the tool — CEO review
// Section 1 finding (offline/degraded-mode fallback).
//
// v1 template gallery ships with a small fixed set of hand-authored
// templates (not an open-ended import) — CEO review item 5 detail.

const usdtYield: Token = {
  name: "USDT Yield",
  symbol: "USDY",
  type: "ERC20",
  id: "0x0000000000000000000000000000000000dEaD",
  decimals: 6,
  website: "https://example.com/usdy",
  description: "Yield-bearing stablecoin wrapper with native mint/redeem.",
  status: "active",
  tags: ["stablecoin", "yield"],
  links: [{ name: "docs", url: "https://example.com/usdy/docs" }],
  explorer: "https://etherscan.io/token/0x0000000000000000000000000000000000dEaD",
  ui: {
    theme: { primaryColor: "#26A17B", badgeText: "1:1 Backed" },
    background: { type: "gradient", colors: ["#0B0E11", "#134E3A"], angle: 135 },
  },
  actions: {
    mint_dapp: {
      type: "external_url",
      url: "https://app.example.com/mint?token={symbol}",
      openIn: "in_app_browser",
    },
  },
  widgets: [
    {
      type: "banner",
      title: "Mint & Redeem",
      description: "Mint natively at 0% fee directly via protocol",
      action: "mint_dapp",
    },
    {
      type: "key_value",
      title: "Protocol Metrics",
      items: [{ label: "Collateral Ratio", value: "150%" }],
    },
  ],
};

const twtGovernance: Token = {
  name: "Trust Wallet",
  symbol: "TWT",
  type: "BEP20",
  id: "0x4B0F1812e5Df2A09796481Ff14017e6005508003",
  decimals: 18,
  website: "https://trustwallet.com",
  description: "Utility token to increase adoption of cryptocurrency.",
  status: "active",
  tags: ["governance"],
  links: [
    { name: "github", url: "https://github.com/trustwallet/" },
    { name: "x", url: "https://x.com/TrustWalletApp" },
  ],
  explorer: "https://bscscan.com/token/0x4B0F1812e5Df2A09796481Ff14017e6005508003",
  ui: {
    theme: { primaryColor: "#3375BB", badgeText: "Governance" },
    background: { type: "gradient", colors: ["#0B0E11", "#1E2329"], angle: 135 },
  },
  actions: {
    stake_action: { type: "wallet_connect", dappUrl: "https://stake.example.com" },
  },
  widgets: [
    {
      type: "action_group",
      title: "Protocol Actions",
      items: [{ label: "Stake Yield (5% APY)", action: "stake_action" }],
    },
  ],
};

const rwaBond: Token = {
  name: "RWA Bond",
  symbol: "RWAB",
  type: "ERC20",
  id: "0x1111111111111111111111111111111111bEEF",
  decimals: 18,
  website: "https://example.com/rwa-bond",
  description: "Tokenized real-world-asset bond with redemption window.",
  status: "active",
  tags: ["rwa"],
  explorer: "https://etherscan.io/token/0x1111111111111111111111111111111111bEEF",
  ui: {
    theme: { primaryColor: "#8B6F3E", badgeText: "RWA" },
    background: { type: "solid", colors: ["#1A140D"] },
  },
  actions: {
    redeem_dapp: {
      type: "external_url",
      url: "https://app.example.com/redeem?token={symbol}",
      openIn: "in_app_browser",
    },
  },
  widgets: [
    {
      type: "notice",
      message: "Redemption window opens quarterly.",
      severity: "info",
    },
    {
      type: "banner",
      title: "Redeem",
      description: "Redeem your bond at maturity",
      action: "redeem_dapp",
    },
  ],
};

const memeCoin: Token = {
  name: "Sample Meme Coin",
  symbol: "MEME",
  type: "ERC20",
  id: "0x2222222222222222222222222222222222BEEF",
  decimals: 18,
  status: "active",
  tags: ["meme"],
  ui: {
    theme: { primaryColor: "#FF6B6B", badgeText: "Community" },
    background: { type: "gradient", colors: ["#2D0A0A", "#5C1A1A"], angle: 45 },
  },
  widgets: [{ type: "notice", message: "No intrinsic value. DYOR.", severity: "warning" }],
};

const lpToken: Token = {
  name: "Sample LP Token",
  symbol: "LP-USDY-ETH",
  type: "ERC20",
  id: "0x3333333333333333333333333333333333BEEF",
  decimals: 18,
  status: "active",
  tags: ["lp"],
  ui: {
    theme: { primaryColor: "#6E56CF", badgeText: "LP" },
    background: { type: "solid", colors: ["#120E1D"] },
  },
  widgets: [
    { type: "key_value", title: "Pool", items: [{ label: "APY", value: "4.5%" }] },
  ],
};

/** The 3 named v1 presets shown by default. */
export const NAMED_PRESETS: readonly Token[] = [usdtYield, twtGovernance, rwaBond];

/** Additional hand-authored templates for the gallery beyond the 3 named presets. */
export const GALLERY_TEMPLATES: readonly Token[] = [memeCoin, lpToken];

/** Bundled default registry — works fully offline, no GitHub API calls. */
export const DEFAULT_REGISTRY: Registry = {
  schemaVersion: "1.0.0",
  networks: [
    { name: "Ethereum", tokens: [usdtYield, rwaBond, memeCoin, lpToken] },
    { name: "BSC", tokens: [twtGovernance] },
  ],
};
