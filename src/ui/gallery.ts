import type { ListMeta, Registry } from "../types.ts";
import { createLogoBadge } from "./logo-badge.ts";
import { icon } from "./icons.ts";
import { generateBalance } from "./fake-balance.ts";
import { findNetworkInfo, type NetworkInfo } from "../networks/network-registry.ts";

export interface GalleryEntry {
  meta: ListMeta;
  registry: Registry | undefined; // undefined if this one failed to load — shown as an error card, not silently dropped.
}

function countTokens(registry: Registry): number {
  return registry.networks.reduce((sum, n) => sum + n.tokens.length, 0);
}

/** A small, decorative picture of what the list looks like in the phone: its first network and first three assets. */
export function renderMiniPhone(registry: Registry, networks: readonly NetworkInfo[]): HTMLElement {
  const preview = document.createElement("div");
  preview.className = "gallery-card-preview";
  preview.setAttribute("aria-hidden", "true");
  const phone = document.createElement("div");
  phone.className = "mini-phone";

  const first = registry.networks[0];
  const chips = document.createElement("div");
  chips.className = "mini-phone-chips";
  for (const network of registry.networks.slice(0, 4)) {
    const chip = document.createElement("span");
    chip.className = "mini-phone-chip" + (network === first ? " active" : "");
    chip.append(createLogoBadge(findNetworkInfo(networks, network.name)?.logo, network.name, "mini-phone-chip-logo"));
    chips.append(chip);
  }
  phone.append(chips);

  for (const token of (first?.tokens ?? []).slice(0, 3)) {
    const row = document.createElement("div");
    row.className = "mini-phone-row";
    row.append(createLogoBadge(token.logo, token.symbol, "mini-phone-logo"));
    const symbol = document.createElement("span");
    symbol.className = "mini-phone-symbol";
    symbol.textContent = token.symbol;
    const usd = document.createElement("span");
    usd.className = "mini-phone-usd";
    const value = generateBalance(`${token.id}:${token.symbol}`, token.tags?.includes("stablecoin") ?? false).usd;
    usd.textContent = `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
    row.append(symbol, usd);
    phone.append(row);
  }
  preview.append(phone);
  return preview;
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
      card.append(renderMiniPhone(entry.registry, networks));
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
