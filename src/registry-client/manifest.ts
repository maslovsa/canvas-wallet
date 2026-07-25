import type { ListMeta } from "../types.ts";

interface ManifestFile {
  lists: ListMeta[];
}

/** Loads the Gallery's list-of-lists index. Empty array (never throws) on failure — the Gallery just shows no cards plus the always-available upload option. */
export async function loadManifest(fetchImpl: typeof fetch = fetch): Promise<ListMeta[]> {
  try {
    const base = import.meta.env.BASE_URL;
    const res = await fetchImpl(`${base}lists/manifest.json`);
    if (!res.ok) return [];
    const data = (await res.json()) as ManifestFile;
    return Array.isArray(data.lists) ? data.lists : [];
  } catch {
    return [];
  }
}
