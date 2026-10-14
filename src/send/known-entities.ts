// Logos for well-known exchanges, by name. Aegis names the owner of many addresses in `verdict.labels[]` (the
// admin-curated "VASP entity defaults" rows) without filling `verdict.entity`, so there is a name but no logo URL.
// This table maps those names to the files of the entity registry (served by jsDelivr, 160x160 PNG, see entity-logo.ts).
// Only names listed here get a logo; anything else keeps its name with an initial. Shared by the Worker and tests.
const REGISTRY = "https://cdn.jsdelivr.net/gh/maslovsa/kyt-entity-registry@main/logos/exchanges";

// normalized name -> file (without .png) in logos/exchanges/ of the registry (checked against its tree)
const FILES: Record<string, string> = {
  binance: "binance-com",
  okx: "okx-com",
  bybit: "bybit-com",
  bitget: "bitget-com",
  mexc: "mexc-com",
  coinbase: "coinbase-com",
  kraken: "kraken-com",
  kucoin: "kucoin-com",
  gate: "gate-io",
  gateio: "gate-io",
  bitfinex: "bitfinex-com",
  cryptocom: "crypto-com",
  upbit: "upbit-com",
  bithumb: "bithumb-com",
  gemini: "gemini-com",
  bitstamp: "bitstamp-net",
  bingx: "bingx-com",
  htx: "htx-com-huobi-com",
  huobi: "htx-com-huobi-com",
  poloniex: "poloniex-com",
  deribit: "deribit-com",
  bitmex: "bitmex-com",
  whitebit: "whitebit-com",
  bitpanda: "bitpanda-com",
  bitvavo: "bitvavo-com",
  lbank: "lbank-com",
  phemex: "phemex-com",
  coinex: "coinex-com",
  bitmart: "bitmart-com",
  kuna: "kuna-io",
  abcex: "abcex-io",
  rapira: "rapira-net",
};

/** "Crypto.com Exchange" -> "cryptocom": lower case, letters and digits only, a trailing "exchange" dropped. */
export function normalizeEntityName(name: string): string {
  return name.toLowerCase().replace(/\bexchange\b/g, "").replace(/[^a-z0-9]/g, "");
}

export function logoForEntityName(name: string): string | undefined {
  const file = FILES[normalizeEntityName(name)];
  return file ? `${REGISTRY}/${file}.png` : undefined;
}
