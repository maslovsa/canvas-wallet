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

/**
 * Fetch a registry from `source`. The default/bundled registry never touches
 * the network (CEO review Section 1: offline/degraded-mode fallback). Any
 * other source goes through GitHub's contents API with cached
 * default_branch lookups (CEO review item 2 detail).
 */
export async function fetchRegistry(
  source: RegistrySource,
  fetchImpl: typeof fetch = fetch,
): Promise<FetchRegistryResult> {
  if (source.isDefault) {
    return { registry: DEFAULT_REGISTRY, source };
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

  let registry: Registry;
  try {
    registry = parseRegistry(registryJsonText);
  } catch (err) {
    if (err instanceof RegistryParseError) {
      throw new RegistryClientError("parse_error", err.message);
    }
    if (err instanceof RegistrySchemaError) {
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

  return { registry, source };
}
