// Syntax highlighting and error location for the token JSON editor. The editor draws these tokens in a <pre> layer
// behind a transparent <textarea>; every token is set with textContent (user text never reaches innerHTML).
export type JsonTokenType = "key" | "string" | "number" | "literal" | "punct" | "space" | "plain";

export interface JsonToken {
  type: JsonTokenType;
  text: string;
}

const TOKEN = /("(?:[^"\\\n]|\\.)*"?)|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|(true|false|null)|([{}[\],:])|(\s+)|([^\s"{}[\],:]+)/g;

export function tokenizeJson(text: string): JsonToken[] {
  const tokens: JsonToken[] = [];
  for (const match of text.matchAll(TOKEN)) {
    const [raw, string, number, literal, punct, space] = match;
    const type: JsonTokenType = string !== undefined ? "string" : number !== undefined ? "number" : literal !== undefined ? "literal" : punct !== undefined ? "punct" : space !== undefined ? "space" : "plain";
    tokens.push({ type, text: raw });
  }
  // a string directly followed (past any whitespace) by ":" is an object key
  for (let i = 0; i < tokens.length; i += 1) {
    if (tokens[i]!.type !== "string") continue;
    let j = i + 1;
    while (tokens[j]?.type === "space") j += 1;
    if (tokens[j]?.text === ":") tokens[i]!.type = "key";
  }
  return tokens;
}

export interface JsonErrorLocation {
  /** 0-based character offset of the offending character. */
  position: number;
  line: number;
  column: number;
}

/**
 * Where the text first stops being JSON, or null when it is valid. JSON.parse's message no longer carries a position
 * in current engines, so this is a small strict scanner of its own (RFC 8259: no comments, no trailing commas).
 */
export function locateJsonError(text: string): JsonErrorLocation | null {
  try {
    JSON.parse(text);
    return null;
  } catch {
    // fall through: find where
  }
  const failAt = scanJson(text);
  const position = Math.min(Math.max(0, failAt), Math.max(0, text.length - 1));
  const before = text.slice(0, position);
  const line = before.split("\n").length;
  const column = position - (before.lastIndexOf("\n") + 1) + 1;
  return { position, line, column };
}

/** Offset of the first offending character (text.length when the text just ends too early). */
function scanJson(text: string): number {
  let i = 0;
  const ws = (): void => {
    while (i < text.length && /[ \t\r\n]/.test(text[i]!)) i += 1;
  };
  class Bad extends Error {}
  const fail = (at: number): never => {
    i = at;
    throw new Bad();
  };
  const value = (): void => {
    ws();
    const c = text[i];
    if (c === undefined) fail(text.length);
    if (c === "{") {
      i += 1;
      ws();
      if (text[i] === "}") return void (i += 1);
      for (;;) {
        ws();
        if (text[i] !== '"') fail(i);
        string();
        ws();
        if (text[i] !== ":") fail(i);
        i += 1;
        value();
        ws();
        if (text[i] === ",") {
          i += 1;
          continue;
        }
        if (text[i] === "}") return void (i += 1);
        fail(i);
      }
    } else if (c === "[") {
      i += 1;
      ws();
      if (text[i] === "]") return void (i += 1);
      for (;;) {
        value();
        ws();
        if (text[i] === ",") {
          i += 1;
          continue;
        }
        if (text[i] === "]") return void (i += 1);
        fail(i);
      }
    } else if (c === '"') {
      string();
    } else if (/[-\d]/.test(c ?? "")) {
      const m = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(text.slice(i));
      if (!m) fail(i + 1);
      i += m![0].length;
    } else {
      const word = ["true", "false", "null"].find((w) => text.startsWith(w, i));
      if (!word) fail(i);
      i += word!.length;
    }
  };
  const string = (): void => {
    i += 1; // opening quote
    for (;;) {
      const c = text[i];
      if (c === undefined || c === "\n") fail(c === undefined ? text.length : i);
      if (c === '"') return void (i += 1);
      if (c === "\\") {
        const next = text[i + 1];
        if (next === "u") {
          if (!/^[0-9a-fA-F]{4}$/.test(text.slice(i + 2, i + 6))) fail(i + 2);
          i += 6;
        } else if (next !== undefined && '"\\/bfnrt'.includes(next)) i += 2;
        else fail(i + 1);
      } else i += 1;
    }
  };
  try {
    value();
    ws();
    if (i < text.length) fail(i); // anything after the value
  } catch (error) {
    if (!(error instanceof Bad)) throw error;
  }
  return i;
}

/** Builds the highlight layer's content for `text`, marking the character at `errorAt` (if any) as the error. */
export function buildHighlight(text: string, errorAt: number | null): DocumentFragment {
  const fragment = document.createDocumentFragment();
  let offset = 0;
  for (const token of tokenizeJson(text)) {
    const end = offset + token.text.length;
    const hit = errorAt !== null && errorAt >= offset && errorAt < end;
    if (token.type === "space" && !hit) {
      fragment.append(document.createTextNode(token.text));
    } else if (!hit) {
      const span = document.createElement("span");
      span.className = `tok-${token.type}`;
      span.textContent = token.text;
      fragment.append(span);
    } else {
      // split the token around the offending character so only that character carries the marker
      const at = errorAt! - offset;
      const parts: Array<[string, boolean]> = [[token.text.slice(0, at), false], [token.text.slice(at, at + 1), true], [token.text.slice(at + 1), false]];
      for (const [part, isError] of parts) {
        if (part === "") continue;
        const span = document.createElement("span");
        span.className = `tok-${token.type}${isError ? " tok-error" : ""}`;
        span.textContent = part;
        fragment.append(span);
      }
    }
    offset = end;
  }
  // a trailing newline needs a visible character so the layer scrolls exactly like the textarea
  fragment.append(document.createTextNode("\n"));
  return fragment;
}
