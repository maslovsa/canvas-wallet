import { describe, it, expect } from "vitest";
import { StaleFetchGuard } from "../src/registry-client/stale-fetch-guard.ts";

describe("StaleFetchGuard", () => {
  it("reports the most recent begin() token as current", () => {
    const guard = new StaleFetchGuard();
    const token = guard.begin();
    expect(guard.isCurrent(token)).toBe(true);
  });

  it("invalidates an older token once a newer fetch begins (the stale-response race case)", () => {
    const guard = new StaleFetchGuard();
    const older = guard.begin();
    const newer = guard.begin();
    expect(guard.isCurrent(older)).toBe(false);
    expect(guard.isCurrent(newer)).toBe(true);
  });
});
