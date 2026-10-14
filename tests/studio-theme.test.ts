import { describe, it, expect } from "vitest";
import { readStudioTheme, nextStudioTheme, applyStudioTheme } from "../src/ui/studio-theme.ts";

const memory = () => {
  const store = new Map<string, string>();
  return { store, getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
};

describe("studio theme", () => {
  it("reads light or dark, anything else (or a throwing store) is auto", () => {
    expect(readStudioTheme({ getItem: () => "light" })).toBe("light");
    expect(readStudioTheme({ getItem: () => "dark" })).toBe("dark");
    expect(readStudioTheme({ getItem: () => "purple" })).toBe("auto");
    expect(readStudioTheme({ getItem: () => null })).toBe("auto");
    expect(readStudioTheme({ getItem: () => { throw new Error("blocked"); } })).toBe("auto");
  });

  it("cycles system -> light -> dark -> system", () => {
    expect(nextStudioTheme("auto")).toBe("light");
    expect(nextStudioTheme("light")).toBe("dark");
    expect(nextStudioTheme("dark")).toBe("auto");
  });

  it("pins the theme on <html> and remembers it; auto releases both", () => {
    const root = document.createElement("html");
    const storage = memory();
    applyStudioTheme("light", root, storage);
    expect(root.dataset.theme).toBe("light");
    expect(storage.store.get("studio-theme")).toBe("light");
    applyStudioTheme("dark", root, storage);
    expect(root.dataset.theme).toBe("dark");
    applyStudioTheme("auto", root, storage);
    expect(root.hasAttribute("data-theme")).toBe(false);
    expect(storage.store.has("studio-theme")).toBe(false);
  });

  it("a storage that throws on write does not break applying the theme", () => {
    const root = document.createElement("html");
    applyStudioTheme("dark", root, { setItem: () => { throw new Error("full"); }, removeItem: () => {} });
    expect(root.dataset.theme).toBe("dark");
  });
});
