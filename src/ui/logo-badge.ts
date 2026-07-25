import { loadIcon } from "../icon/icon-loader.ts";

// Shared logo rendering for both token logos and network logos — same
// domain-allowlist + placeholder-on-failure behavior as widget icons
// (loadIcon already handles rejected domains, 404s, and oversized files).
// While a real logo loads (or if there isn't one / it fails), shows a
// lettered avatar instead of a blank space, so a card never looks broken.

export function createLogoBadge(url: string | undefined, fallbackLetter: string, className: string): HTMLElement {
  const el = document.createElement("div");
  el.className = className;
  renderFallback(el, fallbackLetter);

  if (url) {
    loadIcon(url).then((src) => {
      if (!src) return; // stays as the lettered fallback — domain rejected or load failed.
      const img = document.createElement("img");
      img.src = src;
      img.alt = "";
      el.replaceChildren(img);
    });
  }

  return el;
}

function renderFallback(el: HTMLElement, letter: string): void {
  el.textContent = letter.slice(0, 1).toUpperCase();
  el.classList.add("logo-badge-fallback");
}
