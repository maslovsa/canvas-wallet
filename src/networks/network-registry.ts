// Network branding lookup (name -> logo), loaded from public/networks.json —
// deliberately separate from registry.schema.json: this is presentation
// metadata, not part of the token-registry data model. Synonym matching
// means a registry that calls a network "BSC" and one that calls it
// "Binance Smart Chain" both resolve to the same logo.
export interface NetworkInfo {
  canonicalName: string;
  synonyms: string[];
  logo: string;
}

interface NetworksFile {
  networks: NetworkInfo[];
}

let cached: NetworkInfo[] | null = null;

export async function loadNetworkRegistry(fetchImpl: typeof fetch = fetch): Promise<NetworkInfo[]> {
  if (cached) return cached;
  try {
    const base = import.meta.env.BASE_URL;
    const res = await fetchImpl(`${base}networks.json`);
    if (!res.ok) return [];
    const data = (await res.json()) as NetworksFile;
    cached = Array.isArray(data.networks) ? data.networks : [];
    return cached;
  } catch {
    return [];
  }
}

/** Case-insensitive match against canonicalName or any synonym. Returns undefined if unrecognized — never guesses. */
export function findNetworkInfo(networks: readonly NetworkInfo[], name: string): NetworkInfo | undefined {
  const needle = name.trim().toLowerCase();
  return networks.find(
    (n) => n.canonicalName.toLowerCase() === needle || n.synonyms.some((s) => s.toLowerCase() === needle),
  );
}
