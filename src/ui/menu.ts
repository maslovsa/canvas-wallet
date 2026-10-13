// A small popover menu opened from a trigger button: arrow keys move, Enter picks, Esc and an outside click close.
// Text is set with textContent only.
import { icon, type IconName } from "./icons.ts";

export interface MenuItem {
  label: string;
  hint?: string;
  icon?: IconName;
  disabled?: boolean;
  onSelect: () => void;
}

export function attachMenu(trigger: HTMLElement, getItems: () => MenuItem[]): void {
  let menu: HTMLElement | null = null;

  const close = (returnFocus: boolean): void => {
    if (!menu) return;
    menu.remove();
    menu = null;
    trigger.setAttribute("aria-expanded", "false");
    document.removeEventListener("pointerdown", onOutside, true);
    if (returnFocus) trigger.focus();
  };
  const onOutside = (event: Event): void => {
    if (menu && !menu.contains(event.target as Node) && !trigger.contains(event.target as Node)) close(false);
  };

  const open = (): void => {
    close(false);
    const items = getItems();
    menu = document.createElement("div");
    menu.className = "menu";
    menu.setAttribute("role", "menu");
    const buttons: HTMLButtonElement[] = [];
    for (const item of items) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "menu-item";
      button.setAttribute("role", "menuitem");
      button.disabled = item.disabled === true;
      if (item.icon) button.append(icon(item.icon, { size: 16 }));
      const text = document.createElement("span");
      text.className = "menu-item-text";
      const label = document.createElement("span");
      label.textContent = item.label;
      text.append(label);
      if (item.hint) {
        const hint = document.createElement("span");
        hint.className = "menu-item-hint";
        hint.textContent = item.hint;
        text.append(hint);
      }
      button.append(text);
      button.addEventListener("click", () => {
        close(true);
        item.onSelect();
      });
      menu.append(button);
      buttons.push(button);
    }
    menu.addEventListener("keydown", (event) => {
      const enabled = buttons.filter((b) => !b.disabled);
      const index = enabled.indexOf(document.activeElement as HTMLButtonElement);
      if (event.key === "Escape") {
        event.preventDefault();
        close(true);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        enabled[(index + 1) % enabled.length]?.focus();
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        enabled[(index - 1 + enabled.length) % enabled.length]?.focus();
      }
    });
    trigger.parentElement?.append(menu);
    trigger.setAttribute("aria-expanded", "true");
    document.addEventListener("pointerdown", onOutside, true);
    buttons.find((b) => !b.disabled)?.focus();
  };

  trigger.setAttribute("aria-haspopup", "menu");
  trigger.setAttribute("aria-expanded", "false");
  trigger.addEventListener("click", () => (menu ? close(false) : open()));
}
