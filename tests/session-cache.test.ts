import { describe, it, expect, vi, beforeEach } from "vitest";
import { getDefaultBranchCached, RateLimitSignal, NotFoundSignal, NetworkSignal } from "../src/registry-client/session-cache.ts";

// All GitHub API calls are mocked in tests — no test may hit the real API
// (CEO review Section 6 finding: avoids CI flakiness from rate limits/network).

beforeEach(() => {
  sessionStorage.clear();
});

describe("getDefaultBranchCached", () => {
  it("fetches and caches the default branch", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({ default_branch: "main" }),
    });
    const result = await getDefaultBranchCached("acme", "registry", fetchImpl);
    expect(result.defaultBranch).toBe("main");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("serves the second call from cache without hitting fetch again", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({ default_branch: "main" }),
    });
    await getDefaultBranchCached("acme", "registry", fetchImpl);
    await getDefaultBranchCached("acme", "registry", fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("throws RateLimitSignal on 403", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ status: 403, ok: false });
    await expect(getDefaultBranchCached("acme", "registry", fetchImpl)).rejects.toThrow(RateLimitSignal);
  });

  it("throws NotFoundSignal on 404", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ status: 404, ok: false });
    await expect(getDefaultBranchCached("acme", "registry", fetchImpl)).rejects.toThrow(NotFoundSignal);
  });

  it("throws NetworkSignal on other failures", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ status: 500, ok: false });
    await expect(getDefaultBranchCached("acme", "registry", fetchImpl)).rejects.toThrow(NetworkSignal);
  });
});
