import type { Token } from "../types.ts";
import { parseToken, RegistryParseError, RegistrySchemaError } from "../schema-validator.ts";
import { computeTrustScore } from "../trust-score/index.ts";

const MAX_PASTE_LENGTH = 100_000; // ~100KB — CEO review Section 4 finding.

export interface EditorCallbacks {
  onValidToken: (token: Token) => void;
}

export class Editor {
  private textarea: HTMLTextAreaElement;
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
    header.textContent = "Editor";
    container.append(header);

    this.textarea = document.createElement("textarea");
    this.textarea.className = "json-editor";
    this.textarea.spellcheck = false;
    container.append(this.textarea);

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
    this.renderDiagnostics([]);
    this.renderTrustScore(token);
  }

  /** Resets to an empty state — call whenever the selection becomes "no token" (switching network/list/gallery), so the editor never keeps showing a token that's no longer selected. */
  clear(): void {
    this.textarea.value = "";
    this.lastValidJson = "";
    this.hasUnsavedChanges = false;
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
      this.renderDiagnostics([]);
      this.renderTrustScore(token);
      this.callbacks.onValidToken(token);
    } catch (err) {
      if (err instanceof RegistryParseError) {
        this.renderDiagnostics([err.message]);
      } else if (err instanceof RegistrySchemaError) {
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
    for (const finding of findings) {
      const line = document.createElement("div");
      line.className = `trust-score-finding trust-score-${finding.severity}`;
      line.textContent = finding.message;
      this.trustScoreEl.append(line);
    }
  }
}
