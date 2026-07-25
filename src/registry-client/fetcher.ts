import type { Registry, RegistrySource } from "../types.ts";
import { parseRegistry, RegistryParseError, RegistrySchemaError } from "../schema-validator.ts";
import { getDefaultBranchCached, RateLimitSignal, NotFoundSignal, NetworkSignal } from "./session-cache.ts";
import { isSchemaVersionSupported } from "./schema-version-gate.ts";
import { RegistryClientError } from "./errors.ts";
import { DEFAULT_REGISTRY } from "../presets/presets.ts";

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
 * The default source loads `registry.json` — the repo's own real,
 * PR-editable registry (see CONTRIBUTING.md) — from the SAME origin the
 * app itself was served from (bundled under `public/`, not fetched from
 * GitHub's API). That still satisfies the CEO review's offline/
 * degraded-mode requirement: it never depends on api.github.com or
 * raw.githubusercontent.com, so it's immune to GitHub rate limits/outages —
 * only a fully broken deploy would affect it, and even then this falls back
 * to the in-memory DEFAULT_REGISTRY constant so the Studio never shows a
 * blank app.
 *
 * Any other (multi-registry) source goes through GitHub's contents API
 * with cached default_branch lookups (CEO review item 2 detail).
 */
export async function fetchRegistry(
  source: RegistrySource,
  fetchImpl: typeof fetch = fetch,
): Promise<FetchRegistryResult> {
  if (source.isDefault) {
    try {
      const base = import.meta.env.BASE_URL;
      const res = await fetchImpl(`${base}registry.json`);
      if (!res.ok) throw new NetworkSignal();
      const registry = parseAndCheckVersion(await res.text());
      return { registry, source };
    } catch {
      // Same-origin fetch failed (broken deploy, offline dev server edge
      // case) or the published registry.json is malformed — fall back to
      // the bundled in-memory presets rather than show a blank app.
      return { registry: DEFAULT_REGISTRY, source };
    }
  }

  let registryJsonText: string;
  try {
    const { defaultBranch } = await getDefaultBranchCached(source.owner, source.repo, fetchImpl);
    const rawUrl = `https://raw.githubusercontent.com/${source.owner}/${source.repo}/${defaultBranch}/registry.json`;
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
      throw new RegistryClientError("not_found", `No registry.json found at ${source.owner}/${source.repo}.`);
    }
    if (err instanceof NetworkSignal || err instanceof TypeError) {
      throw new RegistryClientError("network_error", "Network request to the registry failed.");
    }
    throw err;
  }

  return { registry: parseAndCheckVersion(registryJsonText), source };
}
