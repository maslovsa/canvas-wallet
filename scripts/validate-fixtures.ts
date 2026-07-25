#!/usr/bin/env node
// Shared validator: run locally (`npm run validate:fixtures`) and by CI
// (.github/workflows/validate-registry.yml) — single canonical schema
// source, never two independently maintained validator implementations
// (CEO review Section 5 finding).
//
// Validates:
//  1. Every public/lists/*.json (except manifest.json, which isn't a
//     Registry — it's the Gallery's list-of-lists index) — the repo's REAL,
//     PR-editable lists (see CONTRIBUTING.md) — pass schema validation.
//     This is the actual production gate; everything else below is test
//     fixtures.
//  2. Every fixtures/valid/*.json passes schema validation.
//  3. Every fixtures/adversarial/*.json is REJECTED by schema validation —
//     these are deliberately malformed (unknown widget/action type, bad
//     schemaVersion, etc.) and asserting they fail is what makes this a
//     real regression test for the validator itself.
//  4. fixtures/canary-bad.json specifically must always fail — if it ever
//     passes, the CI schema gate itself has silently broken (CEO review
//     Section 8 finding).
//  5. Every icon/logo URL referenced anywhere in public/lists/*.json or
//     fixtures/valid/*.json is on the domain allowlist (enforced here, not
//     just client-side — design doc's resolved Open Question on icon policy).
//  6. Every ui.background.url (type: "image") is on that same domain
//     allowlist. Checked structurally (walking networks[].tokens[].ui),
//     NOT via the generic icon/logo key-walker below — "url" is also used by
//     action definitions (actionExternalUrl.url, actionDeeplink.url, link
//     URLs) where arbitrary domains are expected and correct, so a blanket
//     key-name match on "url" would wrongly flag those.
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ICON_DOMAIN_ALLOWLIST } from "../src/icon/domain-allowlist.ts";
import { createAjv } from "../src/schema/create-validator.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const schema = JSON.parse(readFileSync(join(ROOT, "registry.schema.json"), "utf-8"));
const ajv = createAjv();
const validate = ajv.compile(schema);

let failed = false;

function log(ok: boolean, label: string, detail?: string): void {
  const status = ok ? "PASS" : "FAIL";
  console.log(`[${status}] ${label}${detail ? " — " + detail : ""}`);
  if (!ok) failed = true;
}

// Both widget icons ("icon") and the token-level "logo" field are subject
// to the same domain allowlist — checked here, not just client-side.
const IMAGE_URL_KEYS = new Set(["icon", "logo"]);

function collectIconUrls(data: unknown): string[] {
  const urls: string[] = [];
  function walk(node: unknown): void {
    if (node && typeof node === "object") {
      for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
        if (IMAGE_URL_KEYS.has(key) && typeof value === "string" && value.startsWith("http")) {
          urls.push(value);
        }
        walk(value);
      }
    } else if (Array.isArray(node)) {
      for (const item of node) walk(item);
    }
  }
  walk(data);
  return urls;
}

interface RegistryLike {
  networks?: Array<{
    tokens?: Array<{
      ui?: { background?: { type?: string; url?: string } };
    }>;
  }>;
}

function collectBackgroundImageUrls(data: unknown): string[] {
  const urls: string[] = [];
  for (const network of (data as RegistryLike).networks ?? []) {
    for (const token of network.tokens ?? []) {
      const bg = token.ui?.background;
      if (bg?.type === "image" && typeof bg.url === "string") urls.push(bg.url);
    }
  }
  return urls;
}

function validateFile(path: string, expectValid: boolean): void {
  const raw = readFileSync(path, "utf-8");
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    log(!expectValid, `${path} (JSON parse)`, expectValid ? String(err) : "expected-invalid JSON, as intended");
    return;
  }
  const valid = validate(data);
  log(
    valid === expectValid,
    path,
    valid
      ? "schema-valid"
      : (validate.errors ?? []).map((e) => `${e.instancePath || "(root)"} ${e.message}`).join("; "),
  );

  if (expectValid && valid) {
    for (const url of [...collectIconUrls(data), ...collectBackgroundImageUrls(data)]) {
      let hostname: string;
      try {
        hostname = new URL(url).hostname;
      } catch {
        log(false, `${path} icon URL`, `not a valid URL: ${url}`);
        continue;
      }
      log(ICON_DOMAIN_ALLOWLIST.includes(hostname), `${path} icon domain`, url);
    }
  }
}

function validateDir(dir: string, expectValid: boolean, exclude: Set<string> = new Set()): void {
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".json") && !exclude.has(f));
  } catch {
    return;
  }
  for (const file of files) {
    validateFile(join(dir, file), expectValid);
  }
}

validateDir(join(ROOT, "public", "lists"), true, new Set(["manifest.json"]));
validateDir(join(ROOT, "fixtures", "valid"), true);
validateDir(join(ROOT, "fixtures", "adversarial"), false);

const canaryPath = join(ROOT, "fixtures", "canary-bad.json");
try {
  readFileSync(canaryPath, "utf-8");
  validateFile(canaryPath, false);
} catch {
  log(false, canaryPath, "canary fixture is missing — the CI-gate-silently-broke check requires it to exist");
}

if (failed) {
  console.error("\nValidation failed — see FAIL lines above.");
  process.exit(1);
}
console.log("\nAll fixtures validated as expected.");
