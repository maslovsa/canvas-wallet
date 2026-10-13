import { describe, it, expect } from "vitest";
import {
  isSchemaVersionSupported,
  requiredSchemaVersion,
  declaresAtLeast,
} from "../src/registry-client/schema-version-gate.ts";

describe("isSchemaVersionSupported", () => {
  it("accepts the supported versions", () => {
    expect(isSchemaVersionSupported("1.0.0")).toBe(true);
    expect(isSchemaVersionSupported("1.1.0")).toBe(true);
    expect(isSchemaVersionSupported("1.2.0")).toBe(true);
  });

  it("refuses an unrecognized version rather than guessing", () => {
    expect(isSchemaVersionSupported("1.3.0")).toBe(false);
    expect(isSchemaVersionSupported("2.0.0")).toBe(false);
    expect(isSchemaVersionSupported("")).toBe(false);
  });
});

const registryWith = (actions: Record<string, { type: string }>) => ({
  networks: [{ name: "N", tokens: [{ actions }] }],
});

describe("requiredSchemaVersion", () => {
  it("is 1.0.0 without a send action", () => {
    expect(requiredSchemaVersion(registryWith({ a: { type: "external_url" } }))).toBe("1.0.0");
    expect(requiredSchemaVersion({ networks: [] })).toBe("1.0.0");
    expect(requiredSchemaVersion({})).toBe("1.0.0");
  });

  it("is 1.2.0 when any token uses receive, even next to send", () => {
    expect(requiredSchemaVersion(registryWith({ r: { type: "receive" } }))).toBe("1.2.0");
    expect(requiredSchemaVersion(registryWith({ s: { type: "send" }, r: { type: "receive" } }))).toBe("1.2.0");
  });

  it("is 1.1.0 when any token uses send", () => {
    expect(requiredSchemaVersion(registryWith({ a: { type: "deeplink" }, s: { type: "send" } }))).toBe("1.1.0");
  });
});

describe("declaresAtLeast", () => {
  it("compares numerically, not as strings", () => {
    expect(declaresAtLeast("1.1.0", "1.1.0")).toBe(true);
    expect(declaresAtLeast("1.10.0", "1.2.0")).toBe(true);
    expect(declaresAtLeast("2.0.0", "1.9.9")).toBe(true);
    expect(declaresAtLeast("1.0.0", "1.1.0")).toBe(false);
    expect(declaresAtLeast("0.9.9", "1.0.0")).toBe(false);
  });
});
