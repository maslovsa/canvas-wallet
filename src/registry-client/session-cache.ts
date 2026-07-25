// Caches GitHub API lookups (default_branch, directory listing) per session
// to avoid repeat calls against the unauthenticated 60 req/hr/IP rate limit.
// No PAT-paste option anywhere in this app — CEO review Outside Voice T3:
// a static site asking users to hand it a bearer token contradicts the
// project's own "no ad hoc trust-me mechanisms" thesis. Living with the
// 60/hr ceiling is the correct tradeoff.
const PREFIX = "token-ui-studio:gh-cache:";

interface CacheEntry<T> {
  value: T;
  cachedAt: number;
}

function readCache<T>(key: string): T | undefined {
  try {
    const raw = sessionStorage.getItem(PREFIX + key);
    if (!raw) return undefined;
    const entry = JSON.parse(raw) as CacheEntry<T>;
    return entry.value;
  } catch {
    // Corrupted cache entry — treat as a miss rather than throwing.
    return undefined;
  }
}

function writeCache<T>(key: string, value: T): void {
  try {
    const entry: CacheEntry<T> = { value, cachedAt: Date.now() };
    sessionStorage.setItem(PREFIX + key, JSON.stringify(entry));
  } catch {
    // sessionStorage full or unavailable (private browsing) — caching is an
    // optimization, not a requirement; silently skip.
  }
}

export interface DefaultBranchInfo {
  defaultBranch: string;
}

export async function getDefaultBranchCached(
  owner: string,
  repo: string,
  fetchImpl: typeof fetch = fetch,
): Promise<DefaultBranchInfo> {
  const cacheKey = `default-branch:${owner}/${repo}`;
  const cached = readCache<DefaultBranchInfo>(cacheKey);
  if (cached) return cached;

  const res = await fetchImpl(`https://api.github.com/repos/${owner}/${repo}`);
  if (res.status === 403 || res.status === 429) {
    throw new RateLimitSignal();
  }
  if (res.status === 404) {
    throw new NotFoundSignal();
  }
  if (!res.ok) {
    throw new NetworkSignal();
  }
  const json = (await res.json()) as { default_branch?: string };
  if (!json.default_branch) {
    throw new NetworkSignal();
  }
  const info: DefaultBranchInfo = { defaultBranch: json.default_branch };
  writeCache(cacheKey, info);
  return info;
}

// Lightweight signal classes so fetcher.ts can map them to the single
// RegistryClientError with the right code, without importing errors.ts here
// (keeps this module dependency-free and independently testable).
export class RateLimitSignal extends Error {}
export class NotFoundSignal extends Error {}
export class NetworkSignal extends Error {}
