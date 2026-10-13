// Demo receive addresses for the phone's Receive dialog, loaded from public/receive-addresses.json
// (keyed by the network's canonical name). They are random stubs with no private key behind them: the
// dialog says so. A static site cannot read .env, so the file is the published copy of STUB_ETH /
// STUB_TRON; BNB Smart Chain reuses the EVM stub because an EVM address is the same on every EVM chain.
export interface ReceiveAddresses {
  networks: Record<string, string>;
}

export const REFUSAL_NO_RECEIVE_ADDRESS = "Receive is not available for this network yet";

let cached: Record<string, string> | null = null;

export async function loadReceiveAddresses(fetchImpl: typeof fetch = fetch): Promise<Record<string, string>> {
  if (cached) return cached;
  try {
    const res = await fetchImpl(`${import.meta.env.BASE_URL}receive-addresses.json`);
    if (!res.ok) return {};
    const data = (await res.json()) as Partial<ReceiveAddresses>;
    const networks = data.networks;
    if (!networks || typeof networks !== "object") return {};
    const clean: Record<string, string> = {};
    for (const [name, address] of Object.entries(networks)) {
      if (typeof address === "string" && address.length > 0) clean[name] = address;
    }
    cached = clean;
    return clean;
  } catch {
    return {};
  }
}

/** Exact (case-insensitive) match on the network's canonical name; undefined means "no stub for this network". */
export function receiveAddressFor(
  addresses: Readonly<Record<string, string>>,
  networkCanonicalName: string | undefined,
): string | undefined {
  if (!networkCanonicalName) return undefined;
  const wanted = networkCanonicalName.trim().toLowerCase();
  const key = Object.keys(addresses).find((k) => k.toLowerCase() === wanted);
  return key ? addresses[key] : undefined;
}
