import type { ListMeta, Registry } from "../types.ts";
import { createLogoBadge } from "./logo-badge.ts";
import { icon } from "./icons.ts";
import { findNetworkInfo, type NetworkInfo } from "../networks/network-registry.ts";

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
  networks: readonly NetworkInfo[] = [],
): void {
  container.innerHTML = "";
  for (const entry of entries) {
    const card = document.createElement("button");
    card.className = "gallery-card";

    if (entry.registry) {
      const stack = document.createElement("div");
      stack.className = "gallery-card-networks";
      for (const network of entry.registry.networks.slice(0, 5)) {
        stack.append(createLogoBadge(findNetworkInfo(networks, network.name)?.logo, network.name, "network-logo"));
      }
      card.append(stack);
      const open = icon("arrow-up-right", { size: 18, className: "gallery-card-open" });
      card.append(open);
    }

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
      const tokens = countTokens(entry.registry);
      const networkCount = entry.registry.networks.length;
      for (const text of [`${tokens} token${tokens === 1 ? "" : "s"}`, `${networkCount} network${networkCount === 1 ? "" : "s"}`]) {
        const chip = document.createElement("span");
        chip.className = "chip";
        chip.textContent = text;
        stats.append(chip);
      }
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
