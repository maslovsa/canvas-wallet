# Token UI Studio & Multi-Chain Registry

Live: **https://maslovsa.github.io/canvas-wallet/** (once GitHub Pages is
enabled — see [Deploying](#deploying) below).

An open-source, schema-validated Server-Driven UI (SDUI) authoring tool for
wallet token cards — an editor, a live mobile-wallet simulator, and a
GitHub-PR-based publishing flow, on top of a standard token-list-shaped
registry.

The customization layer (`ui`, `actions`, `widgets`) is intentionally a
fixed, closed vocabulary — never arbitrary code, never arbitrary HTML — so a
token's card can be visually distinctive without becoming a phishing vector.
See [`docs/designs/token-ui-studio.md`](./docs/designs/token-ui-studio.md)
for the full design rationale, and [`CONTRIBUTING.md`](./CONTRIBUTING.md) for
how a token gets added and reviewed.

## Quick start

```bash
git clone git@github.com:maslovsa/canvas-wallet.git
cd canvas-wallet
npm install
npm run dev
```

Open the printed local URL, pick a network and token, and edit the JSON on
the right to see the live simulator and trust-score panel update.

## Deploying

GitHub Pages must be switched to Actions-based deploys once, per repo:
**Settings → Pages → Source: "GitHub Actions"**. After that, every push to
`main` that passes `validate-registry.yml` triggers `deploy.yml` and
publishes to the URL above automatically — no manual deploy step.

## Project layout

```
registry.schema.json        Canonical schema — single source of truth
src/generated/               TypeScript types generated from the schema
src/registry-client/         Fetch, cache, governance-check, version-gate
src/widgets/                 Widget renderer + action executor (type→handler)
src/trust-score/              Advisory checks: contrast, homograph, domain-mismatch
src/share-link/                Compressed URL-fragment share links
src/deploy-flow/               GitHub PR-prep / download fallback
src/icon/                       Icon loading with a domain allowlist
src/ui/                          Sidebar, phone-frame simulator, editor
fixtures/                        Valid + adversarial registry fixtures for CI
scripts/validate-fixtures.ts     Shared validator (used locally and by CI)
.github/workflows/               validate-registry.yml (PR gate), deploy.yml
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm test` | Vitest unit + integration tests |
| `npm run validate:fixtures` | Schema + icon-allowlist check against `fixtures/` (same check CI runs) |
| `npm run build` | Type-check + production build |
| `npm run test:e2e` | Playwright smoke test |

## Status

Built from an approved design doc + CEO scope-review + eng review (see
`docs/designs/`). One known open item: CI deploy currently restricts
triggers to the default branch only; PR-preview deploys and an automated
post-deploy smoke check were surfaced during review but left as an explicit
open decision — see the design doc's Section 9 notes.
