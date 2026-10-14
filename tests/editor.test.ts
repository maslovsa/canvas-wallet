import { describe, it, expect, vi } from "vitest";
import { Editor } from "../src/ui/editor.ts";
import type { Token } from "../src/types.ts";

const token = {
  name: "Tether USD", symbol: "USDT", type: "TRC20", id: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t", decimals: 6, status: "active",
  ui: { theme: { primaryColor: "#26A17B", badgeText: "Stablecoin" }, background: { type: "solid", colors: ["#26A17B"] } },
} as unknown as Token;

function mount() {
  document.body.innerHTML = "";
  const host = document.createElement("div");
  document.body.append(host);
  const onValidToken = vi.fn();
  const editor = new Editor(host, { onValidToken });
  const textarea = host.querySelector<HTMLTextAreaElement>(".json-editor")!;
  const type = (value: string) => {
    textarea.value = value;
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  };
  return { host, editor, textarea, type, onValidToken };
}

describe("Editor", () => {
  it("draws the same text in a colored layer behind the textarea", () => {
    const { host, editor, textarea } = mount();
    editor.loadToken(token);
    const layer = host.querySelector(".json-highlight code")!;
    expect(layer.textContent).toBe(`${textarea.value}\n`);
    expect(layer.querySelector(".tok-key")!.textContent).toBe('"name"');
    expect(host.querySelector(".json-highlight")!.getAttribute("aria-hidden")).toBe("true");
    expect(textarea.getAttribute("aria-label")).toBe("Token JSON");
  });

  it("broken JSON marks the exact character and says line and column", () => {
    const { host, editor, type, onValidToken } = mount();
    editor.loadToken(token);
    type('{\n  "name": "Broken",\n  "symbol": ,\n}');
    const marked = host.querySelector(".tok-error")!;
    expect(marked.textContent).toBe(",");
    expect(host.querySelector(".editor-diagnostics")!.textContent).toMatch(/^Line 3, column 13: /);
    expect(host.querySelector(".editor-diagnostics")!.classList.contains("has-errors")).toBe(true);
    expect(onValidToken).not.toHaveBeenCalled();
  });

  it("fixing the JSON clears the marker; valid JSON reaches the phone", () => {
    const { host, editor, type, textarea, onValidToken } = mount();
    editor.loadToken(token);
    type("{ nope");
    expect(host.querySelector(".tok-error")).not.toBeNull();
    type(JSON.stringify(token, null, 2));
    expect(host.querySelector(".tok-error")).toBeNull();
    expect(host.querySelector(".editor-diagnostics")!.textContent).toBe("");
    expect(onValidToken).toHaveBeenCalledTimes(1);
    expect(textarea.value).toContain("Tether USD");
  });

  it("trust findings are grouped by severity and collapsible: warnings open, notes folded", () => {
    const { host, editor } = mount();
    editor.loadToken(token);
    const warnings = host.querySelector<HTMLDetailsElement>(".trust-score-group-warning")!;
    expect(warnings.open).toBe(true);
    expect(warnings.querySelector("summary")!.textContent).toMatch(/^Warnings \(\d+\)$/);
    expect(warnings.querySelectorAll(".trust-score-warning").length).toBeGreaterThan(0);
    const notes = host.querySelector<HTMLDetailsElement>(".trust-score-group-info");
    if (notes) expect(notes.open).toBe(false);
  });

  it("the colored layer follows the textarea's scroll", () => {
    const { host, editor, textarea } = mount();
    editor.loadToken(token);
    textarea.scrollTop = 120;
    textarea.dispatchEvent(new Event("scroll"));
    expect(host.querySelector<HTMLElement>(".json-highlight")!.scrollTop).toBe(120);
  });
});
