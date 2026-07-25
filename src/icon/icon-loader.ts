import { isIconDomainAllowed } from "./domain-allowlist.ts";

// External icon URLs: rejected domain, 404/timeout, or oversized all fall
// back to the same degraded path — a generic placeholder glyph, never a
// broken image in a live wallet-style card (CEO review Section 2 finding).
const MAX_ICON_BYTES = 100 * 1024; // 100KB — a generous ceiling for a small card icon.
const cache = new Map<string, Promise<string | null>>();

export async function loadIcon(url: string, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  const cached = cache.get(url);
  if (cached) return cached;

  const promise = loadIconUncached(url, fetchImpl);
  cache.set(url, promise);
  return promise;
}

async function loadIconUncached(url: string, fetchImpl: typeof fetch): Promise<string | null> {
  if (!isIconDomainAllowed(url)) {
    console.warn(`[icon-loader] Icon domain not in allowlist, falling back to placeholder: ${url}`);
    return null;
  }
  try {
    const res = await fetchImpl(url);
    if (!res.ok) {
      console.warn(`[icon-loader] Icon fetch failed (${res.status}), falling back to placeholder: ${url}`);
      return null;
    }
    const contentLength = res.headers.get("content-length");
    if (contentLength && Number(contentLength) > MAX_ICON_BYTES) {
      console.warn(`[icon-loader] Icon exceeds ${MAX_ICON_BYTES} bytes, falling back to placeholder: ${url}`);
      return null;
    }
    const blob = await res.blob();
    if (blob.size > MAX_ICON_BYTES) {
      console.warn(`[icon-loader] Icon body exceeds ${MAX_ICON_BYTES} bytes, falling back to placeholder: ${url}`);
      return null;
    }
    return URL.createObjectURL(blob);
  } catch (err) {
    console.warn(`[icon-loader] Icon load error, falling back to placeholder: ${url}`, err);
    return null;
  }
}
