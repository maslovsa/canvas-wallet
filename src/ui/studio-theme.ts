// The studio's own light/dark theme (not the phone's, which has its own toggle): follows the system setting until the
// user pins it. The choice is kept in localStorage; every read and write is guarded (private windows, blocked storage).
export type StudioTheme = "auto" | "light" | "dark";

const KEY = "studio-theme";
const ORDER: StudioTheme[] = ["auto", "light", "dark"];

export function readStudioTheme(storage: Pick<Storage, "getItem"> | undefined = safeStorage()): StudioTheme {
  try {
    const value = storage?.getItem(KEY);
    return value === "light" || value === "dark" ? value : "auto";
  } catch {
    return "auto";
  }
}

export function nextStudioTheme(current: StudioTheme): StudioTheme {
  return ORDER[(ORDER.indexOf(current) + 1) % ORDER.length]!;
}

/** Pins (or releases, for "auto") the theme on <html> and remembers it. */
export function applyStudioTheme(theme: StudioTheme, root: HTMLElement = document.documentElement, storage: Pick<Storage, "setItem" | "removeItem"> | undefined = safeStorage()): void {
  if (theme === "auto") root.removeAttribute("data-theme");
  else root.dataset.theme = theme;
  try {
    if (theme === "auto") storage?.removeItem(KEY);
    else storage?.setItem(KEY, theme);
  } catch {
    // the choice still applies for this page view
  }
  const dark = theme === "dark" || (theme === "auto" && !window.matchMedia("(prefers-color-scheme: light)").matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#08090b" : "#f4f5f8");
}

export const THEME_LABEL: Record<StudioTheme, string> = { auto: "Theme: follow system", light: "Theme: light", dark: "Theme: dark" };
export const THEME_ICON: Record<StudioTheme, "monitor" | "sun" | "moon"> = { auto: "monitor", light: "sun", dark: "moon" };

function safeStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}
