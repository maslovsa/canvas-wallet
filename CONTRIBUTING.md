# Contributing to Token UI Studio

## What this project is

A schema-validated, PR-reviewed registry of token metadata plus a
Server-Driven UI (SDUI) customization layer — a fixed, closed vocabulary of
widgets and actions for wallet token cards. The whole point is that a token's
visual customization can never be arbitrary code or arbitrary HTML: it's
always one of a small set of pre-approved widget/action types, checked by a
schema, reviewed by a human before it ships.

## The Gallery — multiple lists, not one registry

The Studio's main page is a Gallery (inspired by [tokenlists.org](https://tokenlists.org/)):
each card is one **list** — a full `registry.schema.json`-shaped file under
[`public/lists/`](./public/lists/) — showing its name, description, token
count, and network count. Opening a card takes you into the familiar
sidebar/simulator/editor view scoped to just that list. There's also an
"Upload your own list" option (reads a local file client-side, nothing is
uploaded anywhere) and, for power users, a direct `?registry=owner/repo`
URL parameter that points the Studio at an external GitHub repo's
`registry.json` instead (the multi-registry client — see below).

### Adding a token to an existing list

1. Fork this repo.
2. Edit the relevant file under `public/lists/` (e.g.
   [`public/lists/trust-wallet-showcase.json`](./public/lists/trust-wallet-showcase.json))
   — add your token under the right network's `tokens` array, or edit an
   existing one. Follows [`registry.schema.json`](./registry.schema.json).
   The Studio itself (`npm run dev`) gives you live validation, a
   trust-score panel, and a rendered preview while you author it — the app
   loads these exact files at runtime (same-origin, no backend), so what
   you see locally is what ships.
3. Open a pull request.

### Adding a whole new list

1. Add `public/lists/{your-list-id}.json` (schema-shaped).
2. Add an entry to [`public/lists/manifest.json`](./public/lists/manifest.json)
   with `id`, `name`, `description`, and `file` — this is what makes it show
   up as a Gallery card. `manifest.json` itself is NOT registry-schema-validated
   (it's a list-of-lists, not a Registry).
3. Open a pull request — CI validates the new list file same as any other.

### Token and network logos

Add a `logo` field (a direct image URL) to a token to show its logo on the
card — subject to the same domain allowlist as widget icons
(`src/icon/domain-allowlist.ts`), enforced both client-side and by
`scripts/validate-fixtures.ts` in CI. A token with no `logo` falls back to a
lettered avatar rather than a blank space — don't invent a fake logo URL
just to fill it in.

Network branding (name → logo) is looked up from
[`public/networks.json`](./public/networks.json), deliberately a separate
file from the token registry since it's presentation metadata, not part of
the schema. Add an entry there (with `synonyms` for alternate spellings) if
you're adding a new network — the lookup never guesses at a match.

Each list is a single shared file rather than one-file-per-token, so two PRs
touching different tokens in the same list at the same time can conflict on
merge — if that becomes a real problem as a list grows, splitting that list
into per-token files is tracked as a possible follow-up, not done today.

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
npm run validate:fixtures  # the same check CI runs against public/lists/*.json + fixtures/
npm run build             # type-check + production build
```

## Schema changes

`registry.schema.json` is the single source of truth. TypeScript types under
`src/generated/` are generated from it (`npm run gen:schema-types`) —
never hand-edit that generated file. If you change the schema, add both a
`fixtures/valid/` and `fixtures/adversarial/` case exercising the change, and
never touch `fixtures/canary-bad.json` — it exists specifically to always
fail, as a check that the validator itself hasn't silently broken.
