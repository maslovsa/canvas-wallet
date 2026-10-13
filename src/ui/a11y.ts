// Makes a non-button element keyboard-operable: focusable, announced as a button, and activated with Enter or Space.
// (A real <button> would be better where the markup allows; list rows hold block content, so they get the role.)
export function makeActivatable(el: HTMLElement, onActivate: () => void): void {
  el.tabIndex = 0;
  el.setAttribute("role", "button");
  el.addEventListener("click", onActivate);
  el.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onActivate();
    }
  });
}
