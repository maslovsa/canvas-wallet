import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchRegistry } from "../src/registry-client/fetcher.ts";
import { DEFAULT_REGISTRY } from "../src/presets/presets.ts";
import type { RegistrySource } from "../src/types.ts";

// Integration test for the fetch -> validate -> (would-be render) pipeline —
// CEO review Section 6 finding: the plan required this as a distinct test
// tier alongside pure unit tests.

beforeEach(() => {
  sessionStorage.clear();
});

describe("fetchRegistry (default source)", () => {
  const source: RegistrySource = { owner: "", repo: "", isDefault: true };

  it("loads the real registry.json via a same-origin fetch (never a GitHub domain)", async () => {
    const published = { schemaVersion: "1.0.0", networks: [{ name: "Ethereum", tokens: [] }] };
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, text: async () => JSON.stringify(published) });
    const result = await fetchRegistry(source, fetchImpl);
    expect(result.registry.networks[0]?.name).toBe("Ethereum");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const requestedUrl = fetchImpl.mock.calls[0]?.[0] as string;
    expect(requestedUrl).not.toContain("github.com");
    expect(requestedUrl).not.toContain("githubusercontent.com");
  });

  it("falls back to the in-memory DEFAULT_REGISTRY if the same-origin fetch fails", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("network error"));
    const result = await fetchRegistry(source, fetchImpl);
    expect(result.registry).toEqual(DEFAULT_REGISTRY);
  });

  it("falls back to DEFAULT_REGISTRY if the published registry.json is malformed", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, text: async () => "{ not json" });
    const result = await fetchRegistry(source, fetchImpl);
    expect(result.registry).toEqual(DEFAULT_REGISTRY);
  });

  it("falls back to DEFAULT_REGISTRY on a non-ok response (e.g. 404 on a broken deploy)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    const result = await fetchRegistry(source, fetchImpl);
    expect(result.registry).toEqual(DEFAULT_REGISTRY);
  });
});

describe("fetchRegistry (remote/multi-registry source)", () => {

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
