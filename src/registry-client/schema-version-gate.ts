// A registry the Studio points at (default or any multi-registry target)
// must declare a schemaVersion the Studio recognizes. Refuses to guess
// compatibility for an unrecognized version — CEO review item 2 detail.
// 1.1.0 adds the `send` action (plan decision D11); 1.0.0 registries stay valid.
const SUPPORTED_SCHEMA_VERSIONS = new Set(["1.0.0", "1.1.0"]);

export function isSchemaVersionSupported(schemaVersion: string): boolean {
  return SUPPORTED_SCHEMA_VERSIONS.has(schemaVersion);
}

/** Oldest schemaVersion that can express everything in this registry: 1.1.0 if any token uses a `send` action, else 1.0.0. */
export function requiredSchemaVersion(registry: unknown): "1.0.0" | "1.1.0" {
  const networks = (registry as { networks?: Array<{ tokens?: Array<{ actions?: Record<string, { type?: unknown }> }> }> })
    .networks;
  for (const network of networks ?? []) {
    for (const token of network.tokens ?? []) {
      for (const action of Object.values(token.actions ?? {})) {
        if (action?.type === "send") return "1.1.0";
      }
    }
  }
  return "1.0.0";
}

/** True when `declared` (a semver-shaped string) is at least `required`. Compares major, minor, patch numerically. */
export function declaresAtLeast(declared: string, required: string): boolean {
  const parse = (v: string): number[] => v.split(".").map((n) => Number.parseInt(n, 10));
  const d = parse(declared);
  const r = parse(required);
  for (let i = 0; i < 3; i += 1) {
    if ((d[i] ?? 0) > (r[i] ?? 0)) return true;
    if ((d[i] ?? 0) < (r[i] ?? 0)) return false;
  }
  return true;
}
