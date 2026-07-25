import Ajv from "ajv";
import addFormats from "ajv-formats";

/** Shared ajv factory — used by both the client-side validator (schema-validator.ts) and the CI/local fixture validator (scripts/validate-fixtures.ts), so format handling never drifts between the two. */
export function createAjv(): Ajv {
  const ajv = new Ajv({ allErrors: true, strict: true });
  addFormats(ajv);
  return ajv;
}
