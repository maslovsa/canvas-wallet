// A registry the Studio points at (default or any multi-registry target)
// must declare a schemaVersion the Studio recognizes. Refuses to guess
// compatibility for an unrecognized version — CEO review item 2 detail.
const SUPPORTED_SCHEMA_VERSIONS = new Set(["1.0.0"]);

export function isSchemaVersionSupported(schemaVersion: string): boolean {
  return SUPPORTED_SCHEMA_VERSIONS.has(schemaVersion);
}
