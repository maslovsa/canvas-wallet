import type { ValidateFunction } from "ajv";
import schema from "../registry.schema.json" with { type: "json" };
import type { Registry, Token } from "./types.ts";
import { createAjv } from "./schema/create-validator.ts";

// Single canonical schema source (registry.schema.json) consumed here for the
// client-side validator AND by scripts/validate-fixtures.ts (shared by CI) —
// see CEO plan Section 5 finding: never two independently maintained copies
// of the validation rules.
const ajv = createAjv();
const validateRegistry: ValidateFunction<Registry> = ajv.compile(schema);

// A second compiled validator for standalone Token objects (e.g. a
// share-link payload, or a single-token editor buffer) — reuses the same
// schema's `definitions`, entered at #/definitions/token instead of the
// registry root. Deliberately omits the root schema's own `required`/
// `properties`/`additionalProperties` (a naive spread + `$ref` override
// left those root-level constraints active alongside $ref, so ajv still
// demanded `schemaVersion`/`networks` on a bare token — this shape avoids
// that ambiguity by never including them in the first place). Needs its
// own $id (distinct from the registry schema's) since both are compiled
// on the same ajv instance, and is compiled once at module load, not per
// call — recompiling on every parseToken() call previously threw "schema
// with key or id already exists".
const schemaObj = schema as { $id: string; $schema: string; definitions: unknown };
const tokenSchema = {
  $id: `${schemaObj.$id}#token-standalone`,
  $schema: schemaObj.$schema,
  definitions: schemaObj.definitions,
  $ref: "#/definitions/token",
};
const validateToken: ValidateFunction<Token> = ajv.compile(tokenSchema);

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateRegistryJson(data: unknown): ValidationResult {
  const valid = validateRegistry(data);
  if (valid) return { valid: true, errors: [] };
  const errors = (validateRegistry.errors ?? []).map(
    (e) => `${e.instancePath || "(root)"} ${e.message ?? "invalid"}`,
  );
  return { valid: false, errors };
}

/**
 * Parse + runtime-validate untrusted JSON text before ever treating it as a
 * typed Registry. No `as Registry` cast on unvalidated external data —
 * CEO review Section 5 finding.
 */
export function parseRegistry(jsonText: string): Registry {
  let data: unknown;
  try {
    data = JSON.parse(jsonText);
  } catch {
    throw new RegistryParseError("Registry JSON is not valid JSON syntax.");
  }
  const result = validateRegistryJson(data);
  if (!result.valid) {
    throw new RegistrySchemaError(result.errors);
  }
  // Safe: validateRegistryJson used the ajv-compiled schema above to confirm
  // `data` actually matches the Registry shape at runtime.
  return data as Registry;
}

export function parseToken(jsonText: string): Token {
  let data: unknown;
  try {
    data = JSON.parse(jsonText);
  } catch {
    throw new RegistryParseError("Token config is not valid JSON syntax.");
  }
  const valid = validateToken(data);
  if (!valid) {
    const errors = (validateToken.errors ?? []).map(
      (e) => `${e.instancePath || "(root)"} ${e.message ?? "invalid"}`,
    );
    throw new RegistrySchemaError(errors);
  }
  return data as Token;
}

export class RegistryParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RegistryParseError";
  }
}

export class RegistrySchemaError extends Error {
  readonly issues: string[];
  constructor(issues: string[]) {
    super(`Registry failed schema validation: ${issues.join("; ")}`);
    this.name = "RegistrySchemaError";
    this.issues = issues;
  }
}
