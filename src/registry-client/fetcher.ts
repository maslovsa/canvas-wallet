import type { Registry, RegistrySource } from "../types.ts";
import { parseRegistry, RegistryParseError, RegistrySchemaError } from "../schema-validator.ts";
import { getDefaultBranchCached, RateLimitSignal, NotFoundSignal, NetworkSignal } from "./session-cache.ts";
import { isSchemaVersionSupported } from "./schema-version-gate.ts";
import { RegistryClientError } from "./errors.ts";
import { DEFAULT_REGISTRY, DEFAULT_LIST_ID } from "../presets/presets.ts";

export interface FetchRegistryResult {
  registry: Registry;
  source: RegistrySource;
}

function parseAndCheckVersion(registryJsonText: string): Registry {
  let registry: Registry;
  try {
    registry = parseRegistry(registryJsonText);
  } catch (err) {
    if (err instanceof RegistryParseError || err instanceof RegistrySchemaError) {
      throw new RegistryClientError("parse_error", err.message);
    }
    throw err;
  }
  if (!isSchemaVersionSupported(registry.schemaVersion)) {
    throw new RegistryClientError(
      "schema_version_unrecognized",
      `Registry schemaVersion "${registry.schemaVersion}" is not supported by this Studio build.`,
    );
  }
  return registry;
}

/**
 * Fetch a registry from `source`.
 *
 * "bundled" loads `lists/{listId}.json` — one of the Gallery's built-in
 * lists (see public/lists/manifest.json) — from the SAME origin the app
 * itself was served from, not fetched from GitHub's API. That satisfies the
 * CEO review's offline/degraded-mode requirement: it never depends on
 * api.github.com or raw.githubusercontent.com, so it's immune to GitHub
 * rate limits/outages. For the default list specifically (DEFAULT_LIST_ID)
 * a broken fetch falls back to the in-memory DEFAULT_REGISTRY constant so
 * the Studio never shows a fully blank app even on a broken deploy.
 *
 * "github" goes through GitHub's contents API with cached default_branch
 * lookups (CEO review item 2 detail) — this is the multi-registry client,
 * a distinct feature from the bundled Gallery lists.
 *
 * "uploaded" sources never reach this function — main.ts reads and
 * validates the local file directly via parseRegistry(), since there's
 * nothing to fetch.
 */
export async function fetchRegistry(
  source: RegistrySource,
  fetchImpl: typeof fetch = fetch,
): Promise<FetchRegistryResult> {
  if (source.kind === "bundled") {
    try {
      const base = import.meta.env.BASE_URL;
      const res = await fetchImpl(`${base}lists/${source.listId}.json`);
      if (!res.ok) throw new NetworkSignal();
      const registry = parseAndCheckVersion(await res.text());
      return { registry, source };
    } catch {
      // Same-origin fetch failed (broken deploy, offline dev server edge
      // case) or the published list is malformed. Only the default list has
      // an in-memory fallback — an arbitrary bundled list with no fallback
      // data re-throws so the UI can show a real error instead of secretly
      // swapping in unrelated tokens.
      if (source.listId === DEFAULT_LIST_ID) {
        return { registry: DEFAULT_REGISTRY, source };
      }
      throw new RegistryClientError("not_found", `Could not load the "${source.listId}" list.`);
    }
  }

  if (source.kind !== "github") {
    // "uploaded" sources are never expected here — main.ts reads and
    // validates those directly via parseRegistry(), with no fetch at all.
    throw new RegistryClientError("not_found", "Uploaded sources cannot be re-fetched.");
  }
  const { owner, repo } = source;
  let registryJsonText: string;
  try {
    const { defaultBranch } = await getDefaultBranchCached(owner, repo, fetchImpl);
    const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${defaultBranch}/registry.json`;
    const res = await fetchImpl(rawUrl);
    if (res.status === 404) throw new NotFoundSignal();
    if (res.status === 403 || res.status === 429) throw new RateLimitSignal();
    if (!res.ok) throw new NetworkSignal();
    registryJsonText = await res.text();
  } catch (err) {
    if (err instanceof RateLimitSignal) {
      throw new RegistryClientError("rate_limited", "Rate-limited by GitHub while fetching the registry.");
    }
    if (err instanceof NotFoundSignal) {
      throw new RegistryClientError("not_found", `No registry.json found at ${owner}/${repo}.`);
    }
    if (err instanceof NetworkSignal || err instanceof TypeError) {
      throw new RegistryClientError("network_error", "Network request to the registry failed.");
    }
    throw err;
  }

  return { registry: parseAndCheckVersion(registryJsonText), source };
}
