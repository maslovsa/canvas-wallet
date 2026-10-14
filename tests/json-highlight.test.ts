import { describe, it, expect } from "vitest";
import { tokenizeJson, locateJsonError, buildHighlight } from "../src/ui/json-highlight.ts";

describe("tokenizeJson", () => {
  it("classifies keys, strings, numbers, literals and punctuation, and reproduces the text exactly", () => {
    const text = '{\n  "name": "Tether",\n  "decimals": 6.5e1,\n  "ok": true,\n  "x": null, "l": [-1]\n}';
    const tokens = tokenizeJson(text);
    expect(tokens.map((t) => t.text).join("")).toBe(text);
    const types = (kind: string) => tokens.filter((t) => t.type === kind).map((t) => t.text);
    expect(types("key")).toEqual(['"name"', '"decimals"', '"ok"', '"x"', '"l"']);
    expect(types("string")).toEqual(['"Tether"']);
    expect(types("number")).toEqual(["6.5e1", "-1"]);
    expect(types("literal")).toEqual(["true", "null"]);
  });

  it("a key is a string followed by a colon even across whitespace; escaped quotes stay inside a string", () => {
    const tokens = tokenizeJson('{"a\\"b"  :  "v"}');
    expect(tokens.find((t) => t.type === "key")!.text).toBe('"a\\"b"');
    expect(tokens.find((t) => t.type === "string")!.text).toBe('"v"');
  });

  it("copes with broken input: an unterminated string and stray characters still round-trip", () => {
    const text = '{ "name": "Brok, @@ }';
    expect(tokenizeJson(text).map((t) => t.text).join("")).toBe(text);
  });
});

describe("locateJsonError", () => {
  it("is null for valid JSON", () => {
    expect(locateJsonError('{"a": 1}')).toBeNull();
  });
  it("gives a 1-based line and column for a break in the middle of the text", () => {
    const text = '{\n  "a": 1,\n  "b": ,\n  "c": 3\n}';
    const where = locateJsonError(text)!;
    expect(where.line).toBe(3);
    expect(text[where.position]).toBe(",");
    expect(where.column).toBe(8);
  });
  it("points at the end for truncated input", () => {
    const where = locateJsonError('{ "name": "Broken", ')!;
    expect(where).not.toBeNull();
    expect(where.line).toBe(1);
  });
});

describe("locateJsonError: where the scanner stops", () => {
  const cases: Array<[string, string, number]> = [
    ["a missing value", '{"a": ,}', 6],
    ["a trailing comma in an object", '{"a": 1,}', 8],
    ["a trailing comma in an array", "[1, 2,]", 6],
    ["a missing colon", '{"a" 1}', 5],
    ["a single-quoted string", "{'a': 1}", 1],
    ["an unquoted key", "{a: 1}", 1],
    ["extra text after the value", '{"a": 1} x', 9],
    ["an unterminated string (the last character, the text just ends)", '{"a": "abc', 9],
    ["a bad escape", '{"a": "\\q"}', 8],
    ["a leading zero", '{"a": 01}', 7],
    ["a comment", '{"a": 1 // c\n}', 8],
    ["a bare word", '{"a": nope}', 6],
  ];
  it.each(cases)("%s", (_name, text, expectedPosition) => {
    expect(() => JSON.parse(text)).toThrow();
    expect(locateJsonError(text)!.position).toBe(expectedPosition);
  });
  it("agrees with JSON.parse on what is valid", () => {
    for (const ok of ["{}", "[]", "0", '"s"', "-1.5e+3", "true", '{"a":[1,{"b":null}],"c":"\\u00e9\\n"}', ' \n{ "a" : 1 }\n ']) {
      expect(() => JSON.parse(ok)).not.toThrow();
      expect(locateJsonError(ok)).toBeNull();
    }
  });
});

describe("buildHighlight", () => {
  it("renders the text in token spans (no HTML parsing) and marks only the offending character", () => {
    const host = document.createElement("div");
    const text = '{"a": "<img src=x onerror=alert(1)>", ]}';
    host.append(buildHighlight(text, text.indexOf("]")));
    expect(host.querySelector("img")).toBeNull();
    expect(host.textContent).toBe(`${text}\n`);
    expect([...host.querySelectorAll(".tok-error")].map((e) => e.textContent)).toEqual(["]"]);
  });
  it("without an error nothing is marked", () => {
    const host = document.createElement("div");
    host.append(buildHighlight('{"a": 1}', null));
    expect(host.querySelector(".tok-error")).toBeNull();
  });
});
