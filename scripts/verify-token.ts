#!/usr/bin/env node
// Author-time verification tool for a single token, before it goes into a
// public/lists/*.json entry. This is NOT a CI gate (see
// scripts/validate-fixtures.ts for that) — it's a contributor aid that
// re-derives the three facts that are easiest to get wrong by hand-copying
// from another list, a block explorer, or an LLM's memory:
//
//   1. decimals — fetched live from the chain, never assumed from another
//      network's contract with the same symbol. Confirmed finding
//      (2026-07-27): Binance-Peg USDT/USDC on BSC report 18 decimals
//      on-chain, not the 6 their Ethereum contracts use — see
//      public/lists/aegis-super-list.json and public/lists/paras.json for
//      two lists that hit this in practice.
//   2. the EIP-55 checksum casing of an EVM address — Trust Wallet's asset
//      CDN (raw.githubusercontent.com/trustwallet/assets) stores folders by
//      checksummed address; a lowercase or wrong-case address 404s silently
//      if you don't check.
//   3. that the resulting Trust Wallet logo URL actually resolves (HTTP
//      200) before you put it in a `logo` field — CONTRIBUTING.md says "a
//      token with no logo falls back to a lettered avatar rather than a
//      blank space — don't invent a fake logo URL just to fill it in", and
//      this script is how you check that before committing, not after.
//
// Usage:
//   npm run verify:token -- --network ETH --address 0xdAC17F958D2ee523a2206206994597C13D831ec7
//   npm run verify:token -- --network BSC --address 0x55d398326f99059fF775485246999027B3197955
//   npm run verify:token -- --network TRON --address TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
//   npm run verify:token -- --network SOLANA --address EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
//
// Network names match public/networks.json's canonical names (case-insensitive).

import { keccak256 } from "js-sha3";

const EVM_RPC: Record<string, string> = {
  ETH: "https://ethereum-rpc.publicnode.com",
  ETHEREUM: "https://ethereum-rpc.publicnode.com",
  BSC: "https://bsc-rpc.publicnode.com",
  POLYGON: "https://polygon-bor-rpc.publicnode.com",
  ARBITRUM: "https://arbitrum-one-rpc.publicnode.com",
  OPTIMISM: "https://optimism-rpc.publicnode.com",
  AVALANCHE: "https://avalanche-c-chain-rpc.publicnode.com",
  BASE: "https://base-rpc.publicnode.com",
};

// Trust Wallet's `blockchains/` folder name, which does not always match
// our network name (BSC's folder is historically "smartchain").
const TRUST_WALLET_FOLDER: Record<string, string> = {
  ETH: "ethereum",
  ETHEREUM: "ethereum",
  BSC: "smartchain",
  POLYGON: "polygon",
  ARBITRUM: "arbitrum",
  OPTIMISM: "optimism",
  AVALANCHE: "avalanchec",
  BASE: "base",
  TRON: "tron",
  SOLANA: "solana",
};

function toChecksumAddress(address: string): string {
  const stripped = address.toLowerCase().replace(/^0x/, "");
  const hash = keccak256(stripped);
  let out = "0x";
  for (let i = 0; i < stripped.length; i++) {
    const c = stripped[i] as string;
    if (/[0-9]/.test(c)) {
      out += c;
      continue;
    }
    out += parseInt(hash[i] as string, 16) >= 8 ? c.toUpperCase() : c;
  }
  return out;
}

async function evmCall(rpc: string, to: string, data: string): Promise<string | null> {
  const res = await fetch(rpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to, data }, "latest"] }),
  });
  const json = (await res.json()) as { result?: string; error?: unknown };
  if (json.error || !json.result || json.result === "0x") return null;
  return json.result;
}

function decodeAbiString(hex: string): string | null {
  try {
    const body = hex.slice(2);
    const len = parseInt(body.slice(64, 128), 16);
    const strHex = body.slice(128, 128 + len * 2);
    return Buffer.from(strHex, "hex").toString("utf8");
  } catch {
    return null;
  }
}

async function checkLogoUrl(url: string): Promise<number> {
  const res = await fetch(url, { method: "GET" });
  return res.status;
}

async function verifyEvm(network: string, address: string): Promise<void> {
  const rpc = EVM_RPC[network];
  if (!rpc) {
    console.error(`No public RPC configured for network "${network}". Add one to EVM_RPC in this script.`);
    process.exitCode = 1;
    return;
  }

  const checksum = toChecksumAddress(address);
  console.log(`Checksum address:  ${checksum}`);

  const decimalsHex = await evmCall(rpc, address, "0x313ce567"); // decimals()
  const decimals = decimalsHex ? parseInt(decimalsHex, 16) : null;
  console.log(`On-chain decimals: ${decimals ?? "COULD NOT READ — is this really a contract on this network?"}`);

  const symbolHex = await evmCall(rpc, address, "0x95d89b41"); // symbol()
  const symbol = symbolHex ? decodeAbiString(symbolHex) : null;
  console.log(`On-chain symbol:   ${symbol ?? "(none / non-standard ABI)"}`);

  const folder = TRUST_WALLET_FOLDER[network] ?? network.toLowerCase();
  const logoUrl = `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/${folder}/assets/${checksum}/logo.png`;
  const status = await checkLogoUrl(logoUrl);
  console.log(`Logo URL:          ${logoUrl}`);
  console.log(`Logo HTTP status:  ${status}${status === 200 ? " (OK, use this URL)" : " (NOT FOUND — do not use, and do not invent a fake logo URL)"}`);
}

async function verifyTron(address: string): Promise<void> {
  const res = await fetch(`https://apilist.tronscanapi.com/api/token_trc20?contract=${address}`);
  const json = (await res.json()) as { trc20_tokens?: Array<{ decimals?: number; name?: string; symbol?: string }> };
  const token = json.trc20_tokens?.[0];
  if (!token) {
    console.error("TronScan returned no token for this contract address.");
    process.exitCode = 1;
    return;
  }
  console.log(`On-chain decimals: ${token.decimals ?? "unknown"}`);
  console.log(`Name / symbol:     ${token.name ?? "?"} / ${token.symbol ?? "?"}`);

  const logoUrl = `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/tron/assets/${address}/logo.png`;
  const status = await checkLogoUrl(logoUrl);
  console.log(`Logo URL:          ${logoUrl}`);
  console.log(`Logo HTTP status:  ${status}${status === 200 ? " (OK, use this URL)" : " (NOT FOUND — do not use, and do not invent a fake logo URL)"}`);
}

async function verifySolana(mint: string): Promise<void> {
  const res = await fetch("https://api.mainnet-beta.solana.com", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getTokenSupply", params: [mint] }),
  });
  const json = (await res.json()) as { result?: { value?: { decimals?: number } }; error?: unknown };
  const decimals = json.result?.value?.decimals;
  if (decimals === undefined) {
    console.error("Solana RPC returned no token supply for this mint — is it really an SPL mint?");
    process.exitCode = 1;
    return;
  }
  console.log(`On-chain decimals: ${decimals}`);

  const logoUrl = `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/assets/${mint}/logo.png`;
  const status = await checkLogoUrl(logoUrl);
  console.log(`Logo URL:          ${logoUrl}`);
  console.log(`Logo HTTP status:  ${status}${status === 200 ? " (OK, use this URL)" : " (NOT FOUND — do not use, and do not invent a fake logo URL)"}`);
}

function parseArgs(argv: string[]): { network: string; address: string } {
  let network: string | undefined;
  let address: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--network") network = argv[++i];
    if (argv[i] === "--address") address = argv[++i];
  }
  if (!network || !address) {
    console.error("Usage: npm run verify:token -- --network <ETH|BSC|POLYGON|...|TRON|SOLANA> --address <address|contract|mint>");
    process.exit(1);
  }
  return { network: network.toUpperCase(), address };
}

const { network, address } = parseArgs(process.argv.slice(2));
console.log(`Verifying ${network} token ${address} ...\n`);

if (network === "TRON") {
  await verifyTron(address);
} else if (network === "SOLANA") {
  await verifySolana(address);
} else {
  await verifyEvm(network, address);
}
