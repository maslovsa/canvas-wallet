import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanText, scanDir, loadEnvValues } from "../scripts/check-dist-secrets.ts";

const dirs: string[] = [];
function tempDist(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "dist-"));
  dirs.push(dir);
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(join(dir, name, ".."), { recursive: true });
    writeFileSync(join(dir, name), content);
  }
  return dir;
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

// Fake keys, built at runtime so this file itself contains no secret-shaped literal.
const fakeAegis = "aeg_" + "a1B2c3D4e5F6g7H8i9J0";
const fakeCloudflare = "cfat_" + "Z9y8X7w6V5u4T3s2R1q0";

describe("scanText", () => {
  it("flags each secret shape by name", () => {
    expect(scanText(`const k="${fakeAegis}"`)).toEqual(["Aegis API key (aeg_...)"]);
    expect(scanText(fakeCloudflare)).toEqual(["Cloudflare API token (cfut_/cfat_...)"]);
    expect(scanText("fetch(u,{headers:{Authorization:'Bearer " + "x".repeat(30) + "'}})")).toEqual(["Bearer token literal"]);
    expect(scanText("-----BEGIN " + "PRIVATE KEY-----")).toEqual(["PEM private key"]);
  });

  it("does not flag ordinary minified code, short tokens or the word Bearer alone", () => {
    expect(scanText("headers:{Authorization:`Bearer ${t}`}")).toEqual([]);
    expect(scanText("const desk-lamp = 'task-runner-config-value-1234567890'")).toEqual([]);
    expect(scanText("aeg_short")).toEqual([]);
  });

  it("flags a value copied from the local .env even if it has no known shape", () => {
    const value = "plain-value-0123456789abcdef";
    expect(scanText(`x="${value}"`, [value])).toEqual(["a value from the local .env"]);
    expect(scanText("nothing here", [value])).toEqual([]);
  });
});

describe("scanDir", () => {
  it("passes a clean dist", () => {
    const dir = tempDist({ "index.html": "<html></html>", "assets/app.js": "console.log('hi')" });
    expect(scanDir(dir)).toEqual([]);
  });

  it("fails on a planted key in a nested file and reports the file and pattern, never the key", () => {
    const dir = tempDist({ "index.html": "ok", "assets/app.js": `var k="${fakeAegis}";` });
    const findings = scanDir(dir);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.file.endsWith("app.js")).toBe(true);
    expect(JSON.stringify(findings)).not.toContain(fakeAegis);
  });

  it("also scans source maps", () => {
    const dir = tempDist({ "assets/app.js.map": `{"sourcesContent":["${fakeCloudflare}"]}` });
    expect(scanDir(dir)).toHaveLength(1);
  });
});

describe("loadEnvValues", () => {
  it("reads long values from KEY=VALUE lines and ignores comments, short values and a missing file", () => {
    const dir = tempDist({ ".env": "# comment\nA=short\nB=this-is-a-long-secret-value\nnot a line\n" });
    expect(loadEnvValues(join(dir, ".env"))).toEqual(["this-is-a-long-secret-value"]);
    expect(loadEnvValues(join(dir, "missing.env"))).toEqual([]);
  });
  it("skips STUB_* keys: they are public demo values published on purpose", () => {
    const dir = tempDist({ ".env": "STUB_TRON=TC9kD9YUpyHYQDfeoq1P12S8J3ZhNrYF3h\nSECRET_TOKEN=this-is-a-long-secret-value\n" });
    expect(loadEnvValues(join(dir, ".env"))).toEqual(["this-is-a-long-secret-value"]);
  });
});
