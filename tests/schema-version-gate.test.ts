import { describe, it, expect } from "vitest";
import { isSchemaVersionSupported } from "../src/registry-client/schema-version-gate.ts";

describe("isSchemaVersionSupported", () => {
  it("accepts the current supported version", () => {
    expect(isSchemaVersionSupported("1.0.0")).toBe(true);
  });

  it("refuses an unrecognized version rather than guessing", () => {
    expect(isSchemaVersionSupported("2.0.0")).toBe(false);
    expect(isSchemaVersionSupported("")).toBe(false);
  });
});
