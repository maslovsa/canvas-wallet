import type { Registry, Token } from "../types.ts";

// Bundled default registry + presets. Must work with zero GitHub API calls
// so a GitHub outage/rate-limit never bricks the tool — CEO review
// Section 1 finding (offline/degraded-mode fallback).
//
// v1 template gallery ships with a small fixed set of hand-authored
// templates (not an open-ended import) — CEO review item 5 detail.
//
// Real tokens below (ETH, WETH, TWT) use verified mainnet addresses and
// logos from the Trust Wallet assets repo (already domain-allowlisted).
// Fictional demo tokens (USDY, RWAB, MEME, LP-USDY-ETH) intentionally have
// no `logo` — there's no real logo to link to, and inventing one would be
// exactly the kind of unverifiable claim this project's trust-score panel
// exists to flag. A missing logo falls back to a lettered avatar in the UI.

const nativeEth: Token = {
  name: "Ethereum",
  symbol: "ETH",
  type: "NATIVE",
  id: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
  decimals: 18,
  logo: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png",
  website: "https://ethereum.org",
  description: "The native asset of the Ethereum network.",
  status: "active",
  tags: ["native"],
  explorer: "https://etherscan.io",
  ui: {
    theme: { primaryColor: "#627EEA", badgeText: "Native" },
    background: { type: "gradient", colors: ["#0B0E11", "#1C2440"], angle: 135 },
  },
  widgets: [{ type: "history" }],
};

const wrappedEth: Token = {
  name: "Wrapped Ether",
  symbol: "WETH",
  type: "ERC20",
  id: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  decimals: 18,
  logo: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png",
  website: "https://weth.io",
  description: "ERC-20 wrapper for native ETH — 1 WETH is always redeemable for 1 ETH.",
  status: "active",
  tags: ["wrapped"],
  explorer: "https://etherscan.io/token/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  ui: {
    theme: { primaryColor: "#627EEA", badgeText: "Wrapped 1:1" },
    background: { type: "gradient", colors: ["#0B0E11", "#1C2440"], angle: 135 },
  },
  widgets: [{ type: "history" }],
};

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
    { type: "history" },
  ],
};

const twtGovernance: Token = {
  name: "Trust Wallet",
  symbol: "TWT",
  type: "BEP20",
  id: "0x4B0F1812e5Df2A09796481Ff14017e6005508003",
  decimals: 18,
  logo: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/smartchain/assets/0x4B0F1812e5Df2A09796481Ff14017e6005508003/logo.png",
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
    { type: "history" },
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
    { type: "history" },
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
  widgets: [{ type: "notice", message: "No intrinsic value. DYOR.", severity: "warning" }, { type: "history" }],
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
    { type: "history" },
  ],
};

const tronNative: Token = {
  name: "TRON",
  symbol: "TRX",
  type: "NATIVE",
  id: "native",
  decimals: 6,
  logo: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/tron/info/logo.png",
  website: "https://tron.network",
  description: "The native asset of the Tron network. Demonstrates an image-type background (domain-allowlisted, same as token logos) and the price_chart widget (live CoinGecko data, no API key).",
  status: "active",
  tags: ["native"],
  explorer: "https://tronscan.org",
  ui: {
    theme: { primaryColor: "#FF060A", badgeText: "Native" },
    background: {
      type: "image",
      url: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/tron/info/logo.png",
      overlayColor: "#1A0000",
    },
  },
  widgets: [{ type: "price_chart", coingeckoId: "tron", days: 1 }, { type: "history" }],
};

/** The 3 named v1 presets shown by default. */
export const NAMED_PRESETS: readonly Token[] = [usdtYield, twtGovernance, rwaBond];

/**
 * Additional hand-authored starter templates for "+ Add / Create token"
 * within a list (per-token starting points) — a different concept from the
 * list-level Gallery (public/lists/manifest.json), which picks a whole
 * list to view, not a single token template.
 */
export const STARTER_TEMPLATES: readonly Token[] = [memeCoin, lpToken];

/** id of the bundled list this file backs — matches public/lists/trust-wallet-showcase.json and its manifest entry. */
export const DEFAULT_LIST_ID = "trust-wallet-showcase";

/** In-memory fallback for DEFAULT_LIST_ID — works fully offline, no GitHub API calls, used only if the same-origin fetch of that one list ever fails. */
export const DEFAULT_REGISTRY: Registry = {
  schemaVersion: "1.0.0",
  networks: [
    { name: "Ethereum", tokens: [nativeEth, wrappedEth, usdtYield, rwaBond, memeCoin, lpToken] },
    { name: "BSC", tokens: [twtGovernance] },
    { name: "Tron", tokens: [tronNative] },
  ],
};
