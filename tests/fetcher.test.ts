import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchRegistry } from "../src/registry-client/fetcher.ts";
import type { RegistrySource } from "../src/types.ts";

// Integration test for the fetch -> validate -> (would-be render) pipeline —
// CEO review Section 6 finding: the plan required this as a distinct test
// tier alongside pure unit tests.

beforeEach(() => {
  sessionStorage.clear();
});

describe("fetchRegistry", () => {
  it("returns the bundled default registry with zero network calls", async () => {
    const fetchImpl = vi.fn();
    const source: RegistrySource = { owner: "", repo: "", isDefault: true };
    const result = await fetchRegistry(source, fetchImpl);
    expect(result.registry.networks.length).toBeGreaterThan(0);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("fetches, validates, and returns a remote registry end-to-end", async () => {
    const validRegistry = {
      schemaVersion: "1.0.0",
      networks: [{ name: "Ethereum", tokens: [] }],
    };
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({ status: 200, ok: true, json: async () => ({ default_branch: "main" }) })
      .mockResolvedValueOnce({ status: 200, ok: true, text: async () => JSON.stringify(validRegistry) });
    const source: RegistrySource = { owner: "acme", repo: "registry", isDefault: false };
    const result = await fetchRegistry(source, fetchImpl);
    expect(result.registry.networks[0]?.name).toBe("Ethereum");
  });

  it("surfaces a RegistryClientError with code parse_error for malformed remote JSON", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({ status: 200, ok: true, json: async () => ({ default_branch: "main" }) })
      .mockResolvedValueOnce({ status: 200, ok: true, text: async () => "{ not json" });
    const source: RegistrySource = { owner: "acme", repo: "registry", isDefault: false };
    await expect(fetchRegistry(source, fetchImpl)).rejects.toMatchObject({ code: "parse_error" });
  });

  it("surfaces code rate_limited on a 403 from the registry file fetch", async () => {
    // A single fetchRegistry() call here makes exactly 2 fetchImpl calls
    // (default_branch lookup, then the registry.json fetch) — asserting
    // twice against two separate fetchRegistry() calls would need a 3rd
    // mocked response for the second call's (now-cached) default_branch
    // reuse, so keep this to one call with a combined assertion instead.
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({ status: 200, ok: true, json: async () => ({ default_branch: "main" }) })
      .mockResolvedValueOnce({ status: 403, ok: false });
    const source: RegistrySource = { owner: "acme", repo: "registry", isDefault: false };
    await expect(fetchRegistry(source, fetchImpl)).rejects.toMatchObject({
      code: "rate_limited",
      name: "RegistryClientError",
    });
  });

  it("surfaces code schema_version_unrecognized for a well-formed but unsupported schemaVersion (refuses to render, doesn't guess)", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({ status: 200, ok: true, json: async () => ({ default_branch: "main" }) })
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        text: async () => JSON.stringify({ schemaVersion: "9.9.9", networks: [] }),
      });
    const source: RegistrySource = { owner: "acme", repo: "registry", isDefault: false };
    await expect(fetchRegistry(source, fetchImpl)).rejects.toMatchObject({ code: "schema_version_unrecognized" });
  });
});
