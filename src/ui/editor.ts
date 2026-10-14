import { icon } from "./icons.ts";
import type { Token } from "../types.ts";
import { parseToken, RegistryParseError, RegistrySchemaError } from "../schema-validator.ts";
import { computeTrustScore } from "../trust-score/index.ts";
import { buildHighlight, locateJsonError } from "./json-highlight.ts";

const MAX_PASTE_LENGTH = 100_000; // ~100KB — CEO review Section 4 finding.

export interface EditorCallbacks {
  onValidToken: (token: Token) => void;
}

export class Editor {
  private textarea: HTMLTextAreaElement;
  private highlight: HTMLElement;
  private diagnostics: HTMLElement;
  private trustScoreEl: HTMLElement;
  private callbacks: EditorCallbacks;
  hasUnsavedChanges = false;
  private lastValidJson = "";

  constructor(container: HTMLElement, callbacks: EditorCallbacks) {
    this.callbacks = callbacks;
    container.innerHTML = "";
    container.className = "editor-panel";

    const header = document.createElement("h3");
    header.append(icon("file-json", { size: 14 }), document.createTextNode("Token JSON"));
    container.append(header);

    // The textarea is transparent and sits over a <pre> that draws the same text in colors (and marks the error).
    const wrap = document.createElement("div");
    wrap.className = "json-editor-wrap";
    const pre = document.createElement("pre");
    pre.className = "json-highlight";
    pre.setAttribute("aria-hidden", "true");
    this.highlight = document.createElement("code");
    pre.append(this.highlight);
    this.textarea = document.createElement("textarea");
    this.textarea.className = "json-editor";
    this.textarea.setAttribute("aria-label", "Token JSON");
    this.textarea.spellcheck = false;
    this.textarea.addEventListener("scroll", () => {
      pre.scrollTop = this.textarea.scrollTop;
      pre.scrollLeft = this.textarea.scrollLeft;
    });
    wrap.append(pre, this.textarea);
    container.append(wrap);

    this.diagnostics = document.createElement("div");
    this.diagnostics.className = "editor-diagnostics";
    container.append(this.diagnostics);

    this.trustScoreEl = document.createElement("div");
    this.trustScoreEl.className = "trust-score-panel";
    container.append(this.trustScoreEl);

    this.textarea.addEventListener("input", () => this.handleInput());
    this.textarea.addEventListener("paste", (e) => this.handlePaste(e));
  }

  loadToken(token: Token): void {
    const json = JSON.stringify(token, null, 2);
    this.textarea.value = json;
    this.lastValidJson = json;
    this.hasUnsavedChanges = false;
    this.paint(null);
    this.renderDiagnostics([]);
    this.renderTrustScore(token);
  }

  /** Redraws the colored layer for the current text; `errorAt` marks the character where the JSON breaks. */
  private paint(errorAt: number | null): void {
    this.highlight.replaceChildren(buildHighlight(this.textarea.value, errorAt));
  }

  /** Resets to an empty state — call whenever the selection becomes "no token" (switching network/list/gallery), so the editor never keeps showing a token that's no longer selected. */
  clear(): void {
    this.textarea.value = "";
    this.lastValidJson = "";
    this.hasUnsavedChanges = false;
    this.paint(null);
    this.renderDiagnostics([]);
    this.trustScoreEl.innerHTML = "";
  }

  private handlePaste(event: ClipboardEvent): void {
    const pasted = event.clipboardData?.getData("text") ?? "";
    if (pasted.length > MAX_PASTE_LENGTH) {
      event.preventDefault();
      this.renderDiagnostics([
        `Pasted content is ${pasted.length.toLocaleString()} characters — configs should be well under ${MAX_PASTE_LENGTH.toLocaleString()}. Paste rejected.`,
      ]);
    }
  }

  private handleInput(): void {
    const text = this.textarea.value;
    this.hasUnsavedChanges = text !== this.lastValidJson;
    try {
      const token = parseToken(text);
      this.paint(null);
      this.renderDiagnostics([]);
      this.renderTrustScore(token);
      this.callbacks.onValidToken(token);
    } catch (err) {
      if (err instanceof RegistryParseError) {
        const where = locateJsonError(text);
        this.paint(where?.position ?? null);
        this.renderDiagnostics([where ? `Line ${where.line}, column ${where.column}: ${err.message}` : err.message]);
      } else if (err instanceof RegistrySchemaError) {
        this.paint(null);
        this.renderDiagnostics(err.issues);
      } else {
        throw err;
      }
      this.trustScoreEl.innerHTML = "";
    }
  }

  private renderDiagnostics(issues: string[]): void {
    this.diagnostics.innerHTML = "";
    this.diagnostics.classList.toggle("has-errors", issues.length > 0);
    for (const issue of issues) {
      const line = document.createElement("div");
      line.className = "diagnostic-line";
      line.textContent = issue;
      this.diagnostics.append(line);
    }
  }

  private renderTrustScore(token: Token): void {
    this.trustScoreEl.innerHTML = "";
    const findings = computeTrustScore(token);
    const title = document.createElement("div");
    title.className = "trust-score-title";
    title.textContent = findings.length === 0 ? "Trust score: no issues flagged" : `Trust score: ${findings.length} advisory finding(s)`;
    this.trustScoreEl.append(title);
    // Grouped by severity and collapsible: warnings open, the rest folded away until asked for.
    for (const [severity, heading] of [["warning", "Warnings"], ["info", "Notes"]] as const) {
      const group = findings.filter((f) => f.severity === severity);
      if (group.length === 0) continue;
      const details = document.createElement("details");
      details.className = `trust-score-group trust-score-group-${severity}`;
      details.open = severity === "warning";
      const summary = document.createElement("summary");
      summary.textContent = `${heading} (${group.length})`;
      details.append(summary);
      for (const finding of group) {
        const line = document.createElement("div");
        line.className = `trust-score-finding trust-score-${finding.severity}`;
        line.textContent = finding.message;
        details.append(line);
      }
      this.trustScoreEl.append(details);
    }
  }
}
