import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkGovernance, governanceWarning } from "../src/registry-client/governance-check.ts";

// Eng review Outside Voice T1: multi-registry client must not imply every
// third-party registry has the same governance as the canonical one.
beforeEach(() => {
  sessionStorage.clear();
});

describe("checkGovernance", () => {
  it("reports true for both when branch protection and CODEOWNERS exist", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ status: 200 });
    const status = await checkGovernance("acme", "registry", fetchImpl);
    expect(status.hasBranchProtection).toBe(true);
    expect(status.hasCodeowners).toBe(true);
  });

  it("reports false (not unknown) on a clean 404", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ status: 404 });
    const status = await checkGovernance("acme", "registry", fetchImpl);
    expect(status.hasBranchProtection).toBe(false);
    expect(status.hasCodeowners).toBe(false);
  });

  it("reports unknown (not false) on an ambiguous response like 403", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ status: 403 });
    const status = await checkGovernance("acme", "registry", fetchImpl);
    expect(status.hasBranchProtection).toBe("unknown");
  });
});

describe("governanceWarning", () => {
  it("warns when governance is confirmed absent", () => {
    const warning = governanceWarning({ hasBranchProtection: false, hasCodeowners: false, checkedAt: 0 });
    expect(warning).toContain("no confirmed branch protection");
  });

  it("warns (differently) when governance is unknown", () => {
    const warning = governanceWarning({ hasBranchProtection: "unknown", hasCodeowners: "unknown", checkedAt: 0 });
    expect(warning).toContain("Couldn't confirm");
  });

  it("returns undefined when governance is confirmed present", () => {
    const warning = governanceWarning({ hasBranchProtection: true, hasCodeowners: true, checkedAt: 0 });
    expect(warning).toBeUndefined();
  });
});
