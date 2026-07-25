import type { ListMeta, Registry } from "../types.ts";

export interface GalleryEntry {
  meta: ListMeta;
  registry: Registry | undefined; // undefined if this one failed to load — shown as an error card, not silently dropped.
}

function countTokens(registry: Registry): number {
  return registry.networks.reduce((sum, n) => sum + n.tokens.length, 0);
}

export function renderGalleryCards(
  container: HTMLElement,
  entries: readonly GalleryEntry[],
  onOpen: (meta: ListMeta) => void,
): void {
  container.innerHTML = "";
  for (const entry of entries) {
    const card = document.createElement("button");
    card.className = "gallery-card";

    const title = document.createElement("div");
    title.className = "gallery-card-title";
    title.textContent = entry.meta.name;
    card.append(title);

    const desc = document.createElement("div");
    desc.className = "gallery-card-desc";
    desc.textContent = entry.meta.description;
    card.append(desc);

    const stats = document.createElement("div");
    stats.className = "gallery-card-stats";
    if (entry.registry) {
      stats.textContent = `${countTokens(entry.registry)} tokens · ${entry.registry.networks.length} network${entry.registry.networks.length === 1 ? "" : "s"}`;
    } else {
      stats.textContent = "Failed to load";
      card.classList.add("gallery-card-error");
      card.disabled = true;
    }
    card.append(stats);

    if (entry.registry) {
      card.addEventListener("click", () => onOpen(entry.meta));
    }
    container.append(card);
  }
}
