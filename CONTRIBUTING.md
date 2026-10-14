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

**Shareable links.** The address bar mirrors what is open, so any view can be shared:
`?list=<list id>` (the file name under `public/lists/`, e.g. `aegis-super-list`), `&network=<name>` (the
network filter, e.g. `Tron`) and `&token=<symbol>` (the open asset, e.g. `USDT`). Names are matched
case-insensitively; an unknown list shows a message and the gallery, an unknown network or asset falls
back to the default. Other query parameters are preserved. Example:
`?list=aegis-super-list&network=Tron&token=USDT`.

**Destination for a demo.** Add `&to=<address>` and the link opens the Send screen for that token with the recipient
already in the To field (validated and risk-checked exactly as if typed), e.g.
`?list=aegis-super-list&network=Tron&token=USDT&to=TMuA6YqfCeX8EhbfYEg5y7S4DqzSJireY9`. While you are on Send the address
bar keeps the recipient currently in the field (and Share > Copy link copies it); leaving Send drops it. A token that
cannot be sent, or a link with no token, ignores `to`.

**Phone mode.** On a phone the same link opens as the bare phone interface: no sidebar, editor or toolbar, edge to
edge, with iOS or Android chrome and light or dark taken from the device. A desktop can ask for it with
`&view=phone` (the phone drawn as a device, centred; Share > Copy phone link adds it), and `&view=studio` forces the
full studio even on a phone. The rule lives in `src/share-link/phone-mode.ts`: a viewport up to 640 px, or a touch
device up to 900 px, counts as a phone.

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

### List logos in the Gallery

A list may carry a `logo` in `public/lists/manifest.json` (e.g. `"logo": "list-logos/uniswap.png"`): a small png, svg or
webp under `public/list-logos/` (at most 100 KB; `npm run validate:fixtures` checks it) drawn in a tile in the corner of
the card. The logos shown are taken from each source's own site (Trust Wallet, Uniswap, Aegis, Pharos Watch) and are
trademarks of their owners, used here only to identify where a list comes from.

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

**Schema versions.** `1.1.0` adds the `send` action (`{"type": "send"}`, no parameters: it opens the
built-in Send screen, and the recipient and amount are never prefilled by a registry). A registry that
uses `send` must declare `schemaVersion` `1.1.0` or later; `npm run validate:fixtures` enforces this
(see `fixtures/semantic-invalid/`). `1.2.0` adds the `receive` action (`{"type": "receive"}`, no parameters: it opens the Receive dialog
with the network's address, a QR code and a Copy button); a registry that uses it must declare `1.2.0` or
later. `1.0.0` registries stay valid.

**Receive dialog and the demo addresses.** Tokens on Ethereum, BNB Smart Chain and Tron can opt in with a
`receive` action. The addresses shown are random demo stubs, keyed by network name in
`public/receive-addresses.json` (BNB Smart Chain reuses the EVM address); no private key exists for them
and the dialog says "Demo address, not for real funds". `STUB_ETH` and `STUB_TRON` in the local `.env` hold
the same two values for local work, but a static site cannot read `.env`, so the published copy is the JSON
file. A network without an entry shows an in-phone "not available" notice. Keep the stubs obviously fake:
never put a real wallet address there.

**Send screen and the risk seed.** Tokens on Tron can opt in with a `send` action (and a widget that
references it). The built-in Send screen only handles Tron (`NATIVE` and `TRC20` tokens) and shows an
in-phone notice for anything else. Address risk answers come from `public/risk-seed.json`, a small list
of demo addresses produced from Aegis `POST /v2/screen` results. An entry stores only `network`,
`address`, `level` (`clear` or `caution`), an optional `label` (allowed on `clear` entries only, because
an owner name on a risky address can reveal the reason) and `checkedAt`. Never store scores, reasons or
flags: `npm run validate:fixtures` rejects them. On a `caution` entry only the VASP identity may appear (the name from `verdict.entity`, and a logo whose URL path does not name a risk reason), never the raw `verdict.label`. Every Tron address of the address book must have an entry here, or picking it ends in "Couldn't verify": CI fails if one is missing and warns when one is older than 90 days. A `clear` entry with a label may also carry `logo` (an https `cdn.jsdelivr.net` `.png` URL, the VASP logo from Aegis `verdict.entity.logo_url`). Entries older than 90 days are ignored at runtime, so
re-check them with Aegis before they expire. **Alert threshold.** The risk-check Worker answers `caution` when Aegis `risk_score` is 50 or more, when the level is `sanctioned`, or on any sanctions-list match; below 50 the address is `clear`. The reason is never shown or sent to the browser. A clear address's owner is `verdict.entity.name`, else `verdict.label`, else the admin-curated "VASP entity defaults" row of `verdict.labels[]` (Aegis often names an exchange only there); its logo is the entity's own, else the file for that exchange in `src/send/known-entities.ts` (a table checked against the entity registry). A risky address shows the VASP identity only (`verdict.entity`, or the same operator-curated "VASP entity defaults" row of `labels[]`, whatever its category) with the exchange logo when the table has one and its path names no reason; never `verdict.label`, the sanctions lists, blacklists or traces, which can name a person or state a reason. Improving this mapping needs a new cache key version in the Worker (verdicts are cached forever).

**Wording rule for risk results: no advice.** The Send screen only states what the screening data shows
("Risk signals found for this address", "No risk signals found", "Couldn't verify this address") and says
it is information, not advice. Do not write "recommend", "safe", "dangerous", "avoid" or "should" in this
UI. A VASP's name and logo appear on clear results and, for a risky address, only when Aegis has a corroborated VASP
(`verdict.entity`), above the risk line; a risky address never shows a raw `verdict.label` (it can be a sanctioned
person), a category or a score. `e2e/send-risk-examples.spec.ts` regenerates example screenshots in
`docs/designs/send-risk-screens/`.

Addresses that are not in the seed show "Couldn't verify
this address" until the live Worker is connected.

**Address book.** The small book button at the end of the Send screen's To field opens a bottom sheet (about two thirds
of the screen; dismiss with Esc, the close button, a tap on the dimmed area or by dragging it down) with the saved
recipients for the network being sent on; choosing one fills the field exactly as typing would (so it is validated and
risk-checked). The list is `public/address-book.json`: `{"version": 1, "entries": [{"network": "TRON" | "ETH" | "BSC",
"address": "...", "comment": "..."}]}`, at most 200 entries, comments up to 80 characters that name the owner ("Binance hot wallet"), never a risk reason: CI refuses words such as sanctions, OFAC, blacklist, frozen or mixer. `npm run validate:fixtures`
checks every address for its network (Tron Base58Check; EVM `0x` + 40 hex, EIP-55 when mixed case), rejects duplicates and
extra keys. Send is Tron-only for now, so only the `TRON` entries are shown; `ETH` and `BSC` entries wait for EVM Send.

**CI gates.** Every pull request and every push to `main` runs `npm test` (a push to `main` deploys, so
the tests run before the build). After the build, `npm run check:dist` fails the deploy if `dist/`
contains secret-shaped text: this repository is public and the built site is world-readable.

## Risk-check Worker (Send window)

A static GitHub Pages site cannot hold a secret, so address risk checks go through a small Cloudflare Worker in `worker/` that holds the Aegis key. Design, limits and decisions: `docs/designs/send-window-plan.md`.

**What it does.** `POST /check {"network":"TRON","address":"T..."}` returns exactly `{"level":"clear","label"?}`, `{"level":"caution"}` or `{"level":"unknown"}`: never a score, a reason or flags, and a label only with a clear result. It validates the address (the same `src/send/tron-address.ts` the phone uses) before any paid call, caches verdicts in KV (24 h; a failed check 60 s), and enforces a per-visitor hourly limit and a daily budget with a Durable Object counter. If the cache or the counter is down, or the kill switch is off, it answers `unknown` without calling Aegis (fail closed). Each live check costs 0.1 Aegis credit; a repeat of the same address and day is free (Idempotency-Key).

**Secrets and settings.**
- `AEGIS_API_KEY` (secret): a dedicated key with a monthly cap. Never put it in the repo, `.env` of a deployed build, a `VITE_*` variable or the browser bundle (`npm run check:dist` fails the deploy on `aeg_...` text).
- `RISK_ENABLED` (secret, not a variable, so Git deploys do not overwrite it): live checks run only when it equals `true`. Anything else, or a missing value, means seed-only.
- `DAILY_BUDGET`, `PER_VISITOR_PER_HOUR`, `ALLOWED_ORIGIN` (comma-separated exact origins), `AEGIS_BASE_URL` live in `worker/wrangler.toml`; changing them is a normal commit.
- Set secrets in the Cloudflare dashboard (Worker > Settings > Variables and Secrets) or with `npx wrangler secret put <NAME>`.

**Deploy.** The repo is connected to Cloudflare Workers Builds (root directory `worker`), so a push to `main` redeploys the Worker. Recommended build settings: build command `npm test` (tests run before the deploy), deploy command `npx wrangler deploy`, and branch builds for non-production branches switched off. Manual deploy: `cd worker && npx wrangler deploy` with `CLOUDFLARE_API_TOKEN` set. Rollback: `npx wrangler rollback`. Logs: `npx wrangler tail`.

**Site wiring.** Set the public repo variable `VITE_RISK_PROXY_URL` (GitHub: Settings > Secrets and variables > Actions > Variables) to the Worker URL; the Pages build picks it up on the next deploy. Empty or unset means a seed-only site. Kill switch: set the `RISK_ENABLED` secret to anything but `true`.

**Local development.** Copy `worker/.dev.vars.example` to `worker/.dev.vars` (gitignored), fill in a key, and run `npx wrangler dev` inside `worker/`; the example also allows the Vite dev origin. Run `npx vitest run tests/worker-check.test.ts` for the Worker tests.

### Free-plan budget (the Worker must stay on Cloudflare Free)

Staying free means never upgrading the account to Workers Paid and keeping usage under the free quotas. Free
plans are never billed for overage: past a quota Cloudflare just starts refusing requests until the next UTC day.
Quotas as documented when this was written (re-check at developers.cloudflare.com/workers/platform/limits):
100,000 Worker requests/day, KV 100,000 reads and 1,000 writes/day, SQLite Durable Objects 100,000 requests/day,
Workers Builds 3,000 build minutes/month.

| Path | Cost per request | Bound |
| --- | --- | --- |
| Bad origin, bad JSON, invalid address | none (rejected before KV and the Durable Object) | n/a |
| Cached verdict | 1 KV read | kept forever (no expiry); to drop every cached verdict bump the key version in `worker/src/index.ts` |
| Live check | 1-2 DO requests, 1 KV write, 1 Aegis call | `DAILY_BUDGET` = 30/day, so at most 30 KV writes (quota 1,000); each address is written once, ever |
| Price chart (`GET /price`) | 1 Worker request, 0 KV; CoinGecko (DefiLlama as fallback) only on a Cache API miss | cached 15 min per id; 502 on an upstream error (the phone shows its sample chart) |
| Refused by a limit (flood) | 0 DO requests after the first refusal: the isolate remembers it for 60 s | per-visitor 10/h, global budget |
| Git build of `main` | about 1 build minute (`npm test`) | quota 3,000/month; branches other than `main` do not build |

Settings that keep it free: no routes or custom domains, no Logpush or other paid add-ons, `[observability]`
off, SQLite-backed Durable Object class (`new_sqlite_classes`). Check the dashboard (Account > Billing) shows
"Workers Free" and has no payment method before relying on this.
