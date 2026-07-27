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

### Issuer / country badge

A token can carry an optional `issuer: { name?, country? }` (see
`registry.schema.json`) — `country` is an ISO 3166-1 alpha-2 code, shown as a
flag next to the issuer name in the card header. Omit `country` entirely for
a decentralized protocol/foundation with no single jurisdiction (e.g.
Ethereum, Bitcoin) — the client shows a globe icon in that case and never
guesses a country from the issuer name. None of the bundled lists populate
`issuer` yet; it's a capability, not backfilled data.

### The `history` widget is illustrative only

`{ "type": "history" }` renders a small, client-generated "recent activity"
feed (received/sent, each capped at $100 equivalent) — see
`src/widgets/history.ts`. It is never real transaction data and involves no
wallet or backend; the amounts are seeded from the token's own id so the
same token shows a stable feed across re-renders instead of reshuffling on
every keystroke.

### Verifying a token before adding it — decimals, checksum, logo

Don't hand-copy `decimals` from another network's contract with the same
symbol, and don't hand-guess an EVM address's checksum casing for the Trust
Wallet logo URL — both are easy to get wrong silently. Run:

```bash
npm run verify:token -- --network ETH --address 0xdAC17F958D2ee523a2206206994597C13D831ec7
npm run verify:token -- --network BSC --address 0x55d398326f99059fF775485246999027B3197955
npm run verify:token -- --network TRON --address TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
npm run verify:token -- --network SOLANA --address EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
```

(`scripts/verify-token.ts` — not a CI gate, an author-time aid.) It fetches
`decimals()`/`symbol()` live via a public RPC (EVM), TronScan (TRON), or
`getTokenSupply` (Solana), computes the EIP-55 checksum for EVM addresses,
builds the Trust Wallet logo URL for that exact checksummed
address/contract/mint, and does a live HTTP check on it — so you find out
*before* committing a `logo` field that 404s, not after a reviewer clicks it.

**Confirmed finding (2026-07-27), the reason this script exists:**
Binance-Peg USDT and USDC on BSC report **18 decimals on-chain**, not the 6
their Ethereum contracts use — verified live via `eth_call`, not assumed
from the symbol. `public/lists/aegis-super-list.json` and
`public/lists/paras.json` both carry a `USDT`/`USDC` entry on both Ethereum
(6 decimals) and BSC (18 decimals) as a result — see those files' token
`description` fields for the specific contracts. Getting this wrong doesn't
fail schema validation (both are valid integers), it just silently mis-renders
every balance shown against that token.

Those two lists are also worked examples of the whole verification loop:
`aegis-super-list.json` sources its token set from a private KYT platform's
own network whitelists (real contracts already used in production risk
scoring, not hand-picked); `paras.json` sources its stablecoin set from
[Pharos Watch](https://pharos.watch)'s public per-coin pages. In both cases
every single contract/mint was independently re-verified with this script
before the file was written, rather than trusting the source's address
formatting or decimals claim as-is.

### Background images

`ui.background` supports `solid`, `gradient`, or `image`
(`{ "type": "image", "url": "...", "overlayColor": "#..." }`, cover-fit
behind the card). This was originally excluded entirely (see git history) as
a tracking/phishing vector — an arbitrary external image loading on every
card view can beacon per-view, or dress up a fake token to look like a
trusted brand. It's back, re-scoped: `image.url` is subject to the exact
same domain allowlist as `logo` and widget icons, enforced both client-side
(reuses `src/icon/icon-loader.ts` — same size cap and fetch/fallback
behavior as any other icon) and by `scripts/validate-fixtures.ts` in CI. A
free-form *tiled pattern* from an arbitrary domain remains excluded — see
`fixtures/adversarial/image-pattern-excluded.json`. `overlayColor` is
required to render immediately (before the image loads) and as the fallback
if the URL is off-allowlist or the fetch fails — a background must never
silently go blank.

### The price_chart widget — the one widget with a live network call

Every other widget/action is rendered from data already in the registry
JSON — no network call at authoring time or render time. `price_chart` is
the deliberate exception: it fetches public, unauthenticated historical
price data from CoinGecko's `/coins/{id}/market_chart` endpoint, keyed by a
schema-regex-constrained `coingeckoId` (`^[a-z0-9-]+$` — a CoinGecko coin
id like `"tron"`, not a ticker symbol; this also means it can only ever be a
path segment, never a URL/query injection). No API key is used or shipped —
none is needed for this endpoint at reasonable, human-driven request
volumes, and a static GitHub Pages site can't keep a client-side key secret
anyway (anyone can read it out of the shipped JS bundle). If the fetch fails
(offline, rate-limited, unrecognized id), the widget falls back to a
generated placeholder sparkline, always visibly captioned "Sample chart —
live price unavailable right now." — it's never presented as real market
data. See `src/widgets/price-chart.ts`.

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
npm run verify:token      # author-time decimals/checksum/logo check for one token — see above
npm run build             # type-check + production build
```

## Schema changes

`registry.schema.json` is the single source of truth. TypeScript types under
`src/generated/` are generated from it (`npm run gen:schema-types`) —
never hand-edit that generated file. If you change the schema, add both a
`fixtures/valid/` and `fixtures/adversarial/` case exercising the change, and
never touch `fixtures/canary-bad.json` — it exists specifically to always
fail, as a check that the validator itself hasn't silently broken.
