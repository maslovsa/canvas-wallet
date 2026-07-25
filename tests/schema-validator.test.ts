import { describe, it, expect } from "vitest";
import { parseRegistry, parseToken, RegistryParseError, RegistrySchemaError } from "../src/schema-validator.ts";
import { DEFAULT_REGISTRY } from "../src/presets/presets.ts";

describe("parseRegistry", () => {
  it("parses a valid registry", () => {
    const json = JSON.stringify(DEFAULT_REGISTRY);
    const registry = parseRegistry(json);
    expect(registry.schemaVersion).toBe("1.0.0");
    expect(registry.networks.length).toBeGreaterThan(0);
  });

  it("throws RegistryParseError on malformed JSON syntax", () => {
    expect(() => parseRegistry("{ not json")).toThrow(RegistryParseError);
  });

  it("throws RegistrySchemaError on schema violations", () => {
    expect(() => parseRegistry(JSON.stringify({ schemaVersion: "1.0.0" }))).toThrow(RegistrySchemaError);
  });

  it("rejects a non-semver-shaped schemaVersion at the schema level", () => {
    expect(() => parseRegistry(JSON.stringify({ schemaVersion: "not-a-version", networks: [] }))).toThrow(
      RegistrySchemaError,
    );
  });

  it("accepts a well-formed but unrecognized-by-this-build schemaVersion at the schema level (app-level gate handles support, not the schema)", () => {
    // schemaVersion is intentionally NOT locked to a fixed enum in the schema
    // itself (see registry.schema.json) — the CLIENT decides whether it
    // recognizes a version, via schema-version-gate.ts. See fetcher.test.ts
    // for the app-level "refuse to render an unsupported version" behavior.
    const registry = parseRegistry(JSON.stringify({ schemaVersion: "9.9.9", networks: [] }));
    expect(registry.schemaVersion).toBe("9.9.9");
  });
});

describe("parseToken", () => {
  it("parses a valid token", () => {
    const token = parseToken(
      JSON.stringify({
        name: "T",
        symbol: "T",
        type: "ERC20",
        id: "0x1",
        decimals: 18,
        status: "active",
      }),
    );
    expect(token.symbol).toBe("T");
  });

  it("rejects an unknown widget.type", () => {
    expect(() =>
      parseToken(
        JSON.stringify({
          name: "T",
          symbol: "T",
          type: "ERC20",
          id: "0x1",
          decimals: 18,
          status: "active",
          widgets: [{ type: "not_a_real_widget" }],
        }),
      ),
    ).toThrow(RegistrySchemaError);
  });

  it("rejects an unknown action.type", () => {
    expect(() =>
      parseToken(
        JSON.stringify({
          name: "T",
          symbol: "T",
          type: "ERC20",
          id: "0x1",
          decimals: 18,
          status: "active",
          actions: { evil: { type: "execute_arbitrary_code" } },
        }),
      ),
    ).toThrow(RegistrySchemaError);
  });
});
