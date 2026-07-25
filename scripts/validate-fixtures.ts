#!/usr/bin/env node
// Shared validator: run locally (`npm run validate:fixtures`) and by CI
// (.github/workflows/validate-registry.yml) — single canonical schema
// source, never two independently maintained validator implementations
// (CEO review Section 5 finding).
//
// Validates:
//  1. public/registry.json — the repo's REAL, PR-editable registry (see
//     CONTRIBUTING.md) — passes schema validation. This is the actual
//     production gate; everything else below is test fixtures.
//  2. Every fixtures/valid/*.json passes schema validation.
//  3. Every fixtures/adversarial/*.json is REJECTED by schema validation —
//     these are deliberately malformed (unknown widget/action type, bad
//     schemaVersion, etc.) and asserting they fail is what makes this a
//     real regression test for the validator itself.
//  4. fixtures/canary-bad.json specifically must always fail — if it ever
//     passes, the CI schema gate itself has silently broken (CEO review
//     Section 8 finding).
//  5. Every icon URL referenced anywhere in public/registry.json or
//     fixtures/valid/*.json is on the domain allowlist (enforced here, not
//     just client-side — design doc's resolved Open Question on icon policy).
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

function collectIconUrls(data: unknown): string[] {
  const urls: string[] = [];
  function walk(node: unknown): void {
    if (node && typeof node === "object") {
      for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
        if (key === "icon" && typeof value === "string" && value.startsWith("http")) {
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
    for (const url of collectIconUrls(data)) {
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

function validateDir(dir: string, expectValid: boolean): void {
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  } catch {
    return;
  }
  for (const file of files) {
    validateFile(join(dir, file), expectValid);
  }
}

validateFile(join(ROOT, "public", "registry.json"), true);
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
