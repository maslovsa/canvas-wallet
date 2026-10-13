#!/usr/bin/env node
// Fails the build if the built site (dist/) contains secret-shaped text (plan decision R11).
// This project is PUBLIC and deployed to GitHub Pages: anything in dist/ is world-readable, so a
// key that slipped into the bundle (a VITE_-prefixed variable, a pasted value, a source map) must
// stop the deploy. Reports file names and pattern names only, NEVER the matched text.
//
//   npm run check:dist            scans ./dist (plus the values in a local .env, when one exists)
//   npx tsx scripts/check-dist-secrets.ts <dir>
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const SECRET_PATTERNS: Array<{ name: string; regex: RegExp }> = [
  { name: "Aegis API key (aeg_...)", regex: /aeg_[A-Za-z0-9]{16,}/ },
  { name: "Cloudflare API token (cfut_/cfat_...)", regex: /cf(?:ut|at)_[A-Za-z0-9]{16,}/ },
  { name: "CoinGecko API key (CG-...)", regex: /(?<![A-Za-z0-9])CG-[A-Za-z0-9]{16,}/ },
  { name: "OpenAI-style key (sk-...)", regex: /(?<![A-Za-z0-9])sk-[A-Za-z0-9]{20,}/ },
  { name: "Bearer token literal", regex: /Bearer\s+[A-Za-z0-9._-]{24,}/ },
  { name: "PEM private key", regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
];

export interface Finding {
  file: string;
  what: string;
}

/** Pattern names found in `text`, plus "local .env value" when any of `secretValues` occurs in it. */
export function scanText(text: string, secretValues: string[] = []): string[] {
  const found = SECRET_PATTERNS.filter((p) => p.regex.test(text)).map((p) => p.name);
  if (secretValues.some((value) => value.length >= 12 && text.includes(value))) found.push("a value from the local .env");
  return found;
}

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* walk(path);
    else yield path;
  }
}

export function scanDir(dir: string, secretValues: string[] = []): Finding[] {
  const findings: Finding[] = [];
  for (const file of walk(dir)) {
    for (const what of scanText(readFileSync(file, "latin1"), secretValues)) findings.push({ file, what });
  }
  return findings;
}

/**
 * Values of KEY=VALUE lines in a local .env (gitignored; absent in CI). Used only to compare, never printed.
 * STUB_* keys are skipped: they hold public demo values (the Receive dialog's fake addresses) that are
 * published on purpose in public/receive-addresses.json.
 */
export function loadEnvValues(envPath: string): string[] {
  if (!existsSync(envPath)) return [];
  return readFileSync(envPath, "utf-8")
    .split("\n")
    .filter((line) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(line) && !line.startsWith("STUB_"))
    .map((line) => line.slice(line.indexOf("=") + 1).trim())
    .filter((value) => value.length >= 12);
}

function main(): void {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const dir = resolve(process.argv[2] ?? join(root, "dist"));
  if (!existsSync(dir)) {
    console.error(`check-dist-secrets: ${dir} does not exist — build first.`);
    process.exit(2);
  }
  const findings = scanDir(dir, loadEnvValues(join(root, ".env")));
  if (findings.length > 0) {
    console.error("check-dist-secrets: secret-shaped text found in the build output (values are not printed):");
    for (const f of findings) console.error(`  - ${f.file}: ${f.what}`);
    process.exit(1);
  }
  console.log(`check-dist-secrets: ${dir} is clean.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
