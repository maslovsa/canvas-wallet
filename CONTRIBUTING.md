# Contributing to Token UI Studio

## What this project is

A schema-validated, PR-reviewed registry of token metadata plus a
Server-Driven UI (SDUI) customization layer — a fixed, closed vocabulary of
widgets and actions for wallet token cards. The whole point is that a token's
visual customization can never be arbitrary code or arbitrary HTML: it's
always one of a small set of pre-approved widget/action types, checked by a
schema, reviewed by a human before it ships.

## Adding or editing a token

1. Fork this repo.
2. Edit [`public/registry.json`](./public/registry.json) — add your token
   under the right network's `tokens` array, or edit an existing one.
   Follows [`registry.schema.json`](./registry.schema.json). The Studio
   itself (`npm run dev`) gives you live validation, a trust-score panel,
   and a rendered preview while you author it — the app loads this exact
   file at runtime (same-origin, no backend), so what you see locally is
   what ships.
3. Open a pull request.

This is a single shared file rather than one-file-per-token, so two PRs
touching different tokens at the same time can conflict on merge — if that
becomes a real problem as the registry grows, splitting into per-token files
is tracked as a possible follow-up, not done today.

## What happens to your PR

```
Your PR
  │
  ▼
CI: schema validation (.github/workflows/validate-registry.yml)
  │   Checks: JSON Schema compliance, icon domain allowlist,
  │   schemaVersion recognized. FAILS the PR if any check fails —
  │   an unknown widget.type or action.type is a hard CI failure here,
  │   even though the live Studio silently ignores unknown types at
  │   render time (that's a rendering-robustness rule, not an
  │   authoring rule — CI holds contributors to the full schema).
  ▼
Human review (CODEOWNERS-required approval)
  │   Checks things schema validation can't: is the badge text
  │   misleading? Does the icon look like it's impersonating another
  │   token? Does an action URL that matches the schema still smell
  │   wrong? The trust-score panel's advisory findings (contrast,
  │   homograph, domain-mismatch) are hints for THIS step, not
  │   enforced anywhere in CI.
  ▼
Merge to main → automatic build + deploy to GitHub Pages
```

## Review model — an honest limitation

The CODEOWNERS file requires an approval from a named reviewer before any
registry change merges. On a young or single-maintainer repo, that reviewer
may be the same person opening most PRs — which makes this a self-approval
gate in practice, not independent review. That's a real, acknowledged gap:
CI catches schema violations; it does not catch a maintainer approving their
own bad judgment call. If you're evaluating whether to trust a specific
instance of this registry, check who's actually listed in `.github/CODEOWNERS`
and whether more than one person is active there — don't assume "has
CODEOWNERS" alone means independent review happened.

## Trust-score panel — what it does and doesn't catch

The editor's trust-score panel runs four static, client-side checks: WCAG
contrast, IDN/punycode homograph detection (a narrow same-script check, not
full Unicode confusables detection), a website/action-domain mismatch flag,
and a widget-count sanity check. All four are **advisory only** — none of
them block CI or require a fix before merge. The domain-mismatch check in
particular is trivially gameable by a coordinated fake `website` + fake
action URL; it's a signal for the human reviewer, not a real defense.

## Multi-registry client — governance isn't automatic

If you point the Studio at a registry other than the canonical one (via the
registry URL parameter), the Studio does a best-effort check for branch
protection and a CODEOWNERS file on that repo and shows a warning if it
can't confirm either. That warning is informational, not a guarantee — the
Studio has no way to verify a third-party registry's actual review practices
beyond what GitHub's API can report.

## Running locally

```bash
npm install            # also generates src/generated/registry-schema.d.ts
npm run dev             # Vite dev server
npm test                 # Vitest unit + integration tests
npm run validate:fixtures  # the same check CI runs against public/registry.json + fixtures/
npm run build             # type-check + production build
```

## Schema changes

`registry.schema.json` is the single source of truth. TypeScript types under
`src/generated/` are generated from it (`npm run gen:schema-types`) —
never hand-edit that generated file. If you change the schema, add both a
`fixtures/valid/` and `fixtures/adversarial/` case exercising the change, and
never touch `fixtures/canary-bad.json` — it exists specifically to always
fail, as a check that the validator itself hasn't silently broken.
