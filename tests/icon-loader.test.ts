import { describe, it, expect, vi } from "vitest";
import { isIconDomainAllowed } from "../src/icon/domain-allowlist.ts";
import { loadIcon } from "../src/icon/icon-loader.ts";

describe("isIconDomainAllowed", () => {
  it("allows a domain on the allowlist", () => {
    expect(isIconDomainAllowed("https://raw.githubusercontent.com/foo/bar/icon.png")).toBe(true);
  });

  it("rejects a domain not on the allowlist", () => {
    expect(isIconDomainAllowed("https://evil.example.com/icon.png")).toBe(false);
  });

  it("rejects a malformed URL rather than throwing", () => {
    expect(isIconDomainAllowed("not a url")).toBe(false);
  });
});

describe("loadIcon", () => {
  it("falls back to null (placeholder) for a disallowed domain — never fetches it", async () => {
    const fetchImpl = vi.fn();
    const src = await loadIcon("https://evil.example.com/icon.png", fetchImpl);
    expect(src).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("falls back to null on a 404 from an allowed domain", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    const src = await loadIcon("https://raw.githubusercontent.com/foo/bar/missing.png", fetchImpl);
    expect(src).toBeNull();
  });

  it("falls back to null when content-length exceeds the size cap", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: (key: string) => (key === "content-length" ? "999999999" : null) },
    });
    const src = await loadIcon("https://raw.githubusercontent.com/foo/bar/huge.png", fetchImpl);
    expect(src).toBeNull();
  });
});
