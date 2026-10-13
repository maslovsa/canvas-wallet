# Plan under review: "Send" window with live address risk screening

Reviewed by /plan-ceo-review on 2026-10-12/13 | Branch: main | Repo: maslovsa/canvas-wallet
Source: user message (RU), summarized. Review depth: implementation-ready. Mode: SCOPE REDUCTION (D2).

## The ask (as stated by the user)

1. A token card gets a Send button. It opens a wallet-style send window inside the phone simulator.
2. Window fields: recipient address, amount in the token, a Send button. As universal as possible; look at how real wallets do it.
3. Simulated network fee. Possibly a real API. Tron first, Ethereum later. Find which API gives the fee for sending this token on these networks.
4. While the user types the address, call a specific endpoint with a key kept in GitHub Secrets. Key must not be abusable; demo use only. Result: risk score + ownership label for the address.
5. If risk is high, show a popup. Not the score. A message that we do not recommend sending to this address. No reasons disclosed.

## Approved design (what gets built)

Tron-only Send flow inside the phone simulator. Token lists opt in with a new SDUI action `{"type":"send"}` (no parameters). It opens a built-in Send screen: recipient address, amount (BigInt decimal math, Max), live keyless TronGrid fee line with a labeled estimate fallback, and a simulated Send.

Risk screening is hybrid: a CI-validated static seed answers instantly for known demo addresses; any other valid address goes to a separate Cloudflare Worker that holds the Aegis key as a Worker secret, enforces lean abuse controls, and returns only `{level, label?}`. Caution shows a popup (no score, no reason, wording from D12) with Cancel and Send anyway. A failed check is "Couldn't verify this address" and never reads as safe or dangerous. Send is held up to 15 s while a live check runs, then treated as unavailable.

Schema moves to 1.1.0 (gate accepts 1.0.0 and 1.1.0). A post-build script fails the deploy on secret-shaped text in `dist/`. Worker deploys are manual (documented); no GitHub secret is used. The only GitHub setting is the public repo variable `VITE_RISK_PROXY_URL`.

Honest size correction: D2 said "about 20 changed files". Counting tests, fixtures, docs and the Worker, the real count is about 38 (23 new, 15 edited). The mode recommendation does not change (both are over the 15-file line), but the build is roughly twice what D2 implied: human ~8-10 days, CC+gstack ~5 hours (see tasks).

## Step 0 findings (evidence, not opinion)

| # | Finding | Evidence |
|---|---|---|
| F1 | A key in GitHub Secrets cannot reach the browser safely. Secrets exist only inside Actions runs; anything compiled into the Vite bundle is public. | CONTRIBUTING.md:138-141 says this verbatim for price_chart. Prior CEO review dropped the PAT option for the same reason (docs/designs/token-ui-studio.md, T3). |
| F2 | (SUPERSEDED by A1: the plan now calls the synchronous `POST /v2/screen`, 0.1 credit, no polling.) The Aegis endpoint was `POST /v2/inspect-address` then poll `GET /v2/inspect/{session_id}/result`. Always 202 first. Typical 5-30s, up to ~115s. Charged ~2 credits per completed check. Per-key rate limit (429). Per-key monthly cap (`monthly_cap_exceeded`). Networks ETH, BSC, TRON. | aegis-platform/docs/clients/msp-inspect-address-client.md sections 2, 4, 4a, 9 |
| F3 | Aegis docs say the bearer key must live on the integrator's backend only, never in a browser. | same doc, section 2 |
| F4 | "Call as the user types" cannot work as stated: async + paid + capped. Must trigger once, on a complete checksum-valid address. | F2 |
| F5 | The ownership label is `final.vasp_attribution`, filled only for confirmed licensed exchanges. Most addresses return null. (A1/E7: the label now comes from `/v2/screen` `verdict.label`, may be null, and leaves the Worker only for a clear result.) | same doc, `final` field table |
| F6 | Aegis `reason` is "factual description without instructions to action"; disclaimer says "Not a recommendation or legal advice". A UI line "we do not recommend sending" turns an information signal into a recommendation. `insufficient_data` means unknown, never safe. | same doc, sections 1 and 5 |
| F7 | Tron fee needs NO secret. TronGrid answers keyless with `access-control-allow-origin: *`. Live probe 2026-10-12: `getEnergyFee=100` SUN, `getTransactionFee=1000` SUN, `getCreateAccountFee=100000` SUN. USDT-TRC20 transfer ~65,000 energy (recipient holds USDT) or ~130,000 (fresh recipient), ~345 bandwidth. | curl probe; GetBlock, Coinsdo, Tatum docs |
| F8 | Registry JSON is closed-vocabulary (`additionalProperties:false`, oneOf widgets/actions). There is no `send` action or widget. | registry.schema.json lines 162-211 |
| F9 | Existing pattern to copy: keyless live call, cache by key, labeled fallback, mockable `fetchImpl`. | src/widgets/price-chart.ts, tests/price-chart.test.ts |
| F10 | `.env` holds a local CoinGecko key. Gitignored, never tracked, not in dist, not VITE_-prefixed. Not a leak today. Rule to keep: never prefix a secret `VITE_`. | git check-ignore, grep dist |
| F11 | With a registry-driven `send` action a token on ANY network can opt in, but v1 sends only on Tron. The built-in screen must refuse unsupported networks explicitly. Also SUPPORTED_SCHEMA_VERSIONS is {"1.0.0"} and 7 lists declare it. | src/registry-client/schema-version-gate.ts; public/lists/*.json |

## Threat model (Section 3)

| # | Threat | Likelihood | Impact | Mitigated |
|---|---|---|---|---|
| T1 | Aegis key extracted from the bundle | High if embedded | High | Yes: Worker secret (R1, R2) + dist secret check (R11) |
| T2 | Script burns the paid budget by calling the Worker | High | High | Yes: lean limits + daily budget + provider cap (R4); KV counters not atomic, owner must prove an atomic limiter |
| T3 | Registry `send` action prefills an attacker recipient/amount | Medium | High | Yes: no parameters (R8) |
| T4 | Address poisoning / look-alike addresses | Medium | Medium | Partly: no address book (S3 not added); show the full address at confirm |
| T5 | Demo used as an oracle for "is my address flagged" | Medium | Medium | Partly: coarse reply, rate limits |
| T6 | Seed edited by PR to mark a bad address clear | Low | High | Partly: CODEOWNERS (self-review gap documented); runtime ignores seed entries older than 90 days |
| T7 | Label rendered as HTML | Low | High | Yes: textContent, length cap, Worker sanitizes |
| T8 | CORS `*` on the Worker | Medium | Medium | Yes: exact origin allowlist |
| T9 | Privacy: typed addresses sent to Worker and Aegis | Medium | Low-Medium | Yes: UI line "Address is checked by Aegis"; logs keep a short hash prefix only |
| T10 | Dependencies | Low | Medium | OK: no new browser dependency; wrangler as dev tool |
| T11 | No CSP on index.html | Low | Medium | Not blocking (no third-party script after D8) |

## Decision ledger

| ID and owner | Contract and evidence | Current | Proposed | Status | Exact approval and scope |
|---|---|---|---|---|---|
| R1 risk-check custody (Aegis API key + abuse control) | F1, F2, F3, F4. Key never in browser. Provider-side monthly cap is the hard backstop. | Hybrid: static curated seed answers first, Worker proxy (key as Worker secret) for arbitrary addresses; proxy strips score and reasons | (none pending) | approved | D1 answer 2026-10-12: "Hybrid: static seed + Worker (recommended)". Scope: custody and check architecture only. Worker host (R2), trigger policy (R4), failure policy (R5), copy (R6) remain open. |
| R2 proxy host (where the risk proxy runs) | F1; aegis-platform owns ledger, caps, limiter; Aegis docs: key server-side only | Cloudflare Worker, separate from production; key as a Worker secret set by hand (no GitHub Secrets) | (none pending) | approved | D4 answer 2026-10-13: "Cloudflare Worker, separate from production (recommended)". Scope: host choice only; abuse controls (R4) and failure policy (R5) remain open. |
| R3 Send entry point | F8, F11. The user chose registry-driven Send; the phishing-surface risk is carried into Section 3 as R8. | New SDUI `send` action type in registry.schema.json (token opts in via its actions map and an action_group/banner item); Send screen opens the built-in flow | (none pending) | approved | D5 answer 2026-10-13: "New SDUI `send` action type in the schema" (user chose option B over the recommended built-in row). Scope: the new action type only; payload fields (R8) and schemaVersion handling (R9) remain open. |
| R4 abuse and trigger controls | F2, F4, T2, T5 | Lean: validate locally, debounce, cache per network+address in KV, in-flight dedupe, per-visitor limit, global daily budget with breaker (free GET /v2/balance), fail closed when KV is down, provider monthly cap; NO Turnstile | (none pending) | approved | D8 answer 2026-10-13: "Lean: limits and budget, no Turnstile (recommended)". Scope: abuse and trigger controls only. Turnstile is a documented upgrade path, not a TODO. |
| R5 failure and caution policy | F6; Section 2 map | Warn and allow: CAUTION shows a popup (Cancel primary, Send anyway secondary, no score, no reason); UNAVAILABLE shows "Couldn't verify this address" and Send stays allowed; unavailable never reads as safe or dangerous | (none pending) | approved | D6 answer 2026-10-13: "Warn and allow (recommended)". Scope: behavior of Send per result state only; popup wording (R6) remains open. |
| R6 caution popup wording | F6; user ask #5; Aegis doc: final.reason is factual, disclaimer "not a recommendation or legal advice"; the integrator owns the action policy | Title "We don't recommend sending to this address"; line "Based on Aegis data at the time of the check. Details aren't shown."; no score, level, reason or flag text; buttons per R5 | (none pending) | approved | D12 answer 2026-10-13: "Your wording plus a data-source line (recommended)". Scope: popup text only. |
| R7 network scope | user instruction (RU): Tron now, Ethereum to think about later | none | Tron only (TRX + TRC20); EVM deferred | deferred | User's own message: "focus on Tron, think about Ethereum later". Scope: EVM fee + risk deferred to TODOS.md. |
| R8 `send` action payload | F11, T3. A registry-supplied recipient/amount/memo would let a PR prefill an attacker address. | `send` action carries NO parameters (type only); recipient and amount come only from the user; additionalProperties false rejects extras | (none pending) | approved | D7 answer 2026-10-13: "No parameters: type only (recommended)". Scope: payload of the `send` action only. |
| R9 schemaVersion for the new action | schema-version-gate.ts supports only "1.0.0"; 7 lists declare 1.0.0 | Bump to 1.1.0; SUPPORTED_SCHEMA_VERSIONS = {1.0.0, 1.1.0}; only lists that use `send` declare 1.1.0; 1.2.0 is refused | (none pending) | approved | D11 answer 2026-10-13: "Bump to 1.1.0, gate accepts both (recommended)". Scope: version number and gate only. |
| R10 Send while the check is running | Section 4. Live checks take 5-30s (F2). | Hold Send while CHECKING; after a 15 s soft timeout the state becomes UNAVAILABLE and Send is allowed; an arriving caution result opens the popup | (none pending) | approved | D9 answer 2026-10-13: "Hold Send up to 15 s, then treat as unavailable (recommended)". Scope: Send gating during CHECKING only. |
| R11 build guard against a secret in dist/ | F10, T1 | scripts/check-dist-secrets.ts runs after the build in deploy.yml and locally; fails on VITE_-prefixed secret names, bearer-shaped strings and the Worker secret name | (none pending) | approved | D10 answer 2026-10-13: "Add scripts/check-dist-secrets.ts to the deploy build (recommended)". Scope: the build guard only. |
| S1 EVM fee + risk | same as R7 (needs keccak256 for EIP-55) | none | Deferred to TODOS.md | deferred | Same user instruction as R7. |
| S2 fee tiers (slow/normal/fast) | not part of the user's ask; reviewer addition | none | Not added | declined | Never in scope; recorded under NOT in scope as not requested. |
| S3 address book / recent recipients | not part of the user's ask; reviewer addition | none | Not added | declined | Never in scope; recorded under NOT in scope as not requested. |
| S4 review + receipt screens after Send | not part of the user's ask; reviewer addition | none | Not added | declined | Never in scope; recorded under NOT in scope as not requested. |
| S5 Send as registry/SDUI action | F8 | Folded into R3 and decided there | (none pending) | approved | Same as R3 (D5): new SDUI `send` action type. |
| S6 Worker deploy automation in CI | deploy needs a Cloudflare API token stored as a GitHub secret (new secret surface) | none | Deferred: manual `wrangler deploy`, documented in CONTRIBUTING.md | deferred | D3 answer 2026-10-12: "Defer: manual deploy, documented (recommended)". Scope: only the CI deploy workflow; the Worker itself stays in scope per R1. |
| S7 alert delivery channel for Worker alerts | Section 8: alerts defined, no recipient or channel decided | none | Tracked as a P3 TODO in TODOS.md (written 2026-10-13) | approved | D13 answer 2026-10-13: "Add a P3 TODO to TODOS.md (recommended)". Scope: the TODO entry only; no alert code in this plan. |

Approval readiness: PASS. Checked rows and their actual answers: R1 (D1), R2 (D4), R3 (D5, user chose option B over the recommendation), R4 (D8), R5 (D6), R6 (D12), R8 (D7), R9 (D11), R10 (D9), R11 (D10), S5 (folded into R3), S7 (D13); deferred by delivery-scope answers or direct user instruction: R7/S1 (user's own words), S6 (D3); not added: S2, S3, S4 (never requested). Mode SCOPE REDUCTION from D2. No unanswered row remains.

## Review body

### Diagrams

1. System architecture (updated by A1, A2, E5-E8)

```
BROWSER (GitHub Pages, static)                    CLOUDFLARE Worker `canvas-wallet`   AEGIS (existing)
+--------------------------------------+        +----------------------------+      +---------------------+
| phone-frame.ts  list > detail > SEND |        | POST /check {network,addr} |      | api.aegis-kyt.com   |
| send-screen.ts (new)                 |        |  1 re-validate base58check |      | POST /v2/screen     |
|   tron-address.ts (WebCrypto)        |        |  2 RISK_ENABLED secret ==  |      |  (sync, 0.1 credit, |
|   tron-fee.ts  --keyless--> TronGrid |        |    "true", else seed-only  | ---> |   Idempotency-Key   |
|   risk-client.ts                     | HTTPS  |  3 limits + daily budget   |      |   = hash(net+addr   |
|     1 seed lookup (risk-seed.json)   | -----> |    (Durable Object, E3)    | <--- |   +UTC day))        |
|     2 Worker call (one POST)         |        |  4 KV cache, map level,    |      +---------------------+
+--------------------------------------+        |    strip to {level,label?} |
                                                |    (label only if clear)   |
 Deploy: Cloudflare Git build runs tests        |  secrets: AEGIS_API_KEY,   |
 first (E8), then wrangler deploy               |           RISK_ENABLED     |
                                                +----------------------------+
```

2. Data flow with shadow paths

```
INPUT --> VALIDATION --------> TRANSFORM -------> PERSIST -----------> OUTPUT
paste     trim, len 34,        seed lookup, else  session state        state badge, fee line,
          Base58, 0x41,        Worker (cache by   (module scope,       Send gating
          sha256x2 checksum    network+address)   survives re-render)
nil/empty: no call, neutral    wrong type/too long: reject, no call, Send disabled
timeout: UNAVAILABLE           conflict: stale reply dropped by seq+address guard
stale: seed entry > 90 days ignored (treated as miss)
```

3. State machine (one check per address)

```
IDLE -type-> INVALID -fix-> VALID --> SEED_HIT --------------> CLEAR | CAUTION
                              |
                              +--> CHECKING (<=15 s) --> CLEAR | CAUTION | UNAVAILABLE
any state --address edited--> IDLE (late reply for an old address is dropped)
IMPOSSIBLE: CHECKING -> CLEAR for an address no longer in the field (guard blocks)
Send enabled: CLEAR, UNAVAILABLE (after soft timeout); CAUTION -> popup; CHECKING -> held
```

4. Error flow

```
risk-client.check(addr)
  |-- seed hit ---------------------------------------------> verdict
  |-- seed load error --> treat as miss, warn once
  '-- Worker call
        |-- 400/429/503/5xx/timeout/network --> UNAVAILABLE ("Couldn't verify this address")
        |-- unknown level in reply -----------> UNAVAILABLE (log keys only)
        '-- {level, label?} ------------------> verdict
Worker: KV down -> FAIL CLOSED (no live call); Aegis 402/403/429 -> generic unavailable;
        none + coverage.data_available=false -> level "unknown"; medium/high/critical/sanctioned -> caution (E6)
tron-fee: any failure -> labeled estimate from constants, never 0, never presented as live
```

5. Deployment sequence and 6. Rollback

```
DEPLOY: Worker (push to main -> Cloudflare Git build runs tests, then wrangler deploy; secrets AEGIS_API_KEY and RISK_ENABLED set once in the dashboard) -> smoke /health and a seed address ->
        set repo variable VITE_RISK_PROXY_URL -> merge site change -> dist secret check -> Pages
ROLLBACK: site: revert commit, Pages redeploys (~1 min)
          Worker: wrangler rollback, or set the RISK_ENABLED secret to anything but "true" (UI falls back to seed-only)
          total kill: empty VITE_RISK_PROXY_URL + redeploy (seed-only site, no Worker traffic)
```

7. Async ordering (typing race)

```
OP                       t1       t2       t3       t4       t5
type addr A (check A)    start ---------------------------- done(A)
edit to addr B (check B)          start ------ done(B)
ORDER 1 (A first): A's reply dropped (field holds B), B applies -> CLEAR(B)           OK
ORDER 2 (B first): B applies at t3, A's reply at t5 DROPPED by seq+address guard      OK only with the guard
```

8. User flow

```
Token detail --[send action]--> SEND
  invalid address --> hint, Send disabled
  valid --> seed hit --> CLEAR | CAUTION (instant)
        \--> CHECKING (<=15 s) --> CLEAR | CAUTION | UNAVAILABLE
  CLEAR / UNAVAILABLE --[Send]--> Sending... --> Sent (simulated) --> Done --> token detail
  CAUTION --[Send]--> POPUP --Cancel--> form | --Send anyway--> Sending... --> Sent (simulated)
```

### Error & Rescue Registry (implementation-ready)

| Codepath | Failure | Error class | Rescued? | Rescue action | User sees |
|---|---|---|---|---|---|
| tron-address#validate | empty, wrong length, bad Base58, wrong prefix, bad checksum | InvalidAddress (typed result) | Y | no network call | "Not a valid Tron address" |
| tron-address#validate | crypto.subtle missing (insecure context) | CryptoUnavailable | Y (specified) | block Send, log | "Can't verify address here" |
| tron-fee#estimate | TronGrid timeout / 429 / network / CORS | FeeFetchError | Y | labeled estimate from constants | "Estimated, live fee unavailable" |
| tron-fee#estimate | getEnergyFee missing | FeeParseError | Y (specified) | same estimate, log the missing key | same |
| tron-fee#estimate | triggerconstantcontract result=false/revert | FeeSimulationError | Y (specified) | labeled estimate, never 0 | same |
| risk-client#check | risk-seed.json missing/invalid | SeedLoadError | Y (specified) | treat as miss, warn once | nothing |
| risk-client#check | Worker 429/503/5xx/timeout/network | RiskUnavailable | Y (specified) | UNAVAILABLE, never CLEAR | "Couldn't verify this address" |
| risk-client#check | unknown level value | RiskShapeError | Y (specified) | UNAVAILABLE, log reply keys only | same |
| risk-client#check | reply for a superseded address | StaleReply | Y | seq+address guard drops it | nothing |
| Worker POST /check | bad body / bad address | BadRequest (400) | Y | reject early | UNAVAILABLE in UI |
| Worker POST /check | per-visitor limit / daily budget | 429 / 503 | Y | reject, no upstream call | "Couldn't verify this address" |
| Worker POST /check | Aegis 402/403/429/cap | UpstreamRefused | Y (specified) | generic unavailable + breaker | same |
| Worker POST /check | Aegis failed_timeout / 5xx | UpstreamError | Y (specified) | negative cache 60 s | same |
| Worker POST /check | Aegis none without data (data_available false) | (mapped) | Y | level "unknown" | "Couldn't verify" (never safe) |
| Worker POST /check | KV unavailable | StoreUnavailable | Y (specified) | FAIL CLOSED | same |
| send-screen#submit | double click / stale submit | UI guard | Y (specified) | `submitting` flag | one simulated confirmation |
| send action | opted in on non-Tron token | UnsupportedNetwork | Y (specified) | refuse before input | "Send isn't available on this network yet" |
| phone re-render | typed values / in-flight check lost | StateLoss | Y (specified) | session state in module scope | values preserved |

"Y (specified)" means the rescue is part of the approved plan but not yet implemented. 0 CRITICAL GAPS remain in the registry; 9 gaps found in Section 2 all received a specified rescue.

### Failure Modes Registry

| Codepath | Failure mode | Rescued? | Test? | User sees? | Logged? |
|---|---|---|---|---|---|
| tron-address | checksum mismatch | Y | Y | hint | n/a |
| tron-address | crypto.subtle missing | Y | Y | message | Y |
| amount parse | float/decimals overflow | Y | Y | hint | n/a |
| tron-fee | TronGrid down | Y | Y | labeled estimate | Y |
| risk-client | Worker down | Y | Y | unavailable | Y |
| risk-client | both completion orders of two checks | Y | Y | correct verdict | n/a |
| Worker | KV down | Y | Y | unavailable | Y |
| Worker | budget exhausted | Y | Y | unavailable | Y |
| Worker | Aegis key revoked / cap hit | Y | Y | unavailable | Y |
| Worker | reply leaks score or reason | Y (strip) | Y (exact-keys contract test) | never | Y |
| send-screen | re-render mid-check | Y | Y | values kept | n/a |
| send-screen | Send pressed during CHECKING | Y | Y | held, then unavailable policy | n/a |
| deploy | secret compiled into dist | Y | Y (check script) | deploy fails | Y |
| schema | `send` with extra property | Y | Y | CI rejects | Y |

14 rows, 0 CRITICAL GAPS (every row has a specified rescue, a planned test, and a visible or logged outcome).

### NOT in scope

| Item | Answer | Reason | Goes to |
|---|---|---|---|
| Real signing/broadcast | scope boundary | Send stays simulated | n/a |
| Ethereum/EVM fee and risk (R7, S1) | deferred by user's own words | "Tron first, think about Ethereum later"; needs keccak256 | TODOS.md |
| Worker CI deploy workflow (S6) | deferred, D3 | avoids storing a Cloudflare token as a GitHub secret | TODOS.md |
| Fee tiers, address book, full review/receipt screens (S2-S4) | not added | not requested; reviewer additions | none |
| Turnstile bot challenge | not chosen, D8 | lean controls bound spend; upgrade path only | none |

### What already exists

- phone-frame.ts: screen state machine (`screenMode`, `setPhoneNavScreen`) gains a third mode; header/nav/chrome conventions are reused.
- price-chart.ts: keyless live fetch with cache, labeled fallback, mockable `fetchImpl` (pattern reused for tron-fee).
- stale-fetch-guard.ts: reused for typing races (not rewritten).
- fake-balance.ts + rng.ts: deterministic balances for the Max button.
- action-executor.ts HANDLERS table and registry.schema.json oneOf actions: extended with `send`.
- network-registry.ts + networks.json: Tron branding and network matching.
- scripts/validate-fixtures.ts: extended for the seed and `send` fixtures.
- .github/CODEOWNERS (`* @maslovsa`) already covers the seed file.

### Dream state delta

```
CURRENT                    THIS PLAN                           12-MONTH IDEAL
cards + two-screen   --->  Tron Send flow + KYT-style    --->  embeddable send component for real
phone, no send flow        pre-transfer screening demo         wallets with pluggable fee/risk
                           (hybrid, capped, stripped)          providers across networks
```
This plan proves the pre-transfer screening pitch on one network and keeps the seams (a `network` parameter in the client and Worker, a single verdict type) for EVM and other providers.

### Reality rows

PLAN_REALITY check not run: gstack upgraded to v1.91.93.0 mid-run and Step 0 had already completed under the previous skill text. Reality rows 0/0, 0 unverified. Facts above are individually sourced in F1-F11.

### Stale Diagram Audit

- `src/ui/phone-frame.ts` header comment (two-screen machine "list"/"detail") becomes stale when a third `send` mode lands. Update it.
- CONTRIBUTING.md "The price_chart widget: the one widget with a live network call" and the schema description for `widgetPriceChart` stay true for widgets, but CONTRIBUTING needs a new section for the Send flow's live calls (TronGrid, Worker) and the F1 explanation. No ASCII diagrams exist in the other touched files.

## Implementation Tasks
Synthesized from this review's findings. Each task derives from a specific finding above. Run with Claude Code or Codex; checkbox as you ship. Time assumption: human ~8-10 days total; CC+gstack ~5 hours (scaffolding ~100x, tests ~50x, features ~30x, architecture ~5x).

- [ ] **T1 (P1, human: ~3h / CC: ~15min)** - schema - add `send` action (type only, additionalProperties false), regenerate types, accept schema 1.0.0 and 1.1.0 in the gate  (PR1 DONE: schema `send` action, gate accepts 1.0.0/1.1.0, version rule in validate-fixtures, fixtures, ActionResult union + send handler; REMAINING for PR2: opt-in `send` entries and schemaVersion 1.1.0 in the Tron lists)
  - Surfaced by: Section 1 (R3), Section 3 (R8), Section 10 (R9)
  - Files: registry.schema.json, src/generated/registry-schema.d.ts, src/registry-client/schema-version-gate.ts, public/lists/*.json (opt-in: add `send` only to Tron tokens; no list contains it today), fixtures/valid/send-action.json, fixtures/adversarial/send-action-extra-props.json, tests/schema-version-gate.test.ts, tests/schema-validator.test.ts
  - Verify: `npm test` and `npm run validate:fixtures` (1.2.0 refused, extra property rejected)
- [ ] **T2 (P1, human: ~3h / CC: ~15min)** - actions - `send` handler and phone wiring: opens the Send screen, third `screenMode`, refuses non-Tron tokens with the in-phone notice (DR12), not `alert()`
  - Surfaced by: Section 1 (R3), Section 2 (UnsupportedNetwork), Section 4
  - Files: e2e/happy-path.spec.ts, src/widgets/action-executor.ts (ActionResult becomes a discriminated union; `send` has no targetUrl), src/ui/phone-frame.ts (click handler branches on the result; Tron detection via canonicalName; src/main.ts only if the build needs it), tests/action-executor.test.ts
  - Verify: FIRST (before touching phone-frame.ts or action-executor.ts) add the E10 characterization tests: exact result-shape rows in tests/action-executor.test.ts, plus two Playwright tests in e2e/happy-path.spec.ts (click an existing action widget and assert the demo alert text; list -> detail -> Back); they must pass before and after. Then: unit tests that `send` opens the screen, back returns to detail, non-Tron shows the in-phone notice
- [x] **T3 (P1, human: ~4h / CC: ~20min)** - send - Tron address validator (WebCrypto double-SHA256, Base58, 0x41) with CryptoUnavailable blocking; one pure module shared with the Worker (E9)  (DONE in PR1: src/send/tron-address.ts + tests/tron-address.test.ts)
  - Surfaced by: Section 2, Section 6
  - Files: src/send/tron-address.ts, tests/tron-address.test.ts
  - Verify: tests for real USDT contract address, flipped checksum, lengths 33/35, O/0/I/l, whitespace, no crypto.subtle
- [x] **T4 (P1, human: ~3h / CC: ~15min)** - send - BigInt decimal amount parsing, Max minus fee, decimals 0 to 255  (DONE in PR1: src/send/send-input.ts holds the amount code; the validator stays in tron-address.ts so the Worker can import it alone, E9 refines D2's merged file)
  - Surfaced by: Section 5, Section 4
  - Files: src/send/amount.ts, tests/amount.test.ts
  - Verify: tests for "10.5" @6, "-1", "abc", "1e3", too many decimals, Max on native TRX vs TRC20
- [ ] **T5 (P1, human: ~1d / CC: ~30min)** - send - TronGrid fee estimator with labeled fallback (chain params cached per session, constant-call energy from a token-holding reference sender, 65k/130k constants when none, +1 TRX for inactive TRX recipient). Probe 2026-10-13: an unfunded sender reverts, so the estimate never uses the user's own address; fetch timeouts use the native `AbortSignal.timeout(ms)` inline (no src/send/net.ts, retracted in the 2026-10-13 re-review)
  - Surfaced by: Section 2, Section 7; F7
  - Files: src/send/tron-fee.ts, tests/tron-fee.test.ts
  - Verify: mocked-fetch tests incl. 429, missing getEnergyFee, fresh recipient 130k energy; one manual run against real TronGrid
- [ ] **T6 (P1, human: ~1d / CC: ~40min)** - send - risk client: seed lookup (90-day runtime expiry), Worker call, seq+address stale guard, four states, 15 s soft timeout
  - Surfaced by: Section 1 (R1), Section 4 (R10), Section 6
  - Files: src/send/risk-client.ts, public/risk-seed.json, scripts/validate-fixtures.ts, tests/risk-client.test.ts
  - Verify: seed fetch uses import.meta.env.BASE_URL (test with a sub-path base); client calls POST /check once (A1: Aegis /v2/screen is synchronous), 15 s stays as the upper bound; tests for both completion orders with controlled release points, unknown level, Worker 429/5xx/timeout, seed expiry with injected now
- [ ] **T7 (P1, human: ~1d / CC: ~30min)** - send - session state in module scope (keyed by network + token.id) plus pure `deriveSendView`, submit guard, abort on back
  - Surfaced by: Section 4 (CRITICAL GAP: phone-frame.ts:48 clears the container on every render), Section 5
  - Files: src/send/send-session.ts, tests/send-session.test.ts
  - Verify: tests for state x Send-enabled matrix, edit-after-verdict reset, fake-timer soft timeout, re-render preserving values
- [ ] **T8 (P1, human: ~3d / CC: ~90min)** - ui - Send screen, caution popup, Sent view and refusal notice built to the Design review decisions DR1-DR14 (hierarchy and wireframe, state table, `--send-*` tokens for both themes, popup inside `.phone-frame` with iOS and Android skins, accessibility acceptance criteria DR11, popup copy per D12). The popup opens only on Send (DR2); no `alert()`
  - Surfaced by: Section 11, Section 3 (T4, T7), R5, R6
  - Files: src/ui/send-screen.ts, src/style.css, tests/send-screen.test.ts
  - Verify: DOM tests (popup text has wording + source line and no score/level/reason/flag strings; double-click submits once; Esc cancels; popup does not open on paste or on a verdict, only on Send; status line text per DR3/DR4; amount/fee states per DR5; Cancel keeps values; Sent view shows the Simulated pill); contrast check of every `--send-*` pair at 4.5:1 in both themes; manual check in both themes and iOS/Android chrome; run `/design-review` on the built screen
- [ ] **T9 (P1, human: ~2d / CC: ~60min)** - worker - risk proxy: validate, per-visitor limit, daily budget with atomic counter, KV cache + 60 s negative cache, one synchronous Aegis call with Idempotency-Key, strip to {level,label?}, label sanitize, exact-origin CORS (list from a variable; localhost only in .dev.vars), RISK_ENABLED as a Worker secret (E5), fail closed when KV is down, structured logs. Per A1 (supersedes E2): one synchronous POST /check calling Aegis `POST /v2/screen` (Bearer key from the Worker secret, `Idempotency-Key` = hash of network+address+UTC day, so replays within 24 h are not charged), no handle table, no polling; map risk_level per E6: medium/high/critical/sanctioned -> caution; low, or none with data_available true -> clear; none with data_available false, unknown values and any Aegis error -> unknown; label (verdict.label, sanitized, length-limited) is returned only for clear (E7), caution and unknown responses are exactly {level}. Per E3: Counter class with injected storage + thin Durable Object wrapper and wrangler migration (on the Free plan: `new_sqlite_classes`); counter order: read the global budget first and write it only when an Aegis call is actually made, so floods do not burn the 100,000 daily row writes. Per E9: import the shared validator from `../../src/send/tron-address.ts`. Aegis fetch uses `AbortSignal.timeout(8000)` (inside the client's 15 s ceiling, R10). Structural Env types, no workers-types
  - Surfaced by: Sections 1, 2, 3, 6, 8; R1, R2, R4
  - Files: worker/src/index.ts, worker/wrangler.toml (drop the RISK_ENABLED var, E5), tests/worker-check.test.ts
  - Verify: injected-env tests (exact-keys contract, limits, budget under simulated concurrency, KV-down closed, none without data to unknown, caution never carries a label (E7), RISK_ENABLED secret missing or not "true" means seed-only (E5), OPTIONS preflight and exact-origin CORS, expired handle); one manual live smoke with the capped demo key
- [x] **T10 (P1, human: ~3h / CC: ~15min)** - build guard - dist secret check run after the build in deploy.yml and locally; patterns include Aegis keys (`aeg_...`) and Cloudflare API token prefixes (`cfut_`, `cfat_`; verify the prefix of the token in use)  (DONE in PR1: scripts/check-dist-secrets.ts, npm run check:dist, deploy.yml step)
  - Surfaced by: Section 6 (R11), Section 3 (T1), F10
  - Files: scripts/check-dist-secrets.ts, tests/check-dist-secrets.test.ts, .github/workflows/deploy.yml
  - Verify: unit test fails on a planted fake key in a temp dist, passes on the real build
- [ ] **T11 (P2, human: ~3h / CC: ~20min)** - deploy and docs - pass public repo variable VITE_RISK_PROXY_URL to the build; CONTRIBUTING runbook (Cloudflare Git deploy with the E8 build settings: root directory worker, build command runs the repo tests, watch paths worker/** and tests/**; key rotation; set the RISK_ENABLED and AEGIS_API_KEY secrets once; budget variables); README/CONTRIBUTING explanation of why a static site has a Worker (F1); update the phone-frame.ts header comment
  - Surfaced by: Section 9, Section 8, Section 10, Stale Diagram Audit
  - Files: .github/workflows/deploy.yml, CONTRIBUTING.md, README.md, src/ui/phone-frame.ts
  - Verify: a clean build with the variable empty produces a seed-only site; documented deploy steps followed once
- [ ] **T12 (P2, human: ~3h / CC: ~20min)** - e2e - Playwright flow with a route-mocked Worker: caution popup shows no score/reason; Worker down shows unavailable and Send allowed after 15 s
  - Surfaced by: Section 6, R5, R10
  - Files: e2e/send-flow.spec.ts
  - Verify: `npx playwright test e2e/send-flow.spec.ts`
- [ ] **T13 (P1, human: ~2h / CC: ~20min)** - verification owners - confirm the three unknowns before building the Worker: (a) DONE by A1: /v2/screen costs 0.1 credit per call, Idempotency-Key replay within 24 h is free (docs.aegis-kyt.com/api-reference/v2-screen); still confirm with one live call that the demo key has the screen scope and the monthly cap is set, (b) how long a Worker may run after replying (`waitUntil`) or else client-driven polling, (c) confirm Durable Objects are enabled on the target Cloudflare account (on the Free plan only the SQLite backend is available, so wrangler.toml must declare the class under `new_sqlite_classes`; docs.cloudflare.com durable-objects pricing, read 2026-10-13) (E3 precondition; if not, E3 reopens, KV is not selected automatically), (d) `wrangler secret put` syntax and that wrangler runs under Node >=20 (local node is v18.18.0), (e) E8 build settings: the Cloudflare build command can run `cd .. && npm ci && npm test` from root directory `worker` and watch paths worker/** and tests/** work; if not, E8 reopens, (f) set the `RISK_ENABLED` and `AEGIS_API_KEY` secrets once after the first real deploy and add `keep_vars` only if a dashboard variable is ever used. Resolved by review: (b) not needed, /v2/screen is synchronous (A1, supersedes E2), (c) mechanism chosen (E3)
  - Surfaced by: Sections 2, 6, 7; E2, E3
  - Files: worker/README.md content goes to CONTRIBUTING.md (D2 smaller arrangement); T11 also adds worker/.dev.vars to .gitignore
  - Verify: written answers appended to the CONTRIBUTING.md runbook
- [x] **T14 (P1, human: ~1h / CC: ~10min)** - CI - E1: add an `npm test` step before `npm run build` in the deploy.yml build job; remove the `paths:` filter from the pull_request trigger in validate-registry.yml  (DONE in PR1: npm test before the build in deploy.yml; paths filter removed from validate-registry.yml)
  - Surfaced by: Scope Challenge finding 1 (E1)
  - Files: .github/workflows/deploy.yml, .github/workflows/validate-registry.yml
  - Verify: a deliberately failing test on a throwaway branch fails both the PR run and a main-push run before deploy

**PR grouping (E4):** PR1 foundations (T1, T3, T4, T14, T10), PR2 Send flow seed-only (T2, T5, T6 seed path, T7, T8, T12), PR3 live check Worker (T9, T13 first, T11, Worker-backed part of T6). Each PR passes `npm test` and `npm run build` on its own; PR2 ships with `VITE_RISK_PROXY_URL` empty.

## Answered decision D1 (R1) - approved: Hybrid: static seed + Worker
Commitment comparison:

```text
Commitment                     | Source/approval | Current | A Hybrid (seed + Worker) | B Worker live only | C Static only
Key location                   | F1, F3          | none    | Worker secret            | Worker secret      | no key exists
Arbitrary address works        | user ask #4     | no      | yes                      | yes                | no
Stage demo works if Worker/cap down | demo risk  | n/a     | yes (seed answers)       | no                 | yes
Spend risk                     | F2              | none    | capped by provider key   | capped by provider key | zero
Browser sees score/reason      | user ask #5     | n/a     | never (proxy strips)     | never (proxy strips) | never (not shipped)
Code paths in UI               | maintainability | 0       | 2 behind one verdict type| 1                  | 1
```

Question: D1 — R1: How should the risk-check key be held and the check run?
Project/branch/task: canvas-wallet, branch main, Send window with live address risk screening.
ELI10: The risk check costs real money (about 2 credits each), takes 5 to 30 seconds, and its key must never reach the browser. A GitHub Pages site has no server, so either a tiny proxy holds the key, or we skip live checks and ship pre-computed answers. This picks how the demo gets its risk verdicts.
Stakes if we pick wrong: a key compiled into the bundle is public within minutes and drains the monthly cap; or the stage demo shows a spinner for 90 seconds; or the demo can only check three addresses.
Recommendation: Hybrid (seed + Worker) because the demo needs both a guaranteed instant path on stage and the credibility of checking any real address.
Completeness: A=9/10, B=7/10, C=5/10
Net: You trade about 3-4 extra files and a seed list to maintain for a demo that cannot fail on stage and still checks real addresses.

Header: Risk key
A) Hybrid: static seed + Worker (recommended)
Effort L (human ~3 days / CC ~1.5h), risk medium. Reuse: price-chart fetch/cache/fallback pattern, stale-fetch-guard, fixture validation in scripts/validate-fixtures.ts for the seed. Verification: Worker unit tests with mocked fetch, response-shape contract test, seed-vs-live precedence tests, a Worker-down e2e.
✅ The stage demo answers instantly from the seed even if the Worker, the key's monthly cap or Aegis is down.
✅ Any address the audience types still gets a real live check, through the same single verdict type, with score and reasons stripped at the proxy.
❌ Two code paths and a curated address list to maintain, roughly 3-4 more files than the live-only option.
B) Worker proxy, live only
Effort M (human ~2 days / CC ~1h), risk medium. Reuse: price-chart fetch/cache/fallback pattern, stale-fetch-guard. Verification: Worker unit tests with mocked fetch, response-shape contract test, UI state tests.
✅ Any real Tron address can be checked, so the demo shows the actual product behavior end to end.
✅ The key lives only as a Worker secret, and the proxy strips score and reasons before anything reaches the browser.
❌ If the Worker, the key's monthly cap or Aegis is down or slow, the demo has no verdict at all on stage.
C) Static curated verdicts only
Effort S (human ~half day / CC ~15 min), risk low. Reuse: seeded-data approach of history.ts and fixture validation in CI. Verification: unit tests on the lookup, seed schema check in CI.
✅ No key, no server and no spend, so the abuse surface is zero and it works fully offline.
✅ Deterministic stage demo whose seed file is validated in CI like every other fixture.
❌ Cannot check an address the audience types in, which undercuts the live risk-score pitch and reads as a scripted demo.

## Answered decision D3 (S6) - deferred: manual deploy, documented
Commitment comparison:

```text
Commitment                 | Source/approval | Current | A Defer (manual deploy) | B Keep (CI deploy)
Worker gets deployed       | R1 approved     | none    | by hand, documented     | by Actions on push to main
New GitHub secret          | F1 (secret surface) | none | none                   | Cloudflare API token
New files                  | file-count rule | 0       | 0 (README section)      | 1 workflow
Redeploy after Worker edit | maintainability | n/a     | human must remember     | automatic
Risk-check key location    | R1 approved     | Worker secret | Worker secret (set once by hand) | Worker secret (set once by hand)
```

Question: D3 — S6: Automate the Worker deploy in CI, or defer it?
Project/branch/task: canvas-wallet, branch main, Send window with live address risk screening (R1 Hybrid approved, mode SCOPE REDUCTION).
ELI10: The risk proxy is a small program running on Cloudflare. Something has to put it there. We can either type one deploy command by hand when it changes, or let GitHub do it automatically. Automatic means giving GitHub a second powerful token.
Stakes if we pick wrong: a forgotten manual redeploy leaves the live demo on an old Worker; or a leaked deploy token lets someone replace the proxy that holds the risk key.
Recommendation: Defer because the Worker will change rarely, and a CI deploy token adds a second secret to guard for a one-line command.
Note: options differ in kind, not coverage — no completeness score.
Net: You trade convenience on rare Worker edits against one fewer secret and one fewer file.

Header: Worker deploy
A) Defer: manual deploy, documented (recommended)
Effort S (human ~15 min / CC ~5 min), risk low. Reuse: README/CONTRIBUTING section pattern. Verification: the documented command is run once against the real Worker and the README step list is checked line by line.
✅ No Cloudflare API token ever lands in GitHub Secrets, so the repo gains no new secret surface.
✅ One fewer workflow file keeps the build under the 15-file line.
❌ A human must remember to redeploy after editing the Worker, so the live Worker can lag main.
B) Keep: deploy-worker.yml on push to main
Effort M (human ~half day / CC ~20 min), risk medium. Reuse: deploy.yml structure and its push-to-main-only trigger. Verification: a dry-run workflow on a branch plus a post-deploy health call to the Worker.
✅ The live Worker always matches main, with no step for a human to forget.
✅ Reuses the proven push-on-default-branch trigger pattern from the existing deploy workflow.
❌ Stores a Cloudflare API token as a GitHub secret, a second credential that could replace the proxy holding the risk key.

## Answered decision D4 (R2) - approved: Cloudflare Worker, separate from production
Commitment comparison:

```text
Commitment                      | Source/approval | Current | A Cloudflare Worker      | B Route on api.aegis-kyt.com
Where the AEGIS key lives       | F1, F3, R1      | none    | Worker secret (set by hand) | stays inside Aegis, no copy
GitHub Secrets used             | user ask        | none    | none (D3: no CI deploy)  | none
Production API surface          | R1 blast radius | none    | unchanged                | + 1 public unauthenticated route
Abuse controls                  | F2, F4          | none    | Turnstile/limit/KV built here | reuse platform limiter, ledger, caps
New vendor/account              | scope           | none    | Cloudflare               | none
Cross-repo change               | file-count rule | none    | no                       | yes (aegis-platform)
Seed + stripping logic          | R1 approved     | none    | in Worker                | in Aegis service
```

Question: D4 — R2: Where should the risk proxy run?
Project/branch/task: canvas-wallet, branch main, Send window with live address risk screening (R1 Hybrid approved, mode SCOPE REDUCTION).
ELI10: The browser must not hold the Aegis key, so a small server-side piece sits between the demo page and Aegis. It can live in a new Cloudflare Worker, or as a new public route inside Aegis itself. One keeps the demo separate from the real product; the other reuses the real product's limits and billing.
Stakes if we pick wrong: a public demo route inside production Aegis makes a demo bug a production incident; a separate Worker means a second place that holds a paid key and must be locked down.
Recommendation: Cloudflare Worker because a demo-scoped key with its own monthly cap keeps any abuse or bug away from the production KYT API.
Note: options differ in kind, not coverage — no completeness score.
Net: You trade a new account and a self-built limiter for keeping the production API untouched.

Header: Proxy host
A) Cloudflare Worker, separate from production (recommended)
Effort M (human ~1 day / CC ~40 min), risk low. Reuse: price-chart.ts fetch/cache/fallback shape for the client side only. Verification: Worker unit tests with a mocked Aegis, a contract test that the response is exactly {level, label?}, and a live smoke call with the demo key.
✅ A leaked or abused demo key can only spend its own capped budget and never touches the production API.
✅ Turnstile, rate limiting and KV caching are built into the platform, so the abuse controls need no changes inside Aegis.
❌ Adds a Cloudflare account and a second place that holds a paid key, so key rotation has two steps.
B) New public demo route on api.aegis-kyt.com
Effort L (human ~2 days / CC ~1h), risk high. Reuse: the platform's existing ledger, per-key limits, logging and billing. Verification: platform tests plus CORS and abuse tests in the aegis-platform repo.
✅ No key copy exists outside Aegis, and the existing ledger, limits and logs apply automatically.
✅ No new vendor, so there is nothing new to monitor outside the current stack.
❌ Puts a public unauthenticated route on the production KYT API, so a demo bug becomes a production incident and needs a cross-repo change.

## Answered decision D5 (R3) - approved: New SDUI `send` action type
Commitment comparison:

```text
Commitment                  | Source/approval | Current | A Built-in Send row      | B SDUI `send` action
Who decides if Send appears | F8              | none    | the app (Tron tokens)    | registry maintainers via PR
Schema change               | registry.schema.json | none | none                   | new action type + semver + regenerated types
Phishing surface            | design thesis   | none    | none (registry cannot reach the flow) | a PR can add or relabel a Send button
Matches real wallets        | search finding  | none    | yes (native Send)        | no
Files touched (est.)        | file-count rule | 0       | 0 schema files           | +3 (schema, d.ts, fixtures)
Other networks              | R7 deferred     | none    | hidden off Tron          | per-token opt-in
```

Question: D5 — R3: How does a token get a Send button?
Project/branch/task: canvas-wallet, branch main, Send window with live address risk screening (R1 and R2 approved, mode SCOPE REDUCTION).
ELI10: In real wallets, Send is built into the app for every coin; token list authors do not configure it. We could copy that, or let a token's JSON add a Send button the way it can add Swap or Stake buttons today. The second route changes the shared schema and lets a pull request place a money-moving button.
Stakes if we pick wrong: a registry-controlled Send widens the phishing surface the whole project was built to shrink, and forces a schema version bump for a flow real wallets never make configurable.
Recommendation: Built-in Send row because it matches how real wallets work and keeps the registry unable to touch the money flow.
Note: options differ in kind, not coverage — no completeness score.
Net: You trade per-token configurability for no schema churn and a smaller attack surface.

Header: Send entry
A) Built-in Send row on Tron token details (recommended)
Effort S (human ~2h / CC ~15 min), risk low. Reuse: phone-frame.ts setPhoneNavScreen and screenMode machine. Verification: unit tests that Send shows on Tron tokens only, hides elsewhere, and returns to the detail screen on back.
✅ Registry content cannot add, move or relabel Send, so a malicious token-list PR cannot reach the money flow.
✅ Zero schema, type-generation or fixture changes, which keeps the change out of the validated registry contract.
❌ Token-list authors cannot hide or customize Send for a specific token, which some issuers may want.
B) New SDUI `send` action type in the schema
Effort M (human ~1 day / CC ~40 min), risk medium. Reuse: the action-executor HANDLERS table and the oneOf action schema. Verification: ajv schema tests, an adversarial fixture, action-executor tests and renderer tests.
✅ Each token can opt in or out of Send, consistent with how Swap and Stake are configured today.
✅ Keeps one mechanism for every button on the card, so authors learn a single pattern.
❌ Changes registry.schema.json (closed vocabulary) and puts a money-moving button under registry-PR control, raising the phishing surface.

## Answered decision D6 (R5) - approved: Warn and allow
Commitment comparison:

```text
Commitment                         | Source/approval | Current | A Warn and allow | B Block caution | C Fail closed
CAUTION result                     | user ask #5     | none    | popup, user may continue | Send disabled | Send disabled
UNAVAILABLE result (check failed)  | F6, Section 2   | none    | inline notice, Send allowed | Send allowed | Send disabled
Popup text shows score or reason   | user ask #5     | none    | never        | never         | never
Matches "we do not recommend"      | user ask #5     | none    | yes (a recommendation) | no (a prohibition) | no
Demo works if Worker/cap is down   | R1 approved     | n/a     | yes          | yes           | no (Send blocked)
Extra UI states                    | maintainability | 0       | 2            | 2             | 2
```

Question: D6 — R5: What happens to Send when the address looks risky or can't be checked?
Project/branch/task: canvas-wallet, branch main, Send window with live address risk screening (R1, R2, R3 approved, mode SCOPE REDUCTION).
ELI10: Two things can go wrong: the check says the address looks risky, or the check itself fails (budget used up, Worker down). We must decide whether Send still works in each case. You described a warning that says we do not recommend sending, which sounds like a warning the user can still override.
Stakes if we pick wrong: blocking on a failed check turns every outage or used-up budget into a broken demo; allowing a risky send without friction makes the warning decorative.
Recommendation: Warn and allow because it matches your own wording (a recommendation, not a prohibition) and a failed check must never be mistaken for either safe or dangerous.
Completeness: A=9/10, B=7/10, C=6/10
Net: You trade a stricter lock for a demo that keeps working during outages and a warning that informs without forbidding.

Header: Risky or unchecked
A) Warn and allow (recommended)
Effort S (human ~half day / CC ~20 min), risk low. Reuse: price-chart.ts labeled-fallback idea (an unavailable result is always labeled, never shown as success). Verification: unit tests for all four states (checking, clear, caution, unavailable) and an e2e that a caution popup offers Cancel and Send anyway.
✅ Caution shows a popup with no score and no reason, with Cancel as the primary action and Send anyway as the secondary one.
✅ A failed check shows "Couldn't verify this address" and never reads as safe or as dangerous.
❌ A user can still send to a flagged address after one extra tap, so the warning is friction, not protection.
B) Block on caution, allow on unavailable
Effort S (human ~half day / CC ~20 min), risk medium. Reuse: the same four-state model with Send disabled while the state is caution. Verification: the same unit tests plus a test that Send stays disabled for caution.
✅ A flagged address cannot be sent to from this window at all, which is the strictest reading of "high risk".
✅ An outage or used-up budget still lets the demo continue, since unavailable does not block.
❌ It turns your recommendation into a prohibition and removes the user's choice, which differs from what you described.
C) Fail closed: block caution and unavailable
Effort S (human ~half day / CC ~20 min), risk high. Reuse: the same four-state model with Send disabled unless the state is clear. Verification: unit tests plus a Worker-down e2e that expects Send disabled.
✅ No unchecked or flagged address can ever be sent to, the safest policy for a real wallet.
✅ Simple to explain: Send works only after a clear result.
❌ Any Worker outage, 429 or used-up demo budget disables Send, so the stage demo can break exactly when it matters.

## Answered decision D7 (R8) - approved: No parameters, type only
Commitment comparison:

```text
Commitment                         | Source/approval | Current | A No parameters | B Optional amount | C Optional recipient + amount
Registry can prefill recipient     | T3, R3 approved | n/a     | no              | no                | yes
Registry can prefill amount        | T3              | n/a     | no              | yes               | yes
Schema fields added to `send`      | R3 approved     | n/a     | 0 (type only)   | 1                 | 2
Phishing surface (money-moving)    | design thesis   | n/a     | lowest          | low               | high
Use case: "Send 10 USDT" button    | convenience     | n/a     | no              | yes               | yes (merchant / deep link style)
Extra validation + fixtures        | file-count rule | n/a     | 0               | amount rules      | address + amount rules + adversarial fixtures
```

Question: D7 — R8: What may a registry put inside a `send` action?
Project/branch/task: canvas-wallet, branch main, Send window with live address risk screening (R1, R2, R3, R5 approved, mode SCOPE REDUCTION).
ELI10: You chose to let token lists add a Send button. The button itself is harmless, but if the JSON may also say who to send to and how much, a malicious pull request could pre-fill an attacker's address. The safest button carries no details at all and just opens the empty Send window.
Stakes if we pick wrong: a pre-filled recipient is exactly how real wallet phishing works; one reviewer slip and the demo teaches users to send to an attacker.
Recommendation: No parameters because the user types the recipient and amount themselves, so a registry can never choose where money goes.
Completeness: A=9/10, B=7/10, C=5/10
Net: You trade "one-tap Send 10 USDT" convenience for removing the pre-filled-recipient attack entirely.

Header: Send payload
A) No parameters: type only (recommended)
Effort S (human ~1h / CC ~10 min), risk low. Reuse: the oneOf action schema and an adversarial fixture pattern like fixtures/adversarial/unknown-action-type.json. Verification: schema test that `send` with any extra property is rejected, and a renderer test that the Send window opens empty.
✅ A registry can never choose the recipient or amount, so a pre-filled-recipient phishing flow is impossible by construction.
✅ The schema stays tiny and the adversarial fixture rejects every extra property with one rule, additionalProperties false.
❌ There is no one-tap "Send 10 USDT" deep link for merchant or invoice-style use cases.
B) Optional prefilled amount only
Effort S (human ~half day / CC ~20 min), risk medium. Reuse: the same schema pattern plus a decimal-string amount rule matching token decimals. Verification: schema tests for amount format and a UI test that the prefilled amount is shown, editable and never auto-submitted.
✅ Supports "send exactly this much" flows without letting the registry choose the recipient.
✅ The prefilled amount stays editable and visible, so the user still confirms it.
❌ A prefilled amount can still mislead, for example a large amount that looks normal, and it needs extra validation rules.
C) Optional recipient and amount
Effort M (human ~1 day / CC ~40 min), risk high. Reuse: the same schema pattern plus address validation shared with tron-address.ts. Verification: schema and adversarial fixtures for malformed recipients, plus UI tests for the forced risk check on a prefilled address.
✅ Enables merchant, invoice and deep-link style sends from a token card.
✅ Reuses the same address validation and risk check, so a prefilled address is still screened.
❌ A reviewed-but-malicious PR can pre-fill an attacker address, the classic wallet phishing path, which the project's own thesis tries to shrink.

## Answered decision D8 (R4) - approved: Lean, no Turnstile
Commitment comparison:

```text
Commitment                          | Source/approval | Current | A Lean (no Turnstile) | B Full (+ Turnstile) | C Minimal
Spend ceiling                       | F2, T2          | none    | daily budget, then provider cap | same as A | provider monthly cap only
Raises cost for bots                | T2, T5          | none    | medium (per-visitor IP limit) | high (challenge) | none
Third-party script on the page      | T11             | none    | none                  | challenges.cloudflare.com | none
New secrets                         | F1, F10         | none    | none beyond the Aegis key | + Turnstile secret | none
Live path while under attack        | R1 approved     | n/a     | may hit daily budget  | best                 | exhausts fast
Stage demo guaranteed (seed)        | R1 approved     | n/a     | yes                   | yes                  | yes
Extra files (est.)                  | file-count rule | 0       | 0 beyond Worker       | +CSP meta, widget glue | 0
```

Question: D8 — R4: How hard should the Worker defend the paid risk check?
Project/branch/task: canvas-wallet, branch main, Send window with live address risk screening (R1, R2, R3, R5, R8 approved, mode SCOPE REDUCTION).
ELI10: Every live check costs real credits, and anyone on the internet can call the Worker. We can stop abuse at several layers: a per-visitor limit and a daily spending ceiling, plus optionally a bot challenge (Cloudflare Turnstile). More layers cost more code, a third-party script and another secret.
Stakes if we pick wrong: too little and a script drains the monthly credits in minutes; too much and the demo carries a challenge script and a second secret for a tool whose budget is only tens of checks.
Recommendation: Lean (no Turnstile) because the daily ceiling and the provider cap already bound the spend, and the seed keeps the stage demo working even if the live budget is gone.
Completeness: A=8/10, B=10/10, C=4/10
Net: You trade stronger bot resistance for fewer moving parts, since the worst case is a used-up live budget, not a broken demo.

Header: Abuse control
A) Lean: limits and budget, no Turnstile (recommended)
Effort M (human ~1 day / CC ~40 min), risk low. Reuse: stale-fetch-guard.ts for the client in-flight dedupe, and the price-chart.ts cache-by-key idea. Verification: Worker tests for per-visitor limit, daily budget, breaker via the free GET /v2/balance, KV-down fail-closed, and a spend-ceiling test with a mocked Aegis.
✅ Spend is bounded by a daily budget and the provider monthly cap, so a script cannot drain the key.
✅ No third-party script and no extra secret, which keeps the static site and the secret surface small.
❌ A botnet with many IPs can exhaust the daily live budget, so the live path shows "unavailable" until reset (the seed still works).
B) Full: Lean plus Turnstile
Effort L (human ~2 days / CC ~1h), risk medium. Reuse: everything in Lean plus Cloudflare's Siteverify call in the Worker. Verification: Lean's tests plus a Worker test that a missing or reused Turnstile token is rejected, and a UI test of the challenge states.
✅ Raises the cost of automated abuse the most, protecting the live path for real visitors.
✅ Server-side token verification blocks direct scripted calls that skip the page.
❌ Adds a third-party script, a CSP to write, and a Turnstile secret to guard, for a demo whose live budget is only tens of checks.
C) Minimal: cache and provider cap only
Effort S (human ~half day / CC ~20 min), risk high. Reuse: the KV cache and the existing provider-side monthly cap. Verification: cache hit/miss tests and a manual check of the cap.
✅ Smallest build, with no limiter logic to maintain.
✅ The provider monthly cap still stops unbounded spend.
❌ Any script can burn the whole monthly cap in minutes, leaving the live path dead for the rest of the month.

## Answered decision D9 (R10) - approved: Hold Send up to 15 s
Commitment comparison:

```text
Commitment                             | Source/approval | Current | A Hold until result or 15 s | B Allow immediately
Send pressed during CHECKING           | Section 4       | none    | disabled, label "Checking address"| enabled
Verdict precedes the send              | user ask #4     | none    | yes (except unavailable)  | no (can send unchecked)
Worst-case wait on a live address      | F2 (5-30 s)     | n/a     | 15 s then unavailable     | 0 s
After soft timeout                     | R5 approved     | n/a     | UNAVAILABLE, Send allowed | n/a
Seed-hit addresses                     | R1 approved     | n/a     | instant, no hold          | instant
Stage demo impact                      | R1 approved     | n/a     | none for seed addresses   | none
```

Question: D9 — R10: Can the user press Send while the risk check is still running?
Project/branch/task: canvas-wallet, branch main, Send window with live address risk screening (R1, R2, R3, R4, R5, R8 approved, mode SCOPE REDUCTION).
ELI10: A live check can take 5 to 30 seconds. If the user taps Send in that gap, either the button waits for the answer, or the send goes through without any verdict. Addresses from the seed answer instantly, so this only affects addresses typed live.
Stakes if we pick wrong: letting Send through during a check makes the warning skippable by speed; holding it too long makes the demo feel frozen.
Recommendation: Hold Send until the result or a 15-second soft timeout, because the warning should never be beaten by tapping fast, and after 15 seconds the approved policy (unavailable still allows Send) takes over.
Completeness: A=9/10, B=5/10
Net: You trade up to 15 seconds of waiting on live addresses for a warning that cannot be skipped by tapping fast.

Header: Send while checking
A) Hold Send up to 15 s, then treat as unavailable (recommended)
Effort S (human ~2h / CC ~15 min), risk low. Reuse: the four-state model approved in R5 and the stale guard. Verification: unit test that Send is disabled during CHECKING, becomes enabled as UNAVAILABLE after the soft timeout (fake timers), and that an arriving caution result opens the popup.
✅ The verdict, when one arrives in time, always comes before the send, so the warning cannot be skipped by speed.
✅ A 15-second ceiling keeps the demo from feeling frozen and hands over to the approved unavailable policy.
❌ A live address can keep Send disabled for up to 15 seconds, which is a visible wait during a demo.
B) Allow Send immediately during the check
Effort S (human ~1h / CC ~10 min), risk medium. Reuse: the same four-state model with Send never gated by CHECKING. Verification: unit test that pressing Send mid-check proceeds and records the state as unchecked.
✅ No waiting at all, so the flow always feels instant.
✅ The least code, since CHECKING needs no gating logic.
❌ A user who taps quickly sends without any verdict, and a caution result arriving after the send is meaningless, which defeats the feature.

## Answered decision D10 (R11) - approved: dist secret check
Commitment comparison:

```text
Commitment                         | Source/approval | Current | A Add dist secret check | B Skip
Catches a VITE_-prefixed secret    | F10, T1         | no      | yes (fails the build)   | no
Runs before every deploy           | deploy.yml      | n/a     | yes (after npm run build)| n/a
Files touched (est.)               | file-count rule | 0       | +1 script, edit deploy.yml | 0
False-positive risk                | maintainability | n/a     | low (pattern list in one file) | n/a
Covers the Worker key too          | R1, R2          | n/a     | yes (key never in dist) | no
```

Question: D10 — R11: Add an automatic check that no secret ends up in the shipped site?
Project/branch/task: canvas-wallet, branch main, Send window with live address risk screening (R1 to R10 decided, mode SCOPE REDUCTION).
ELI10: Vite copies any environment variable whose name starts with VITE_ into the public JavaScript. If someone ever names the Aegis key that way, it ships to every visitor and nothing in the current tests would notice. A small check after the build can fail the deploy if it sees key-shaped text.
Stakes if we pick wrong: one wrong variable name publishes the paid key to the world, and the first symptom is a drained credit balance.
Recommendation: Add the dist secret check because it is the only automated guard between a naming mistake and a public key.
Completeness: A=9/10, B=4/10
Net: You trade one small script and a build step for an automatic stop on the most expensive mistake in this feature.

Header: Dist secret check
A) Add scripts/check-dist-secrets.ts to the deploy build (recommended)
Effort S (human ~2h / CC ~15 min), risk low. Reuse: scripts/validate-fixtures.ts conventions and the existing npm run validate:fixtures step in deploy.yml. Verification: a unit test that the script fails on a planted fake key in a temp dist folder and passes on the real build.
✅ A VITE_-prefixed secret, a bearer-token-shaped string or the Worker secret name appearing in dist fails the deploy before it publishes.
✅ Runs in the same workflow step order as the existing fixture validation, so it adds no new workflow file.
❌ It is pattern-based, so a secret in an unusual format could slip past, and the pattern list needs occasional upkeep.
B) Skip the check
Effort S (human ~0 min / CC ~0 min), risk high. Reuse: the F10 convention written in the plan and CONTRIBUTING.md. Verification: none automated; relies on PR review.
✅ No extra script or workflow step to maintain.
✅ Keeps the file count lower, in line with scope reduction.
❌ A naming mistake would publish the paid key with no automated alarm, and review is the only defense.

## Answered decision D11 (R9) - approved: bump to 1.1.0
Commitment comparison:

```text
Commitment                              | Source/approval | Current | A Bump to 1.1.0 | B Amend 1.0.0 in place
Meaning of a published "1.0.0" file     | schema contract | stable  | unchanged       | changes (now allows `send`)
Gate SUPPORTED_SCHEMA_VERSIONS          | schema-version-gate.ts | {1.0.0} | {1.0.0, 1.1.0} | {1.0.0}
Shipped lists that must change          | public/lists   | 0       | only lists using `send` (declare 1.1.0) | 0 declared versions change
Old client reading a `send` list        | gate refuses unknown versions | n/a | refused cleanly (unknown version) | validation error on unknown action
Files touched (est.)                    | file-count rule | 0       | gate + schema $id/doc text + tests | schema only
```

Question: D11 — R9: Does adding the `send` action change the schema version?
Project/branch/task: canvas-wallet, branch main, Send window with live address risk screening (R1 to R11 decided, mode SCOPE REDUCTION).
ELI10: The token-list format has a version number, and the app refuses lists it does not recognize. Adding the Send action is an addition. Either we call the new format 1.1.0 and teach the app both versions, or we quietly change what 1.0.0 means.
Stakes if we pick wrong: changing what a published version means breaks the promise that "1.0.0" is one fixed thing; a version bump forces a small gate and test change.
Recommendation: Bump to 1.1.0 because additive changes should be visible in the version, and the gate then keeps working for every existing list without touching them.
Completeness: A=9/10, B=6/10
Net: You trade a small gate change for a version number that always means one fixed format.

Header: Schema version
A) Bump to 1.1.0, gate accepts both (recommended)
Effort S (human ~2h / CC ~15 min), risk low. Reuse: the SUPPORTED_SCHEMA_VERSIONS set and tests/schema-version-gate.test.ts. Verification: gate tests for 1.0.0 and 1.1.0 accepted and 1.2.0 refused, plus validate-fixtures on one list that uses `send`.
✅ "1.0.0" keeps meaning one fixed format, and only lists that actually use `send` declare 1.1.0.
✅ Existing lists and any external registry stay valid with no edits, since the gate accepts both versions.
❌ Every future additive action needs a version decision, and the gate set must be kept in sync.
B) Amend 1.0.0 in place
Effort S (human ~1h / CC ~10 min), risk medium. Reuse: the existing schema file only. Verification: validate-fixtures with a list that uses `send`, no gate change.
✅ No gate or version change at all, the smallest diff.
✅ No list needs to declare anything new.
❌ A file saying "1.0.0" can now mean two different formats, so version checks stop telling a client what it can safely read.

## Answered decision D12 (R6) - approved: your wording plus a data-source line
Commitment comparison:

```text
Commitment                         | Source/approval | Current | A Your wording + source line | B Softer caution | C Your wording only
Says "we do not recommend"         | user ask #5     | none    | yes                          | no               | yes
Shows reasons or score             | user ask #5, R5 | none    | never                        | never            | never
Names the data source              | Aegis doc, F6   | none    | yes ("Based on Aegis data...") | no             | no
Matches Aegis disclaimer boundary  | F6              | n/a     | yes (policy is the wallet's, data is Aegis's) | yes | weaker (no attribution)
Buttons (R5 approved)              | R5              | none    | Cancel primary, Send anyway | same         | same
```

Question: D12 — R6: What exactly does the caution popup say?
Project/branch/task: canvas-wallet, branch main, Send window with live address risk screening (R1 to R11 decided, mode SCOPE REDUCTION).
ELI10: When an address looks risky the popup must warn without giving reasons or a score. You asked for a message that we do not recommend sending there. Aegis's own docs say its result is information and the wallet decides what to do, so the wallet's wording is the wallet's policy. A short line naming the data source keeps that honest.
Stakes if we pick wrong: wording that sounds like a legal finding overclaims; wording that is too soft is ignored; a popup that explains reasons breaks your rule.
Recommendation: Your wording plus a data-source line because it keeps your "we do not recommend" message, discloses no reasons, and credits Aegis as the data the way its documentation expects.
Note: options differ in kind, not coverage — no completeness score.
Net: You trade one extra line of text for wording that stays honest about where the signal comes from.

Header: Popup wording
A) Your wording plus a data-source line (recommended)
Effort S (human ~30 min / CC ~5 min), risk low. Reuse: the plain-text rendering convention (textContent) and the existing demo-alert copy style. Verification: a DOM test that the popup text contains the wording and the source line and contains none of score, level, reason or flag strings.
✅ Title "We don't recommend sending to this address" and the line "Based on Aegis data at the time of the check. Details aren't shown." follow your rule exactly.
✅ Credits the data source the way the Aegis integration docs expect, so the wallet owns the recommendation and Aegis owns the data.
❌ Names Aegis in the UI, which a white-label demo audience might not want.
B) Softer caution wording
Effort S (human ~30 min / CC ~5 min), risk low. Reuse: the same popup structure and test. Verification: the same DOM test with the softer strings.
✅ "Use extra caution. Double-check this address before you send." cannot read as a legal or compliance finding.
✅ Needs no source attribution, so it stays vendor-neutral.
❌ It drops your requested message that we do not recommend sending, and may be tapped through as routine.
C) Your wording only
Effort S (human ~20 min / CC ~5 min), risk medium. Reuse: the same popup structure and test. Verification: the DOM test with only the title and the no-details line.
✅ Exactly the message you described, short and direct.
✅ No vendor name on screen.
❌ The recommendation appears with no stated basis, which makes the wallet look like it is judging addresses on its own.

## Answered decision D13 (S7) - approved: P3 TODO for alert delivery
Commitment comparison:

```text
Commitment                         | Source/approval | Current | A Add to TODOS.md | B Skip
Alerts are defined                 | Section 8       | rules only | rules + a tracked follow-up | rules only
Someone is told when budget is 80% | Prime Directive 5 | no    | not until the TODO ships  | no
Day-1 backstop                     | R1, R4 approved | provider monthly cap + RISK_ENABLED switch | same | same
Files touched now                  | file-count rule | 0       | TODOS.md only            | 0
```

Question: D13 — S7: Track "who gets the Worker alerts" as a follow-up?
Project/branch/task: canvas-wallet, branch main, Send window with live address risk screening (all review rows decided, mode SCOPE REDUCTION).
ELI10: The review defined three alerts for the Worker: budget nearly used, Aegis refusing the key, and too many failed checks. It did not decide who receives them or by which channel. That is a real gap, but the capped key and the off switch already limit the damage, so it can ship after the demo.
Stakes if we pick wrong: with no tracked follow-up the alerts are never wired and a drained budget is noticed only when the live path stops working.
Recommendation: Add to TODOS.md because it is a real operations gap, but the provider cap and RISK_ENABLED already bound the risk, so it need not block the first demo.
Note: options differ in kind, not coverage — no completeness score.
Net: You trade a short TODOS.md entry for a tracked follow-up on a gap that is currently covered only by backstops.

Header: Alert owner
A) Add a P3 TODO to TODOS.md (recommended)
Effort S (human ~5 min / CC ~2 min), risk low. Reuse: the TODOS.md entry format already used for the deferrals above. Verification: the entry exists with What, Why, Pros, Cons, Context, Effort, Priority and Depends-on fields.
✅ The alert gap is written down with enough context that someone can pick it up in three months.
✅ Costs no code now and does not delay the first demo, since the capped key and off switch already bound the damage.
❌ Until it ships, a nearly used-up budget is noticed only by reading logs or when live checks start failing.
B) Skip it
Effort S (human ~0 min / CC ~0 min), risk medium. Reuse: nothing new. Verification: none; the alerts stay as rules in the plan only.
✅ No new TODO to maintain, in line with scope reduction.
✅ The provider monthly cap and RISK_ENABLED remain as the day-1 backstops either way.
❌ The gap is not tracked anywhere, so it is likely forgotten and surfaces only as an unexplained outage.


## Engineering review (/plan-eng-review, 2026-10-13)

Target (fixed): this plan, docs/designs/send-window-plan.md, as left by /plan-ceo-review (mode SCOPE REDUCTION, D1-D13 approved, binding). Report file: this file. Original CEO plan above is preserved unchanged; eng decisions below are additive and use ledger IDs E1.. . Eng question numbering starts at D1 (gstack upgrade prompt, not a plan decision) so plan-affecting questions begin at D2.

### Scope Challenge result

feature answers: none proposed (no feature cut offered; every item traces to the user's ask); structure: Smaller arrangement (D2 answer 2026-10-13: "Smaller arrangement (recommended)"); accepted scope: merge address + amount validation into src/send/send-input.ts with one test file tests/send-input.test.ts; put the Worker runbook in CONTRIBUTING.md instead of worker/README.md; add the Send e2e to e2e/happy-path.spec.ts instead of a new e2e file; file count about 34 [estimated]; pending remedies: E1 (tests gating CI), E2 (Worker polling protocol), E3 (atomic counter mechanism), E4 (PR split). Scope Challenge result: scope accepted as-is (a smaller arrangement that preserves scope is not a scope reduction).

Scope Challenge findings (numbered, with confidence): 1 [P1,9] CI does not run tests for code-only PRs and deploy never runs `npm test` (validate-registry.yml:11-16, deploy.yml:30-32) -> E1; 2 [P1,7] waitUntil background polling not supported past ~30 s -> E2; 3 [P1,8] KV counters not atomic -> E3; 4 [P2,9] tsconfig.json:24 does not include worker/, types is vite/client only: Worker uses structural interfaces, no workers-types (implementation detail of approved T9, no new behavior); 5 [P2,8] ActionResult requires targetUrl (action-executor.ts:27-31) and phone-frame.ts:285-287 always alerts: ActionResult becomes a discriminated union, click handler branches (detail of approved T2); 6 [P2,8] token type is a free string and token.id registry-controlled: Send refuses types other than NATIVE and TRC20 and validates token.id with the base58check validator before any TronGrid request (extends approved UnsupportedNetwork refusal); 7 [P2,9] seed fetch must use import.meta.env.BASE_URL (prior bug, country-flag.ts:71, commit 331548c), with a test; 8 [P2,9] one PR of ~38 files with no ship-policy -> E4; 9 [P3,9] js-sha3 already a devDependency (package.json:35): TODOS.md EVM entry corrected; 10 [P3,8] local node v18.18.0 vs engines >=20 (package.json:16): wrangler under local Node unverified, assigned to T13.

### REALITY rows

REALITY: premise-table finding 12 premises checked, unverified=2 (wrangler secret put syntax; official waitUntil limit) (receipt: package.json:16)
REALITY: already-done pass origin/main == HEAD (ea9e208); no commits since 2026-10-12 on named files; src/send, worker/, public/risk-seed.json do not exist
REALITY: surface-check finding wrangler deploy/tail/rollback confirmed (developers.cloudflare.com/workers/wrangler/commands); "secret put" unconfirmed; wrangler not a devDependency; Aegis routes verified against msp-inspect-address-client.md (receipt: package.json:35)
REALITY: binding-decisions pass only the CEO decision exists; nothing here contradicts it (receipt: docs/designs/send-window-plan.md:56)
REALITY: numbers finding "~2 credits per check" [estimated] from a docs example [re-measure before gate]; "~34-38 files" and all efforts [estimated] (receipt: docs/designs/send-window-plan.md:256)
REALITY: deferred-asks finding original ask #4 named GitHub Secrets; plan uses a Worker secret plus a public repo variable (F1, D3, D4); no linked issue (receipt: docs/designs/send-window-plan.md:6)
REALITY: pr-count finding default one PR per wave; plan is one wave of ~34 files; split proposed (E4) (receipt: ea9e208)
REALITY: contract-assumptions finding plan assumes Aegis Idempotency-Key replays instead of re-billing (unverified, T13)
REALITY: dependency-fallback pass with Worker or Aegis down the site ships seed-only (R1, R5)
REALITY: prior-art n/a; obligation-tiers handled in E4
Runtime probe note: keyless TronGrid /wallet/triggerconstantcontract on USDT (TR7NHq...gjLj6t), 2026-10-13, read-only: balanceOf works from any owner (4,062 energy); transfer(1 unit) simulated from three funded holders costs 64,285 energy to an existing holder and 130,285 to a fresh zero-balance recipient (identical across all three senders); the same transfer from an unfunded sender reverts ("REVERT opcode executed", 8,624 energy, no estimate). Consequence for T5: the fee estimate needs a reference sender that holds the token (or the plan's 65k/130k constants as labeled fallback), because the demo has no real sender wallet; the estimate is labeled "estimate" in both cases. Measured once, not a benchmark.

### Eng decision ledger (history, one block per choice)
### E1: Where do tests gate code changes?
Finding: #1 [P1, confidence 9/10] .github/workflows/validate-registry.yml:11-16 (pull_request paths: registry.schema.json, fixtures/**, src/icon/domain-allowlist.ts, scripts/validate-fixtures.ts, **/*.json) and .github/workflows/deploy.yml:30-32 (steps: npm ci, npm run validate:fixtures, npm run build; no npm test); reviewer: /plan-eng-review
Plan baseline: The CEO plan's task Verify lines say `npm test` for T1-T10 but name no workflow that runs it; nothing was approved about CI test gating, so this is the original proposal.
Runtime evidence: validate-registry.yml runs `npx tsc -b` and `npm test` (lines 29-30) but only on pull_request events whose changed paths match the list above; a PR that changes only src/send/*.ts or worker/** does not match. deploy.yml runs on push to main (lines 9-10) and never runs `npm test`. This repo ships by direct pushes to main (commits 93cf85f..ea9e208 were pushed directly), so the PR workflow does not fire for them.
Comparison grid:
```text
Commitment                              | Source/approval        | Current                      | A Deploy gate + PR gate               | B Deploy gate only          | C Neither
npm test runs on push to main (deploy)  | deploy.yml:30-32       | no                           | yes (new step before build)           | yes (new step before build) | no
npm test runs on every PR               | validate-registry.yml  | only if the path filter hits | yes (drop the paths filter)           | unchanged (filtered)        | unchanged
tsc -b runs on deploy                   | deploy.yml build step  | yes (inside npm run build)   | yes                                   | yes                         | yes
Workflow files edited                   | file-count rule        | 0                            | 2 (deploy.yml, validate-registry.yml) | 1 (deploy.yml)              | 0
Workflow triggers changed               | deploy.yml:3-7 comment | n/a                          | PR trigger widened, deploy trigger unchanged | none                 | none
Direct pushes to main covered           | repo history           | no tests                     | yes                                   | yes                         | no
Code-only PRs covered                   | repo history           | no                           | yes                                   | no                          | no
```
Question D3:
D3 — E1: Where should tests block a bad change?
Project/branch/task: canvas-wallet, branch main, engineering review of the Send window plan (finding #1, P1).
ELI10: The plan adds about a dozen test files, mostly for security-sensitive logic like the address checker and the risk proxy. Today the only automatic test run is on pull requests that touch schema or JSON files, and this repo ships by pushing straight to main, where no tests run at all. So a bug in the new code could deploy with all tests red and nobody would be told.
Stakes if we pick wrong: a broken address validator or a leaky proxy response ships to the live site with no automatic stop.
Recommendation: Deploy gate plus PR gate because direct pushes to main are how this repo ships, and the PR run costs only a few CI minutes.
Completeness: A=9/10, B=7/10, C=2/10
Net: You trade one extra workflow edit for tests that stop a bad push and a bad PR alike.
Header: Test gating
Options:
A) Deploy gate and PR gate (recommended)
Effort S (human ~1h / CC ~10 min), risk low. Reuse: the existing steps in validate-registry.yml (tsc -b, npm test) and the deploy.yml build job. Verification: push a deliberately failing test to a throwaway branch and confirm both the PR run and a main-push run fail before deploy.
✅ Tests run on every push to main before deploy and on every PR, so neither shipping path skips them.
✅ Keeps deploy and validation as separate triggers, as the existing workflow comments require, since the deploy change is a step and not a trigger.
❌ Every PR now runs the full install and test job, a few extra CI minutes on changes that only edit docs.
B) Deploy gate only
Effort S (human ~30 min / CC ~5 min), risk low. Reuse: the deploy.yml build job. Verification: push a failing test to a throwaway branch and confirm the main-push run fails before deploy.
✅ One small edit stops every bad push to main, which is how this repo ships.
✅ Leaves the PR workflow and its path filter untouched.
❌ A code-only PR still gets no test run before merge, so problems appear only after the push.
C) Leave test gating as it is
Effort S (human ~0 min / CC ~0 min), risk high. Reuse: nothing. Verification: none; relies on running npm test by hand.
✅ No workflow edits and no extra CI time.
✅ Matches the repo's current behavior exactly.
❌ The security-sensitive tests this plan adds would never run automatically, so they protect nothing in practice.

State: approved
Actual answer: D3 answer 2026-10-13: "Deploy gate and PR gate (recommended)"
Accepted scope: Add an `npm test` step before `npm run build` in .github/workflows/deploy.yml's build job; remove the `paths:` filter from the pull_request trigger in .github/workflows/validate-registry.yml so it runs on every PR; the deploy workflow's push-to-main trigger is unchanged (step only, not a trigger change). New task T14 covers it (verification: a deliberately failing test on a throwaway branch fails both the PR run and a main-push run before deploy). Nothing else approved.
History: none
### E2: How does a live risk check get from Aegis to the phone?
Finding: #2 [P2, confidence 7/10] docs/designs/send-window-plan.md Section 7 ("the Worker keeps polling in the background so a retry is a free cache hit") against aegis-platform docs/clients/msp-inspect-address-client.md section 4a (always 202, poll GET /v2/inspect/{session_id}/result every 2-5 s, up to about 115 s); reviewer: /plan-eng-review (web evidence: third-party reports that ctx.waitUntil() does not extend a Worker's time limit; official wording unconfirmed)
Plan baseline: Approved by the CEO review: R1 hybrid seed + Worker, R10 client holds Send up to 15 s then treats the check as unavailable, R5 states, response shape exactly {level, label?}, RISK_ENABLED kill switch. NOT approved: how the Worker waits for Aegis; Section 7's background-polling sentence was an unverified assumption owned by T13(b).
Runtime evidence: Aegis POST /v2/inspect-address always returns 202 with a session_id and a retry_url (client doc section 4); billing happens once on the first GET .../result that returns completed (section 4a). The plan's Worker must therefore either be polled by the client, hold one request open, or finish work after the response. Unverified: Worker wall-time and subrequest limits for a ~25 s request, and how long waitUntil work may run. No Worker code exists yet (worker/ does not exist).
Comparison grid:
```text
Commitment                              | Source/approval          | Current            | A Client polls through the Worker | B One long request          | C Background completion (Queue / DO alarm)
Who polls Aegis                         | client doc 4a            | unspecified        | client, once per tick via Worker  | Worker, inside one request  | Worker, after the response
Worker invocation length                | Cloudflare limits (unverified) | unspecified  | short (one Aegis call)            | up to about 25 s           | short + background task
Endpoints                               | plan R1                  | POST /check        | POST /check + GET /check/{handle} | POST /check                 | POST /check + GET /check/{handle}
New Cloudflare bindings                 | wrangler.toml            | KV                 | KV                                | KV                          | KV + Queue or Durable Object alarm
Retry after the client's 15 s hold      | R10 approved             | unspecified        | same handle keeps going, billed once on completion | re-submit, relies on idempotent session | free cache hit when the background finishes
Depends on an unverified Cloudflare limit | web evidence           | yes                | no                                | yes (wall time, subrequests) | yes (plan limits)
Counts against the daily budget         | R4 approved (lean controls) | each POST      | only the session-creating POST    | each POST                   | each POST
Shared and fixed in every option        | R1, R5, R10, R4         | approved           | response is exactly {level, label?}; seed first; RISK_ENABLED; 15 s client hold; fail closed per R4 | same | same
```
Question D4:
D4 — E2: How should a live risk check travel from Aegis to the phone?
Project/branch/task: canvas-wallet, branch main, engineering review of the Send window plan (finding #2, P2).
ELI10: A live Aegis check takes 5 to 30 seconds and can take up to about two minutes. A Cloudflare Worker is built for short requests, so it cannot be assumed to keep working quietly after it has replied. The plan assumed it could. There are three ways to wait for Aegis: let the phone ask repeatedly through the Worker, hold one long request open, or finish in the background.
Stakes if we pick wrong: a Worker that relies on background time it may not get drops live checks silently or double-bills them; an over-built option adds infrastructure for a demo with only tens of live checks.
Recommendation: Client-driven polling because every Worker call stays short, nothing depends on an unverified Cloudflare limit, and a check that outlives your 15-second hold can still finish and be billed once.
Completeness: A=9/10, B=6/10, C=8/10
Net: You trade a second endpoint and a small handle table for a protocol that works whatever Cloudflare allows after a reply.
Header: Risk check path
Options:
A) Client polls through the Worker (recommended)
Effort M (human ~1 day / CC ~40 min), risk low. Reuse: StaleFetchGuard for stale replies and the KV cache already approved in R4. POST /check returns either the cached verdict or a pending handle; GET /check/{handle} makes one Aegis poll and returns pending or the verdict; the Worker keeps its own random handle, never the Aegis session id. Verification: Worker tests for create, poll, done, expired handle and the exact {level, label?} body; a test that only the session-creating POST counts against the daily budget; a client test of the 15 s hold with fake timers.
✅ Every Worker call is short, so nothing depends on how long Cloudflare lets a request or background task run.
✅ A user who waits past 15 seconds and taps Check again continues the same check, and it is billed once when it completes.
❌ Two endpoints and a handle table in KV to build, test and expire.
B) One long request
Effort S (human ~half day / CC ~20 min), risk medium. Reuse: the same KV cache. POST /check holds the request and polls Aegis every 2 s for up to about 25 s, then returns the verdict or unavailable. Verification: Worker tests with a mocked Aegis that returns running then completed, and a timeout case.
✅ One endpoint and the least code, with the same four client states.
✅ No handle table or second route to maintain.
❌ Holds a Worker invocation open for up to 25 seconds per live check against wall-time and subrequest limits nobody has verified, and a retry after the 15-second hold submits again.
C) Background completion with a Queue or alarm
Effort L (human ~2-3 days / CC ~1.5h), risk high. Reuse: the KV cache plus a new Queue or Durable Object alarm binding. The Worker replies pending at once and a background task polls Aegis to completion and writes the verdict. Verification: tests for the background task, retry and dedupe, plus a live run to learn the real limits.
✅ The check finishes even if the user leaves, so any later retry is a free cache hit.
✅ Each Worker request stays short.
❌ Adds a new Cloudflare binding and plan-limit questions for a demo whose live budget is only tens of checks.

State: superseded
Actual answer: D4 answer 2026-10-13: "Client polls through the Worker (recommended)" (superseded by A1, user directive to use the synchronous /v2/screen endpoint)
Accepted scope: Worker exposes POST /check (returns the cached verdict, or a pending handle after creating one Aegis session) and GET /check/{handle} (one Aegis poll per call, returns pending or the verdict). The Worker keeps its own random handle in KV with a TTL and never returns the Aegis session id. Verdict cached in KV on completion. Only the session-creating POST counts against the daily budget; polls have a separate cheap per-visitor limit. Response body stays exactly {level, label?}. Client polls on a timer inside the approved 15 s hold (R10) and 'Check again' continues the same handle. No background work, no Queue, no alarm. Counter mechanism stays pending in E3; Idempotency-Key handling stays T13(a). Nothing else approved.
History: none
### E3: What makes the per-visitor limit and daily budget atomic?
Finding: #3 [P1, confidence 8/10] docs/designs/send-window-plan.md Section 6 ("KV counters are not atomic ... the implementation owner must prove an atomic counter") and ledger row R4 (D8: per-visitor limit, global daily budget, spend bounded by the daily budget and the provider cap); reviewer: /plan-eng-review (web evidence, third-party: KV is eventually consistent and same-key writes are rate-limited; Durable Objects serialize requests per object)
Plan baseline: R4 / D8 approved 2026-10-13: Lean controls, spend bounded by a daily budget and the provider monthly cap, per-visitor limit, fail closed when the store is down, no Turnstile. The counter mechanism was NOT chosen.
Runtime evidence: No Worker code exists. A KV counter is a read-then-write, so two concurrent checks can both read the same count and both proceed; the daily budget can then overshoot by the size of a concurrent burst. The provider monthly cap still bounds total spend. Unverified: whether Durable Objects are enabled on the Cloudflare account that will host this Worker, and their current free-tier limits.
Comparison grid:
```text
Commitment                                  | Source/approval        | Current          | A Durable Object counter                   | B KV counters, approximate
Daily budget is a strict ceiling            | D8 approved            | unspecified      | yes (atomic)                               | no (can overshoot by a concurrent burst)
Per-visitor limit is strict                 | D8 approved            | unspecified      | yes (atomic)                               | no (approximate)
Provider monthly cap is the hard backstop   | R1, D8 approved        | yes              | yes                                        | yes
Fail closed when the store is unavailable   | R4 approved            | yes              | yes (DO error means unavailable)           | yes (KV error means unavailable)
New Cloudflare binding                      | wrangler.toml          | KV               | KV + Durable Object class and migration    | KV only
Logic unit-testable in vitest               | tests/ + tsconfig      | n/a              | yes, pure Counter class with injected storage; the thin DO wrapper is checked in wrangler dev | yes, injected KV fake
Depends on an unverified account capability | web evidence           | none             | DO availability and limits on this account | none
Shared and fixed in both                    | R1, R4, E2             | approved         | response {level, label?}; budget counts only session-creating POSTs (E2); RISK_ENABLED | same
```
Question D5:
D5 — E3: How should the Worker count requests so the limits really hold?
Project/branch/task: canvas-wallet, branch main, engineering review of the Send window plan (finding #3, P1).
ELI10: You approved a per-visitor limit and a daily spending ceiling on the paid risk check. Counting in Cloudflare's key-value store is like two cashiers both reading the same tally sheet at once: both think there is one check left and both let a customer through. A Durable Object is a single counter that serves one request at a time, so the tally is always right.
Stakes if we pick wrong: with the approximate counter a burst of simultaneous requests can spend past the daily ceiling you approved, leaving only the monthly cap to stop it; with the exact counter the Worker needs one more Cloudflare capability that nobody has checked on your account.
Recommendation: Durable Object counter because it is the only option that keeps the daily ceiling you approved a real ceiling, and the counting logic can still be unit-tested as a plain class.
Completeness: A=9/10, B=5/10
Net: You trade one extra Cloudflare binding for a ceiling that actually holds under a burst.
Header: Limit counters
Options:
A) Durable Object counter (recommended)
Effort M (human ~1 day / CC ~40 min), risk medium. Reuse: the pure counting logic is a plain class with an injected storage object, so vitest tests it like the existing modules; the Durable Object class is a thin wrapper plus a wrangler.toml migration. Verification: unit tests for exact ceiling and window rollover under simulated concurrent calls, plus one manual run in wrangler dev. Unverified: that Durable Objects are enabled on the account, which T13 must confirm before building.
✅ The daily ceiling and the per-visitor limit hold exactly even under a burst of simultaneous requests.
✅ The provider monthly cap stays as a second backstop, so overspend needs two failures.
❌ Adds a Durable Object binding and migration, and its availability on your Cloudflare account is unconfirmed.
B) KV counters, approximate
Effort S (human ~half day / CC ~15 min), risk medium. Reuse: the same KV namespace already used for the cache. Verification: unit tests with an injected KV fake; the overshoot is documented, not prevented. This weakens the approved D8 wording (spend bounded by a daily budget) to a soft budget plus the provider cap, so choosing it is an explicit change to that guarantee.
✅ No new Cloudflare binding, so nothing extra to enable on your account.
✅ The smallest build and the easiest to test.
❌ A burst can overshoot the daily ceiling, so only the monthly cap is a hard stop, which is weaker than the approved ceiling.

State: approved
Actual answer: D5 answer 2026-10-13: "Durable Object counter (recommended)"
Accepted scope: The per-visitor limit and the global daily budget are counted by a Durable Object (atomic). Counting logic is a pure Counter class with an injected storage object, unit-tested in vitest under simulated concurrent calls; the Durable Object class is a thin wrapper with a wrangler.toml migration, checked manually in wrangler dev. KV stays for the verdict cache and handles. The provider monthly cap remains the second backstop. Precondition: T13 confirms Durable Objects are enabled on the target Cloudflare account BEFORE this is built; if they are not, this row reopens for a new decision (KV is not selected automatically). Nothing else approved.
History: none
### E4: How many pull requests should the Send window ship in?
Finding: #8 [P2, confidence 9/10] pr-count reality row: no .gstack/ship-policy.json exists (ls .gstack: No such file), so the default is one PR per wave; docs/designs/send-window-plan.md lists 13 tasks (T1-T13) and about 34 changed files [estimated, after D2] with no PR grouping; reviewer: /plan-eng-review
Plan baseline: Approved: CEO rollout order (plan Section 9: deploy the Worker by hand, smoke test, set the public repo variable VITE_RISK_PROXY_URL, merge the site change); an empty VITE_RISK_PROXY_URL gives a seed-only site (R1 hybrid). No approval about how the work is split into PRs; original proposal is a single wave.
Runtime evidence: Prior features in this repo landed as single large commits, for example 6f12347 (two-screen wallet flow) and 8f8beeb (Gallery main page). The seed-only mode is a real, shippable midpoint because risk-client falls back to the seed when the proxy URL is empty. Cost of each extra PR [estimated]: one more review round, one more CI run (about 2 minutes) and one more Pages deploy (about 1 minute); user-facing references (Send button, seed verdicts) only appear in the second PR.
Comparison grid:
```text
Commitment                             | Source/approval         | Current          | A Three PRs                         | B One PR (default)          | C Two PRs
PR contents                            | plan tasks T1-T13       | one wave         | PR1 foundations, PR2 Send flow (seed-only), PR3 live check (Worker) | everything          | PR1 all client work, PR2 Worker
Changed files per PR [estimated]       | D2 (about 34 total)     | about 34         | about 12 / 14 / 8                   | about 34                    | about 26 / 8
User-visible change after each merge   | R1, R3                  | none             | none / Tron Send with instant seed verdicts / live checks for any address | all at once | Send with seed verdicts / live checks
CI test and secret guards land first   | E1 approved, R11 approved | not yet        | yes, in PR1, before any Worker secret exists | with everything       | with the client PR
Blast radius of a revert               | rollback plan (plan Section 9) | whole wave | one PR at a time                    | whole feature               | client or Worker
Extra review, CI and deploy cost       | pr-count row            | none             | 2 extra rounds, about 4 extra CI minutes and 2 extra Pages deploys [estimated] | none | 1 extra round
Seed-only midpoint shipped and testable | R1 hybrid              | n/a              | yes (after PR2)                     | no                          | yes (after PR1)
Fixed in every option                  | R1-R11, D2-D5           | approved         | same features, contracts, tests and fixes | same                 | same
```
Question D6:
D6 — E4: Should the Send window ship as one pull request or in stages?
Project/branch/task: canvas-wallet, branch main, engineering review of the Send window plan (finding #8, P2).
ELI10: The whole feature is about 34 files and 13 tasks. Shipped as one pull request it is hard to review and any problem means reverting everything. The plan already has a natural midpoint: the site works on its own with instant demo verdicts (seed-only) before the live Worker exists. Splitting follows that line.
Stakes if we pick wrong: one giant change hides a mistake in the security-sensitive Worker among 30 UI files, and a revert removes the safe parts with the risky ones; too many tiny PRs just add review rounds for a one-person project.
Recommendation: Three PRs because the test gate and the secret guard land first, the seed-only Send flow ships and can be tried before any key exists, and the Worker arrives last where it can be reverted alone.
Note: options differ in kind, not coverage — no completeness score.
Net: You trade two extra review rounds for smaller reviews and a revert that touches only one stage.
Header: PR split
Options:
A) Three PRs in stages (recommended)
Effort S (human +2h / CC +10 min), risk low. PR1 foundations (about 12 files): schema 1.1.0 + gate + fixtures, ActionResult union, deploy/PR test gating (E1), dist secret check. PR2 Send flow in seed-only mode (about 14 files): send-input, fee, risk client + seed, session, Send screen, phone wiring, e2e. PR3 live check (about 8 files): Worker + Durable Object + wrangler.toml, deploy variable, CONTRIBUTING runbook. Verification: each PR passes the E1 gates on its own and the site is usable after each merge.
✅ The test gate and secret guard exist before any secret or live code, so PR2 and PR3 are checked by them.
✅ After PR2 the Tron Send demo works with instant seed verdicts and no key anywhere, and PR3 reverts alone.
❌ Two more review rounds, CI runs and Pages deploys, roughly four extra CI minutes [estimated].
B) One pull request
Effort S (human ~0 / CC ~0), risk medium. All 13 tasks and about 34 files in a single PR, as the default policy would do. Verification: one CI run covers the whole change.
✅ Least process: one review, one CI run and one deploy.
✅ No intermediate states to reason about.
❌ A reviewer must hold the Worker's security logic and 30 UI files at once, and a revert removes all of it.
C) Two pull requests
Effort S (human +1h / CC +5 min), risk low. PR1 all client work including schema, gating, seed-only Send (about 26 files); PR2 the Worker and runbook (about 8 files). Verification: PR1 passes E1 gates and works seed-only; PR2 adds live checks.
✅ Keeps the Worker, the riskiest piece, in its own small PR that reverts alone.
✅ Only one extra review round and deploy.
❌ The first PR is still large at about 26 files, so the schema, gating and UI changes are reviewed together.

State: approved
Actual answer: D6 answer 2026-10-13: "Three PRs in stages (recommended)"
Accepted scope: Ship in three PRs in this order: PR1 foundations (schema 1.1.0 + gate + fixtures, ActionResult union, deploy/PR test gating from E1, dist secret check from R11); PR2 the Send flow in seed-only mode (send-input, tron-fee, risk-client + seed, send-session, send-screen, phone wiring, opt-in data edits, Send e2e), working with VITE_RISK_PROXY_URL unset; PR3 the live check (Worker with Durable Object counter and wrangler.toml, deploy variable, CONTRIBUTING runbook). Each PR must pass the E1 gates on its own and leave the site usable. File counts per PR are [estimated]. Nothing else approved.
History: none
### E5: Where does the RISK_ENABLED kill switch live now that Cloudflare deploys from Git?
Finding: #2 [P1, confidence 9/10] worker/wrangler.toml:10-17 (`[vars]` with `RISK_ENABLED = "true"` and no `keep_vars`); Cloudflare docs: "If you change your environment variables in the Cloudflare dashboard, Wrangler will override them the next time you deploy."; reviewer: /plan-eng-review
Plan baseline: R4/CONTRIBUTING.md approve a `RISK_ENABLED` kill switch ("set the Worker variable RISK_ENABLED to false"). Nothing approved about where the value lives or how it survives a deploy. Deploys now come from Cloudflare's Git integration on every push to main (user directive, plan amendment A2).
Runtime evidence: Probe 2026-10-13: Cloudflare account API lists the deployed Worker `canvas-wallet` with five plain_text vars (AEGIS_BASE_URL, ALLOWED_ORIGIN, DAILY_BUDGET, PER_VISITOR_PER_HOUR, RISK_ENABLED), i.e. the values come from wrangler.toml. Docs: dashboard edits to variables are overwritten by the next Wrangler deploy; secrets are not deleted by deploy unless `wrangler secret delete`. How `keep_vars = true` interacts with a name that also exists in wrangler.toml is not stated on the page (unverified).
Comparison grid:
```text
Commitment                              | Source/approval            | Current                         | A RISK_ENABLED as a Worker secret | B keep_vars + dashboard flip   | C Flip by editing wrangler.toml and pushing
Where the switch value lives            | CONTRIBUTING.md            | wrangler.toml [vars] (public)   | Worker secret (dashboard or CLI)  | dashboard variable             | git (public file)
Survives a push-deploy                  | Cloudflare docs            | NO (overwritten by the push)    | yes                               | yes if keep_vars behaves as read (unverified) | n/a (the push is the change)
Time to turn live checks off            | R4 intent                  | until the next push             | seconds (dashboard)               | seconds (dashboard)            | about a minute (push + build)
Behavior when the value is missing      | R5 fail closed             | n/a                             | off (seed only)                   | off (seed only)                | n/a
Files edited                            | file-count rule            | 0                               | wrangler.toml, CONTRIBUTING.md    | wrangler.toml, CONTRIBUTING.md | CONTRIBUTING.md
Other limits (DAILY_BUDGET, PER_VISITOR_PER_HOUR) | R4 approved      | wrangler.toml [vars]            | unchanged                         | unchanged                      | unchanged
Shared and fixed in every option        | R1, R4, R5, A1, A2         | approved                        | live checks only run when the switch says so; seed-only site otherwise | same | same
```
Question D1:
D1 — E5: Где живёт выключатель живых проверок RISK_ENABLED, если Cloudflare теперь деплоит из Git?
Project/branch/task: canvas-wallet, ветка main, повторное инженерное ревью плана Send (находка 2, P1).
ELI10: Выключатель нужен на случай, когда Aegis сломался или кто-то льёт запросы: одно значение отключает живые проверки, и сайт работает на заготовленном списке адресов. Сейчас значение записано в публичном файле wrangler.toml. Cloudflare при каждом деплое из Git перезаписывает переменные, которые вы поменяли в панели. То есть вы выключите проверки в панели, а следующий push включит их обратно.
Stakes if we pick wrong: вы думаете, что проверки отключены, а очередной push тихо включил их снова, и деньги за Aegis продолжают тратиться.
Recommendation: A, секрет Worker, потому что секреты Cloudflare не перезаписываются деплоем, меняются за секунды и не зависят от неподтверждённого поведения keep_vars.
Completeness: A=9/10, B=6/10, C=7/10
Net: вы выбираете между мгновенным выключателем, который переживает деплой (A), и выключателем через Git, зато без новых механизмов (C).
Header: Выключатель
Options:
A) Секрет Worker (recommended)
Effort S (human ~1h / CC ~10 min), risk low. Reuse: тот же механизм секретов, что у AEGIS_API_KEY. Verification: тест Worker, что без значения и со значением, отличным от "true", /check отвечает только по заготовленному списку; вручную: сменить секрет в панели и проверить /health.
✅ Секрет переживает любой деплой из Git и меняется в панели за секунды.
✅ Нет значения, значит проверки выключены: при ошибке настройки сайт остаётся на заготовленном списке, а не тратит деньги.
❌ Значение не видно в панели после ввода, и при первом деплое его нужно один раз задать вручную.
B) Переменная панели + keep_vars
Effort S (human ~30 min / CC ~10 min), risk medium. Reuse: переменные панели. Verification: после деплоя убедиться, что значение из панели осталось.
✅ Значение видно в панели и меняется за секунды.
✅ Не нужен ввод секрета.
❌ Как keep_vars работает для имени, которое есть и в wrangler.toml, в документации не сказано; поведение придётся проверять на реальном деплое.
C) Менять wrangler.toml и пушить
Effort S (human ~0 / CC ~0), risk medium. Reuse: Git как единственный источник. Verification: нет.
✅ Ничего нового, значение всегда видно в репозитории.
✅ Не надо ничего вводить в панели.
❌ Выключение занимает около минуты (push и сборка) и требует доступа к репозиторию именно в аварии.

State: approved
Actual answer: D1 answer 2026-10-13: "Секрет Worker (recommended)"
Accepted scope: RISK_ENABLED is a Worker secret, not a wrangler.toml var. Live checks run only when its value is exactly "true"; a missing or any other value means seed-only (fail closed). The secret survives Git deploys and is changed in the Cloudflare dashboard or with `wrangler secret put RISK_ENABLED`; it must be set once after the first real deploy. wrangler.toml and CONTRIBUTING.md drop the RISK_ENABLED var when T9/T11 land (not edited during this review). DAILY_BUDGET and PER_VISITOR_PER_HOUR stay as wrangler.toml vars (git is their source of truth). Nothing else approved.
History: none
### E6: How is Aegis risk level `medium` shown?
Finding: #3 [P1, confidence 8/10] docs/designs/send-window-plan.md amendment A1 ("medium -> medium, high/critical/sanctioned -> high") against the four client states in R5/R10 (CHECKING, CLEAR, CAUTION, UNAVAILABLE); docs.aegis-kyt.com/api-reference/v2-screen lists risk_level: none, low, medium, high, critical, sanctioned; reviewer: /plan-eng-review
Plan baseline: R5 (D6, approved): CAUTION shows the popup on Send, CLEAR and UNAVAILABLE do not; user ask #5: popup "if risk is high". DR2/DR3 (design review, approved): CAUTION = amber status line + popup on Send; CLEAR without label = neutral "No risk signals found". Nothing approved about `medium`.
Runtime evidence: A1 (written by me from the Aegis docs page, read 2026-10-13) introduced a third level `medium` into the Worker contract `{level, label?}` but the client has no state for it. Aegis docs: `none` means no signal, not clean; `medium` is a real elevated level. No Worker or client code exists yet.
Comparison grid:
```text
Commitment                           | Source/approval          | Current              | A medium = CAUTION (popup on Send) | B medium = amber inline note, popup only for high | C medium = CLEAR wording
Client states                        | R5, R10                  | 4 (no place for medium) | 4 (unchanged)                    | 5 (adds a MEDIUM state)                            | 4 (unchanged)
Status line for medium               | DR2, DR3                 | unspecified          | amber "Caution: we don't recommend sending here" | amber "Elevated risk, double-check the address" | neutral "No risk signals found" (false for medium)
Popup on Send for medium             | R5, user ask #5          | unspecified          | yes                                | no                                                  | no
Popup for high, critical, sanctioned | R5, DR2                  | yes                  | yes                                | yes                                                 | yes
Worker response contract             | A1, R1                   | {level, label?} with levels none/low/medium/high | levels clear, caution, unknown   | levels clear, medium, caution, unknown              | levels clear, caution, unknown
UI copy to write and test            | DR2, D12                 | 1 caution copy       | 1 caution copy (no new copy)        | 2 copies + 1 more state in tests                    | none
Shared and fixed in every option     | R1, R5, D12, A1, DR2-DR14 | approved            | `none`/`low` with data = clear, `none` without data = unknown, high/critical/sanctioned = caution, unavailable = unknown | same | same
```
Question D2:
D2 — E6: Как показывать уровень риска medium от Aegis?
Project/branch/task: canvas-wallet, ветка main, повторное инженерное ревью плана Send (находка 3, P1).
ELI10: Aegis `/v2/screen` возвращает уровни none, low, medium, high, critical, sanctioned. В плане клиент знает только четыре состояния: проверка идёт, чисто, осторожно и не удалось проверить. Попап по вашему замыслу показывается, если риск высокий. Что делать со средним, нигде не сказано, а я в A1 вписал `medium` в ответ Worker, не решив, как его показывать.
Stakes if we pick wrong: либо средний риск молча показывается как «сигналов нет» (ложное спокойствие), либо мы получаем лишнее состояние экрана, которое придётся оформлять и тестировать.
Recommendation: A, medium как CAUTION, потому что четыре состояния остаются, текст попапа уже утверждён вами, а лишнее предупреждение здесь безопаснее пропущенного (Send anyway остаётся).
Completeness: A=9/10, B=7/10, C=3/10
Net: вы выбираете между простотой и осторожностью (A) и более тонким различием уровней ценой пятого состояния (B).
Header: Уровень medium
Options:
A) medium как CAUTION (recommended)
Effort S (human ~1h / CC ~10 min), risk low. Reuse: четыре состояния R5 и текст D12. Verification: тест Worker, что medium, high, critical и sanctioned дают одинаковый ответ caution без score, reason и флагов; клиентский тест, что caution открывает попап только по Send.
✅ Четыре состояния остаются, нового копирайта и новых тестов состояния нет.
✅ Осторожная сторона: средний риск не выглядит спокойным, а Send anyway остаётся.
❌ Часть адресов со средним риском получит сильную формулировку «We don't recommend», хотя риск не высокий.
B) medium как янтарная заметка без попапа
Effort M (human ~3h / CC ~25 min), risk medium. Reuse: строка статуса из DR2. Verification: те же тесты Worker плюс новое состояние MEDIUM в deriveSendView и в DOM-тестах.
✅ Различает средний и высокий риск: попап только для высокого, как в вашем исходном замысле.
✅ Не показывает «не рекомендуем» там, где риск средний.
❌ Пятое состояние экрана: новый текст, новые тесты и правка дизайна DR2, который уже утверждён.
C) medium как «сигналов нет»
Effort S (human ~30 min / CC ~5 min), risk high. Reuse: состояние CLEAR. Verification: тест Worker, что medium даёт clear.
✅ Минимум кода и текста.
✅ Попап остаётся только для действительно высокого риска.
❌ Показывает «No risk signals found» для адреса, у которого сигнал есть: это неправда на экране кошелька.

State: approved
Actual answer: D2 answer 2026-10-13: "medium как CAUTION (recommended)"
Accepted scope: Worker maps Aegis verdict.risk_level to exactly three client levels: medium, high, critical and sanctioned -> caution; low, or none with coverage.data_available true -> clear; none with data_available false, any unknown value, Aegis 4xx/5xx/timeout -> unknown. The client keeps its four states (CHECKING, CLEAR, CAUTION, UNAVAILABLE); caution shows the DR2 amber status line and the D12 popup on Send. No score, level name, reason or flags leave the Worker. Nothing else approved.
History: none
### E7: Does the owner label travel with a caution result?
Finding: #4 [P1, confidence 8/10] docs/designs/send-window-plan.md amendment A1 ("label only from verdict.label (may be null), sanitized") and R1 ("response is exactly {level, label?}"); docs.aegis-kyt.com/api-reference/v2-screen (verdict.label "a human-readable counterparty name"); user ask #5 ("No reasons disclosed"); reviewer: /plan-eng-review
Plan baseline: R1/A1: Worker returns exactly {level, label?}; label is the sanitized verdict.label. User ask #5 and D12: the caution popup discloses no score, reason or flags. DR3: a green owner label with a check is shown when verdict.label is present. Nothing approved about a label on a caution result.
Runtime evidence: Aegis docs (read 2026-10-13): label is a counterparty name and "may be null"; the same response carries risk_category_detail and labels[] that name the reason. A name such as a mixer, scam or sanctioned entity is itself a reason. No Worker or client code exists yet, so nothing is leaking today.
Comparison grid:
```text
Commitment                                  | Source/approval | Current                        | A Worker drops the label unless the level is clear | B Worker always passes the label; client hides it on caution | C Worker always passes the label; client shows it on caution
Label in the Worker response on caution     | R1, A1          | allowed (unspecified)          | never                                               | yes                                                           | yes
Label visible on screen on caution          | DR3, user ask #5| unspecified                    | never                                               | never                                                         | yes
Where the rule is enforced                  | R1 contract     | none                           | Worker (the only place the data exists)             | client only                                                   | none
Reason can reach the browser (network tab)  | user ask #5     | possible                       | no                                                            | yes (label in the JSON)                                       | yes
Worker response contract                    | R1              | {level, label?}                | {level, label?} with label present only for clear   | {level, label?}                                               | {level, label?}
Tests to write                              | R1              | exact-keys test                | exact-keys test + caution never has a label         | client test only                                              | none
Shared and fixed in every option            | R1, R5, D12, E6 | approved                       | same                                                | same                                                          | same
```
Question D3:
D3 — E7: Передавать ли метку владельца, когда адрес признан рискованным?
Project/branch/task: canvas-wallet, ветка main, повторное инженерное ревью плана Send (находка 4, P1).
ELI10: Aegis может вернуть имя владельца адреса. Для биржи это приятно (зелёная отметка), но имя вроде «микшер» или «мошеннический кошелёк» само по себе объясняет, почему адрес опасен, а вы просили причин не раскрывать. Worker, как я его описал, пропустил бы любую метку.
Stakes if we pick wrong: попап не показывает причину, но она видна в ответе сервера во вкладке Network браузера или в строке статуса рядом с янтарным предупреждением.
Recommendation: A, Worker отдаёт метку только для результата clear, потому что это единственное место, где ограничение нельзя обойти открыв DevTools.
Completeness: A=9/10, B=6/10, C=2/10
Net: вы выбираете между защитой на сервере (A) и защитой только в интерфейсе, которую видно в сети (B).
Header: Метка при риске
Options:
A) Метка только для clear (recommended)
Effort S (human ~1h / CC ~10 min), risk low. Reuse: функция приведения ответа Aegis к {level, label?} в Worker. Verification: тест Worker с мок-ответом Aegis, где risk_level high и label непустая: в ответе только {level: caution}; тест, что для clear метка проходит очистку и ограничение длины.
✅ Причина не покидает Worker: её не видно ни в интерфейсе, ни во вкладке Network.
✅ Исполняет вашу просьбу «причины не раскрывать» буквально и проверяется одним тестом.
❌ Для рискованного адреса пользователь не увидит, что это, например, известная биржа с повышенным риском.
B) Метку отдаёт Worker, прячет клиент
Effort S (human ~1h / CC ~10 min), risk medium. Reuse: клиентский deriveSendView. Verification: клиентский тест, что при caution метка не рисуется.
✅ Worker проще: передаёт поле как есть.
✅ Метка остаётся доступной для отладки в сети.
❌ Причина лежит открытым текстом в ответе сервера: любой, кто откроет DevTools, её увидит.
C) Показывать метку и при риске
Effort S (human ~30 min / CC ~5 min), risk high. Reuse: DR3. Verification: нет дополнительных тестов.
✅ Полная информация для пользователя.
✅ Нет специальной логики.
❌ Нарушает «причины не раскрывать»: имя владельца часто и есть причина.

State: approved
Actual answer: D3 answer 2026-10-13: "Метка только для clear (recommended)"
Accepted scope: The Worker returns `label` only when the final level is clear (after sanitizing and a length limit); for caution and unknown the response is exactly {level} with no label key. Contract stays {level, label?}. Worker test: a mocked Aegis high-risk response with a non-empty verdict.label yields exactly {level: "caution"}. The client never renders a label on caution. Nothing else approved.
History: none
### E8: Do tests gate the Worker deploy that Cloudflare runs from Git?
Finding: #5 [P1, confidence 7/10] .github/workflows/deploy.yml (GitHub Pages deploy; E1 adds `npm test` there) against the Cloudflare Git deploy of worker/ added on the user's instruction (plan amendment A2); worker/wrangler.toml:1-8; reviewer: /plan-eng-review
Plan baseline: E1 (D3, approved): `npm test` runs before the GitHub Pages build and on every PR. D3 (CEO review): manual Worker deploy; that was replaced by the user's own choice to connect the repo to Cloudflare (A2). Nothing approved about gating the Cloudflare deploy.
Runtime evidence: Probe 2026-10-13: the Worker `canvas-wallet` is live at https://canvas-wallet.maslovsa.workers.dev/health and answers {"ok":true}, i.e. it deployed from the repo files pushed in b242ea9. GitHub Actions and Cloudflare Builds are independent triggers on the same push: a red GitHub test run does not stop Cloudflare. Whether Cloudflare's build step can run the repo-level `npm ci && npm test` from a `worker` root directory, and whether watch paths can limit builds to worker/** and tests/**, is unverified (Cloudflare build settings not readable with the current token).
Comparison grid:
```text
Commitment                                  | Source/approval         | Current                        | A Cloudflare build runs the tests first | B Leave Cloudflare ungated        | C GitHub Actions deploys after tests
A failing test blocks the Worker deploy      | E1 intent               | no                             | yes                                     | no                                | yes
Who deploys the Worker                       | A2 (user)               | Cloudflare Git integration     | Cloudflare Git integration              | Cloudflare Git integration        | GitHub Actions (wrangler deploy)
Secrets needed in GitHub                     | CEO D3: none            | none                           | none                                    | none                              | Cloudflare API token as a GitHub secret
Build triggers only for relevant changes     | cost                    | every push to main             | worker/** and tests/** (watch paths, unverified) | every push                     | worker/** (workflow paths)
Files/settings changed                       | file-count rule         | 0                              | 2 settings in the Cloudflare UI + CONTRIBUTING.md | 0                             | new workflow file + GitHub secret + disconnect Git build
Verification                                 | E1 style                | none                           | push a failing test, confirm Cloudflare build fails and the old Worker stays live | none | push a failing test, confirm the deploy job does not run
Shared and fixed in every option             | A1, A2, E5, E6, E7      | approved                       | same                                    | same                              | same
```
Question D4:
D4 — E8: Проверять ли тесты перед деплоем Worker, который Cloudflare делает из Git?
Project/branch/task: canvas-wallet, ветка main, повторное инженерное ревью плана Send (находка 5, P1).
ELI10: Вы подключили репозиторий к Cloudflare, и теперь каждый push в main сам обновляет живой Worker. GitHub при этом отдельно гоняет тесты и деплоит сайт, но Cloudflare его результата не ждёт. Если в будущем Worker с багом (например, лишний ответ с причиной риска) попадёт в main, он станет живым даже при красных тестах.
Stakes if we pick wrong: ошибка в Worker, которую тесты поймали бы, уходит в прод и тратит деньги за Aegis или раскрывает лишнее.
Recommendation: A, прогон тестов в сборке Cloudflare, потому что сохраняет ваш выбор Git-деплоя, не требует секретов в GitHub и закрывает дыру настройками в панели.
Completeness: A=8/10, B=3/10, C=9/10
Net: вы выбираете между двумя настройками в панели Cloudflare (A, часть шагов проверяется на практике) и переносом деплоя в GitHub с новым секретом (C).
Header: Тесты и деплой
Options:
A) Тесты в сборке Cloudflare (recommended)
Effort S (human ~1h / CC ~10 min), risk medium. Reuse: npm test из E1. Verification: запушить намеренно красный тест в тестовую ветку и убедиться, что сборка Cloudflare падает, а предыдущая версия Worker остаётся живой.
✅ Красные тесты блокируют деплой Worker, сохраняя ваш Git-деплой Cloudflare без секретов в GitHub.
✅ Watch paths (worker/** и tests/**) избавляют от лишних пересборок при правках документации.
❌ Применимость build command из подкаталога worker и watch paths проверяется только на реальной сборке (T13), настройки живут в панели, а не в репозитории.
B) Оставить без проверки
Effort S (human ~0 / CC ~0), risk high. Reuse: нет. Verification: нет.
✅ Ничего не меняем, деплой остаётся мгновенным.
✅ Нет зависимости от настроек панели.
❌ Красные тесты не останавливают деплой Worker; единственная защита — ваша внимательность перед push.
C) Деплой Worker из GitHub Actions после тестов
Effort M (human ~3h / CC ~25 min), risk medium. Reuse: workflow deploy.yml и E1. Verification: красный тест не запускает job деплоя Worker.
✅ Деплой строго после тестов, всё в репозитории и под review.
✅ Одна точка правды для сайта и Worker.
❌ Нужен секрет с токеном Cloudflare в GitHub и отключение Git-сборки Cloudflare: отменяет ваш выбор подключить репозиторий и откатывает решение CEO-ревью «секретов GitHub не использовать».

State: approved
Actual answer: D4 answer 2026-10-13: "Тесты в сборке Cloudflare (recommended)"
Accepted scope: Cloudflare Workers Builds (Git integration, root directory worker) runs the repo tests before `wrangler deploy` (build command along the lines of `cd .. && npm ci && npm test`, exact form confirmed in T13), with watch paths limited to worker/** and tests/** (also confirmed in T13). A failing test makes the Cloudflare build fail and the previous Worker version stays live. The settings live in the Cloudflare dashboard and are written into the CONTRIBUTING.md runbook. No GitHub secret is added. Verification: push a deliberately failing test on a throwaway branch and confirm the Cloudflare build fails. If the build command cannot reach the repo root, this row reopens. Nothing else approved.
History: none
### E9: Does the Worker reuse the client's Tron address validator?
Finding: #6 [P2, confidence 8/10] docs/designs/send-window-plan.md T3 (`Files: src/send/tron-address.ts, tests/tron-address.test.ts`) and diagram 1 (`1 re-validate base58check` in the Worker, T9); docs.aegis-kyt.com/api-reference/v2-screen ("You are charged whether or not the address has data"); reviewer: /plan-eng-review (shared-code rubric)
Plan baseline: T3 (approved with the CEO plan): a client Tron address validator (WebCrypto double SHA-256, Base58, 0x41). T9: the Worker re-validates the address before calling Aegis (approved R1 threat mitigation). Nothing approved about whether these are one module or two.
Runtime evidence: Proposed callers only (no code exists yet): the client send screen/risk client and the Worker. Both run JS with WebCrypto (`crypto.subtle` exists in Workers). Rubric constraint: do not bridge isolated deployments without a practical shared contract; here the contract is one pure function `isValidTronAddress(s: string): Promise<boolean>`. Cloudflare Git build (A2/E8) clones the whole repo and runs from root directory `worker`, so `../src/send/tron-address.ts` is reachable (unverified until T13). Estimated duplicate size 40-60 lines [estimated].
Comparison grid:
```text
Commitment                                       | Source/approval | Current                  | A Worker imports src/send/tron-address.ts | B Separate copy in worker/src/ | C Worker only checks length and charset
Validator implementations                         | T3, T9          | 2 planned (unspecified)  | 1                                         | 2                                | 1 weak check in the Worker
Bad address can reach (and be billed by) Aegis    | Aegis docs      | not decided              | no                                        | no                               | yes (malformed Base58 passes)
Estimated lines                                    | rubric          | 0                        | removed ~45, added ~3 imports/config      | +45                              | +10
Test files                                        | T3, T9          | 1 client + 1 Worker      | 1 table-driven file shared by both        | 2 near-identical tables          | Worker test only checks lengths
Cross-directory import / build coupling           | A2, E8          | n/a                      | worker/ imports ../src (checked in T13)   | none                              | none
Blast radius of a validator bug                   | rubric          | n/a                      | client and Worker both wrong at once (one fix) | independent copies drift     | Worker accepts bad input
Shared and fixed in every option                  | R1, T3, T9, A1, E6-E8 | approved            | Worker still re-validates before any Aegis call | same                    | same
```
Question D5:
D5 — E9: Использует ли Worker тот же валидатор Tron-адреса, что и клиент?
Project/branch/task: canvas-wallet, ветка main, повторное инженерное ревью плана Send (находка 6, P2, общий код).
ELI10: Адрес нужно проверять дважды: в браузере, чтобы сразу подсказать ошибку, и в Worker, чтобы не платить Aegis за заведомо неверный адрес (Aegis берёт 0.1 кредита и за пустые результаты). Это одна и та же функция на 40–60 строк. Можно написать её один раз и подключить в обоих местах, а можно держать две копии.
Stakes if we pick wrong: две копии со временем разойдутся, и Worker начнёт пропускать (и оплачивать) адреса, которые клиент уже отверг, или наоборот.
Recommendation: A, один модуль для обоих, потому что это одна чистая функция без привязки к странице, а два места, где проверка может разойтись, опаснее одного общего импорта.
Completeness: A=9/10, B=7/10, C=3/10
Net: вы выбираете между одним общим модулем с проверкой сборки Worker (A) и двумя независимыми копиями (B).
Header: Общий валидатор
Options:
A) Один модуль для клиента и Worker (recommended)
Effort S (human ~1h / CC ~10 min), risk low. Reuse: src/send/tron-address.ts из T3, tests/tron-address.test.ts как единственная таблица тестов. Verification: тест таблицы валидатора (реальный адрес USDT, перевёрнутая контрольная сумма, длины 33 и 35, символы O0Il, пробелы) и сборка Worker, которая импортирует файл (проверяется в T13).
✅ Один набор тестов и одна правка защищают клиент и Worker сразу, расхождения невозможны.
✅ Убирает около 45 строк [estimated] и второй тестовый набор.
❌ Worker зависит от каталога src, поэтому сборка Cloudflare должна видеть корень репозитория (то, что мы и так проверяем в E8/T13).
B) Отдельная копия в worker/src
Effort S (human ~1h / CC ~10 min), risk medium. Reuse: нет, копирование. Verification: две одинаковые таблицы тестов.
✅ Worker и клиент собираются полностью независимо.
✅ Нет межкаталожных импортов.
❌ Две копии на 40–60 строк со временем разойдутся, и обе нужно тестировать и править.
C) В Worker только длина и символы
Effort S (human ~30 min / CC ~5 min), risk high. Reuse: нет. Verification: тест длины и алфавита.
✅ Меньше всего кода в Worker.
✅ Не нужна WebCrypto в Worker.
❌ Адрес с неверной контрольной суммой доходит до Aegis, и вызов оплачивается.

State: approved
Actual answer: D5 answer 2026-10-13: "Один модуль для клиента и Worker (recommended)"
Accepted scope: src/send/tron-address.ts exports one pure async validator (WebCrypto, no DOM) used by the client and imported by worker/src/index.ts (`../../src/send/tron-address.ts`); tests/tron-address.test.ts is the single table-driven suite (real USDT address, flipped checksum, lengths 33/35, O0Il, whitespace, no crypto.subtle). The Worker still validates before any Aegis call. The Worker build reaching ../src is verified in T13 together with E8; if it fails this row reopens. Nothing else approved.
History: none
### E10: Which existing behavior gets regression tests when `send` is added?
Finding: #10 [P1, confidence 9/10] src/widgets/action-executor.ts:27-31 (`export interface ActionResult { type: Action["type"]; targetUrl: string; requiresInterstitial: boolean; }`) and src/ui/phone-frame.ts:285-287 (`const result = resolveAction(actionKey, token, undefined); if (result) { window.alert(demoAlertMessage(result, token)); }`); e2e/happy-path.spec.ts:6-49 (no action click, no back navigation); no tests/phone-frame test exists; reviewer: /plan-eng-review (IRON RULE: regression coverage)
Plan baseline: T2 (approved with the CEO plan, amended by eng review): ActionResult becomes a discriminated union and the phone click handler branches; its Verify line says non-send actions still return targetUrl, but no answer approved a regression test contract or its depth.
Runtime evidence: Read 2026-10-13: tests/action-executor.test.ts covers resolveAction for external_url, deeplink, wallet_connect, an unknown key and demoAlertMessage (lines 19-62), so the pure functions are already pinned. NOT covered today: (1) clicking a widget in the phone shows the alert (phone-frame.ts:283-288), (2) list -> detail -> back navigation and the new third screen mode (phone-frame.ts:41-64), (3) widget-renderer only checks that onAction fires with the key (tests/widget-renderer.test.ts:46-50). e2e/happy-path.spec.ts selects a token and edits JSON but never clicks an action.
Comparison grid:
```text
Commitment                                              | Source/approval        | Current                    | A Pin all three paths                       | B Pure-function tests only        | C No regression tests
existing 3 action types return the same fields           | T2 verify              | covered (action-executor.test.ts) | keep + add send and exact-shape rows | keep + add send rows              | keep
clicking an existing action shows the same demo alert    | phone-frame.ts:283-288 | NOT covered                | Playwright: click a widget, assert dialog text equals demoAlertMessage | not covered                       | not covered
list -> detail -> back works with the third screen mode  | phone-frame.ts:41-64   | NOT covered                | Playwright: open token, Back returns to the list, Send (when added) Back returns to detail | not covered                       | not covered
Schema 1.0.0 lists still validate and render             | R9 (D11 approved)      | covered (schema-version-gate tests, validate:fixtures) | keep                            | keep                              | keep
Files touched                                           | file-count rule        | 0                          | tests/action-executor.test.ts, e2e/happy-path.spec.ts | tests/action-executor.test.ts    | 0
Intentional change                                      | T2                     | n/a                        | `send` returns a no-URL result and opens the Send screen instead of an alert | same                              | same
Shared and fixed in every option                        | R3, D5, DR12           | approved                   | same                                        | same                              | same
```
Question D6:
D6 — E10: Какое существующее поведение закрепляем регрессионными тестами при добавлении действия send?
Project/branch/task: canvas-wallet, ветка main, повторное инженерное ревью плана Send (находка 10, P1, правило регрессий).
ELI10: Чтобы действие send появилось, меняется общая функция действий и обработчик клика в телефоне. Сегодня тесты закрывают только саму функцию действий. Клик по обычной кнопке в телефоне (показ демо-алерта) и навигация список → карточка → назад не проверяются нигде, а мы добавляем третий экран именно в эту навигацию.
Stakes if we pick wrong: после добавления Send существующие кнопки перестанут показывать алерт или «назад» вернёт не на тот экран, и ни один тест этого не заметит.
Recommendation: A, закрепить все три пути, потому что два из них не покрыты ничем, а тест в Playwright добавляется в уже существующий файл за небольшие деньги.
Completeness: A=9/10, B=5/10, C=2/10
Net: вы выбираете между защитой уже работающего поведения (A) и защитой только чистых функций (B).
Header: Регрессии
Options:
A) Закрепить все три пути (recommended)
Effort S (human ~2h / CC ~20 min), risk low. Reuse: tests/action-executor.test.ts и e2e/happy-path.spec.ts (новый тест в существующем файле). Verification: тесты проходят на коде до правки T2 (характеризация) и после неё; намеренная разница только для send.
✅ Закрывает два непокрытых пути: клик по обычной кнопке (текст алерта) и навигация список → карточка → назад.
✅ Тесты пишутся до изменения phone-frame.ts, поэтому ловят регрессию, а не подгоняются под новый код.
❌ Один новый e2e-тест зависит от токена со списком действий в встроенном реестре и работает в браузере, а не за доли секунды.
B) Только чистые функции
Effort S (human ~30 min / CC ~5 min), risk medium. Reuse: tests/action-executor.test.ts. Verification: строки для send и точной формы результата.
✅ Быстро и без браузера.
✅ Не зависит от данных реестра.
❌ Клик в телефоне и навигация остаются без тестов, а именно туда вносится правка.
C) Без регрессионных тестов
Effort S (human ~0 / CC ~0), risk high. Reuse: нет. Verification: нет.
✅ Ничего не пишем.
✅ Нет новых зависимостей тестов от данных.
❌ Нарушает правило регрессий: изменяемое поведение остаётся без защиты.

State: approved
Actual answer: D6 answer 2026-10-13: "Закрепить все три пути (recommended)"
Accepted scope: Before the T2 change to phone-frame.ts/action-executor.ts, add characterization tests that pass on the current code and must still pass after: (1) tests/action-executor.test.ts: exact result shape rows for external_url, deeplink, wallet_connect; (2) e2e/happy-path.spec.ts: open a token that has an action widget in the bundled registry, click it, assert the dialog message equals the demo alert text (Action/Target lines, interstitial for external_url); (3) e2e/happy-path.spec.ts: list -> token detail -> Back returns to the list, and (after T2) Send -> Back returns to the token detail. Intentional change: the send action opens the Send screen and shows no alert. Existing schema 1.0.0 tests stay. Nothing else approved.
History: none

### A1: Plan amendment by user directive (2026-10-13): use Aegis `POST /v2/screen`
Source: the user pointed to https://docs.aegis-kyt.com/api-reference/v2-screen after the eng review closed. Read 2026-10-13. This is the user's own instruction, so it needs no further approval.
Facts from the page: synchronous (about 60 ms in the docs example), `Authorization: Bearer aeg_<key>`, optional `Idempotency-Key` (<=64 chars; replay with the same body within 24 h returns the cached response with no charge; same key with a different body returns 409), body `{address, network}` with network `ETH`, `BSC` or `TRON`, cost 0.1 credit per call (1 credit = 1 USDT), response `verdict.risk_level` (none, low, medium, high, critical, sanctioned), `verdict.risk_score`, `verdict.label` (may be null), `coverage.data_available`. `none` means no signal found, not clean. Rate limits are not documented (ask Aegis). Runs tiers 0-2 only (no graph analysis); full verdict is `/v2/check-address`.
Effect on earlier decisions: E2 is SUPERSEDED (no polling, no handles, no second endpoint; the Worker makes one call). F2 and Section 7 (async 202 + poll) are obsolete for this feature. R10 keeps its 15 s ceiling but a normal check returns in well under a second. T13(a) is answered. Cost per live check drops from the estimated ~2 credits to 0.1 credit. R1 (hybrid seed), R4 (lean controls), E3 (Durable Object counter), E4 (three PRs) and the exact response contract `{level, label?}` are unchanged. The seed stays as the demo guarantee, but live checks are now cheap enough that the seed is only a fallback.
Key location (unchanged by A1): Cloudflare Worker secret `AEGIS_API_KEY`, set with `wrangler secret put`, never in the repo, `.env`, `VITE_*` variables or the browser bundle; local Worker development reads `worker/.dev.vars` (T11 adds it to .gitignore); use a dedicated key with a monthly cap; rotate by `wrangler secret put` plus revoking the old key in the Aegis dashboard.

### A2: Plan amendment by user directive (2026-10-13): Worker deploys from Git through Cloudflare
Source: the user connected the repo to Cloudflare Workers Builds and created a build token (CLOUDFLARE_API_KEY in the local gitignored .env). Probe 2026-10-13: Worker `canvas-wallet` is live at https://canvas-wallet.maslovsa.workers.dev/health ({"ok":true}); its account has Workers `canvas-wallet`, `p2p-dashboard-cache`, `usdtrub`, subdomain `maslovsa`, and 0 KV namespaces and 0 Durable Object namespaces.
Effect: replaces the CEO decision D3 / S6 (manual `wrangler deploy`, deploy deferred) with Cloudflare Git deploys on every push to main. wrangler.toml name is `canvas-wallet` (commit b242ea9). Consequences recorded as E5 (kill switch is a Worker secret), E8 (tests run in the Cloudflare build) and the T13 items below. Secrets (AEGIS_API_KEY, RISK_ENABLED) are set in the Cloudflare dashboard or with `wrangler secret put`, never in the repo. The model does not enter keys into Cloudflare; the user does.

## Design review (/plan-design-review, 2026-10-13)

Target: this plan, task T8 (Send screen and caution popup). Classifier: OPERATE (app UI). No DESIGN.md exists. Visual mockups from the gstack designer were not generated (no OpenAI API key); the reference visuals are the inline HTML mockups shown in the session on 2026-10-13 (four states, full address on one line). Outside voice: Codex not installed; a second Claude agent reviewed the plan (native, not outside coverage). Initial design completeness: 4/10.

### Design decisions

**DR1 (Pass 1, approved) Screen hierarchy.** One column, top to bottom: (1) nav bar (back, title "Send <symbol>", network "Tron"); (2) To field with a "Paste" action in the label row, the FULL Tron address on one line in monospace (no wrapping, no truncation; font size fitted to the field), directly under it the status line (risk state, owner label) and the small caption "Address is checked by Aegis"; (3) Amount field with "Max" and the balance in the label row; (4) a quiet, tertiary fee line "Network fee (estimate)"; (5) the Send button pinned at the bottom. The status line reserves one line of height so it never shifts the layout when the text changes.

**DR2 (Pass 2, approved) Popup trigger.** The verdict shows immediately in the status line under the address (CAUTION: amber text and icon, e.g. "Caution: we don't recommend sending here"; no score, level or reason). The popup opens only when Send is pressed on a CAUTION result. Pasting or typing never opens a popup, and a seed hit does not either. This replaces R10's phrase "an arriving caution result opens the popup"; R5 and the state diagrams already match it.

**DR3 (Pass 2, approved) Low-risk wording.** The status line for CLEAR with no owner label reads "No risk signals found" in the neutral phone-dim color; never "Safe", never a green check on its own. When `verdict.label` is present the line shows that label text with a green check. `none` from Aegis means "no signal", not "clean" (docs.aegis-kyt.com/api-reference/v2-screen).

**DR4 (Pass 2, approved) Check again.** UNAVAILABLE status line: neutral grey "Couldn't verify this address. Check again" with a text button. Check again re-runs the check for the same address (same Idempotency-Key, so a replay within 24 h is not billed). Send stays enabled (R5).

**DR5 (Pass 2, approved) Amount and fee states.**

```
FIELD / STATE            | WHAT THE USER SEES                                   | SEND
Amount empty             | placeholder "0.00"; hint under field: "Enter an amount" | disabled
Amount 0                 | "Amount must be more than 0"                          | disabled
Amount > balance         | "Not enough <SYMBOL>"                                 | disabled
TRC20, TRX < fee         | "Not enough TRX for the network fee"                  | disabled
Valid                    | no message                                            | enabled (subject to risk state)
Max (TRC20)              | fills the full token balance                          | -
Max (TRX)                | fills balance minus the fee                           | -
Fee loading              | "Network fee (estimate)  ..." (skeleton dots)         | unchanged
Fee live estimate        | "Network fee (estimate)  ~6.4 TRX"                    | -
Fee fallback             | "Network fee (typical)  ~6.5 TRX" in phone-dim        | -
Fee, new recipient       | "~13 TRX" with the note "new account"                 | -
```

Fee numbers: USDT transfer costs about 65,000 energy to an existing holder and about 130,000 to a new recipient at 100 SUN per energy (measured on TronGrid 2026-10-13), i.e. about 6.5 TRX and about 13 TRX. (The session mockups showed ~13.2 TRX for a normal transfer; that example number was wrong by 2x and the T5 estimator output is authoritative.) The disabled Send always has a reason line, never a bare grey button.

**DR6 (Pass 2, approved) Sending and Sent.** Pressing Send shows the Sending state for about 0.6 s: button busy, double press ignored (existing `submitting` guard). Then one short "Sent (simulated)" view in the same screen: check mark, "25.50 USDT sent", the full address on one line, the fee line, a pill "Simulated — no transaction was sent", and a Done button that returns to the token detail. This is a confirmation, not a receipt screen, so S4 (receipt screens) stays declined.

**DR7 (Pass 2, approved) Checking indicator.** The checking indicator appears only after 250 ms: a small spinner and "Checking address…" in the status line. The Send label never changes (it is "Send", grey until the verdict). When the 15 s ceiling is reached the status line visibly becomes "Couldn't verify this address. Check again" (DR4) and Send is enabled; the button is never enabled silently.

**DR8 (Pass 3, approved) After Cancel and after Send anyway.** Cancel closes the popup and keeps the address and the amount; the amber status line stays; focus returns to the To field. Send anyway goes straight to Sending (no second confirmation; R5 stays "warn and allow").

**DR9 (Pass 5, approved) Send screen tokens (phone-scoped, no DESIGN.md).** The app-level `--warning #d9a441`, `--danger #e5484d` and `--accent #3375bb` fail 4.5:1 as text on the phone screen (measured 2.15:1, 3.75:1 on light `#fafafa`; 3.72:1 for accent on dark `#17181c`), so the Send screen defines its own tokens, set on `.phone-screen` and `.phone-frame.theme-dark .phone-screen`:

```
TOKEN             | LIGHT (#fafafa)   | DARK (#17181c)   | USED FOR
--send-caution    | #8a5a00  (5.68:1) | #e0b04a (8.85:1) | caution status text and icon, popup icon
--send-error      | #c4262b  (5.50:1) | #ff6b6f (6.41:1) | amount error lines
--send-success    | #1a7f37  (4.87:1) | #3fb950 (6.98:1) | owner label with check
--send-accent     | #3375bb  (4.57:1) | #6aa5e8 (6.89:1) | Paste, Max, Check again
--phone-dim       | rgba(0,0,0,.55) (4.54:1) | #9aa3ad (6.94:1) | labels, fee line, "No risk signals found" (existing token)
--send-field-bg   | #ffffff           | #1f2126          | fields
--send-field-line | rgba(0,0,0,.12)   | rgba(255,255,255,.14) | field border
--send-primary    | bg #111 / text #fff | bg #eee / text #111 | Send button
```

Sizes: nav bar 44 (existing `.card-header` nav); field height 52, radius 12; label 12 px; amount text 22 px; address 14 px monospace, `white-space: nowrap`, no truncation (a 34-character address is about 290 px; the field has about 388 px of inner width on the 444 px screen); status line 13 px with `min-height: 20px`; fee line 13 px in `--phone-dim`; Send button 50 high, radius 14. Font stays the phone's system stack (native iOS look; a deliberate OPERATE-mode choice). Motion: spinner starts after 250 ms; popup fades in 150 ms ease-out; Sending lasts about 0.6 s; all motion off under `prefers-reduced-motion`. Contrast ratios above were computed on 2026-10-13 (WCAG relative luminance).

**DR10 (Pass 6, approved) Popup lives inside the phone.** One component, rendered as a child of `.phone-frame` (not `document.body`), with the scrim clipped to the screen's rounded corners and the focus trap and `inert` set only inside the phone. Two skins, same content and button order (Cancel first, then Send anyway): iOS = centered alert about 300 px wide, radius 14, buttons stacked; Android = dialog radius 28, text left-aligned, buttons right-aligned. Editor and sidebar stay interactive.

**DR11 (Pass 6, approved) Accessibility acceptance criteria for T8.**
- Touch targets at least 44x44 (iOS skin) and 48x48 (Android skin).
- Tab order: Back, To, Paste, Amount, Max, Check again (when shown), Send.
- Popup: `role="alertdialog"`, `aria-modal`, initial focus on Cancel, Tab cycles inside, Esc = Cancel, background `inert`.
- Status line is `aria-live="polite"`, announced once per verdict (not on every keystroke); amount errors are linked with `aria-describedby`.
- To field: `autocapitalize="off"`, `autocorrect="off"`, `spellcheck="false"`, `autocomplete="off"`; Amount: `inputmode="decimal"`. Visible labels (never placeholder-only).
- Color is never the only signal: every status has an icon and text.
- Contrast at least 4.5:1 for all text in both themes (DR9 values); spinner and fades respect `prefers-reduced-motion`.

**DR12 (Pass 7, approved) Refusal notice.** When Send is unavailable (a non-Tron token, or no `crypto.subtle`), show a small notice inside the phone using the same overlay component as the popup, with one OK button and the texts "Send is available for Tron tokens only" and "Can't verify addresses in this browser. Send is unavailable." The browser `alert()` at `phone-frame.ts:285-287` is not used for Send.

**DR13 (Pass 7, approved) Seed hit looks the same as a live check.** Same status line, same popup; the only difference is speed. Seed entries older than 90 days count as a miss (R-seed expiry) and go to the live check.

**DR14 (Pass 7, approved) Back.** Back always works without a confirmation, except during the Sending state (about 0.6 s) where it is inactive. Leaving the screen resets the form and aborts any unfinished check (T7).

### Information hierarchy and wireframe (iOS skin, light theme)

```
+----------------------------------------------+
| < Back            Send USDT                  |  nav bar 44
|                   Tron                       |
|                                              |
| To                                    Paste  |  label row 12
| +------------------------------------------+ |
| | TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t       | |  field 52, address 14 mono, one line
| +------------------------------------------+ |
| [check] <owner label>  /  No risk signals found  |  status line 13, min-height 20
| Address is checked by Aegis                  |  caption 11
|                                              |
| Amount                    Balance 120.00 USDT|
| +------------------------------------------+ |
| | 25.50  USDT                         Max  | |  field 52, amount 22
| +------------------------------------------+ |
| <amount error line, if any>                  |
|                                              |
| Network fee (estimate)           ~6.4 TRX    |  tertiary, phone-dim
|                                              |
| [               Send                       ] |  button 50, pinned bottom
+----------------------------------------------+
Popup (on Send, CAUTION only): scrim inside the phone; alert: [warning icon] "We don't recommend sending to this address" / "Based on Aegis data at the time of the check. Details aren't shown." / [Cancel] [Send anyway]
Sent view: [check] "25.50 USDT sent" / address (one line) / fee / pill "Simulated - no transaction was sent" / [Done]
```

### Journey storyboard

```
STEP | USER DOES                     | USER FEELS        | PLAN SPECIFIES
1    | Opens Send on a Tron token    | purposeful        | DR1 layout, focus on To
2    | Pastes an address             | careful           | status in about a second (DR3, DR7)
3    | Sees an owner label           | reassured         | label + check (DR3)
4    | Types an amount, taps Max     | focused           | state table (DR5)
5    | Glances at the fee            | "fine"            | quiet fee line (DR5)
6    | Taps Send (clean)             | trust             | Sending, then Sent (simulated) (DR6)
7    | Sees an amber caution line    | alarmed           | inline status first (DR2)
8    | Taps Send, popup opens        | pause             | wording per D12, Cancel default (DR2, DR10)
9a   | Cancel                        | relief            | data kept, focus on To (DR8)
9b   | Send anyway                   | owns the risk     | goes to Sending (DR8)
10   | "Couldn't verify"             | uncertain         | Check again, Send allowed (DR4)
```
Time horizons: 5 s = the status line reacts to the paste; 5 min = a complete path with no dead ends; long term = the wallet never overclaims safety (DR3).

### Interaction state coverage (summary; details in DR2 to DR7)

```
FEATURE        | LOADING            | EMPTY              | ERROR                         | SUCCESS            | PARTIAL
Address status | spinner after 250ms| nothing            | invalid address (inline)      | label / no signals | seed expiry -> live
Amount         | -                  | "Enter an amount"  | zero, over balance, TRX fee   | no message         | Max
Fee            | skeleton dots      | -                  | fallback "typical"            | live estimate      | new account ~13 TRX
Send           | grey until verdict | disabled + reason  | refusal notice (DR12)         | Sending -> Sent    | unavailable: allowed
```

### NOT in scope (design)
- Full receipt or review screens (S4, stays declined; Sent is a confirmation only).
- A separate DESIGN.md (TODO P3 added).
- Behavior of the simulator frame on very narrow browser windows (fixed 480 px phone; existing limitation).
- Fee tiers, address book, contacts.

### What already exists (reused)
Phone chassis and themes (`.phone-frame`, `.theme-dark`), nav bar and `.card-back-btn`, `--phone-dim`, capsule buttons (`.action-group-btn`), the overlay idea of the phone notch layer. No DESIGN.md.

### Design review scores

```
PASS            | BEFORE | AFTER
1 Info arch     | 4      | 9
2 States        | 4      | 9
3 Journey       | 5      | 9
4 AI slop       | 6      | 8
5 Design system | 3      | 9
6 Responsive/a11y | 3    | 9
7 Decisions     | 5 open | 0 open (14 decisions)
OVERALL (lowest rated pass) | 3 | 8
```
Visual mockups: not generated by the gstack designer (no OpenAI key); the session's inline HTML mockups are sketches, not approved mockups. Decision DR (TODO 2): not recorded as a TODO; verify the built screen with `/design-review`.

### Engineering re-review (/plan-eng-review, 2026-10-13, after A1, A2 and DR1-DR14)

Target (fixed): this plan. Ledger IDs continue from E4: E5 to E10 below. Question numbering restarts at D1 for this invocation (D1 to D6). Mode: scope accepted as-is; structure unchanged from D2 ("Smaller arrangement", about 34 files [estimated]; A1 removed the handle table and second route, the design review added no new files). No feature cuts were proposed.

**Scope Challenge findings (re-review).** 1 [P1,9] stale polling text in F2, diagram 1, error flow, deployment diagram, T9, T11 (fixed in place, consequence of A1/A2); 2 [P1,9] RISK_ENABLED in wrangler.toml is overwritten by Git deploys (E5); 3 [P1,8] `medium` has no client state (E6); 4 [P1,8] owner label can leak the reason on a caution result (E7); 5 [P1,7] Cloudflare deploys the Worker without waiting for tests (E8); 6 [P2,8] validator duplicated between client and Worker (E9); 7 [P2,9] A2 supersedes the CEO decision D3 (manual deploy); 8 [P3,8] Durable Objects: account API answered but lists 0 namespaces, so enablement stays a T13 check; 9 [P3,8] CORS origin for local development (T9 detail); 10 [P1,9] existing click and navigation behavior has no tests (E10).

**Section 1, Architecture (5 findings).** (a) [P2,8] no timeout on the Worker to Aegis call: Aegis fetch gets `AbortSignal.timeout(8000)`, inside the client's 15 s ceiling (R10); (b) [P2,9] `worker/wrangler.toml:7 workers_dev = true` makes `/check` publicly callable, accepted under D8 (lean controls, provider cap); (c) [P3,8] `worker/wrangler.toml:13 ALLOWED_ORIGIN` blocks localhost development: origin list from a variable, localhost only in `.dev.vars`; (d) [P2,8] Idempotency-Key is hex SHA-256 of network+address+UTC day (64 characters, within the 64 limit), a retry after midnight UTC is billed again; (e) [P1,9] stale text, fixed. Dispositions: a accepted (R10), b accepted (D8), c accepted (T9), d accepted (T9), e fixed.

**Section 2, Code quality (3 findings).** (a) [P2,8] shared validator: E9 approved (one module, imported by the Worker); (b) [P3,8] `src/send/net.ts` retracted, native `AbortSignal.timeout` inline; (c) [P3,9] `src/icon/icon-loader.ts:7` and `src/widgets/price-chart.ts:19` duplicate a promise-by-key cache, extraction rejected (different value types and lifetimes, no net saving, outside this plan's callers). ASCII diagrams in the plan updated (diagram 1, error flow, deployment).

**Section 3, Test review.** Read: src/widgets/action-executor.ts with tests/action-executor.test.ts, phone-frame.ts:262-300, e2e/happy-path.spec.ts. Framework: vitest (happy-dom) and Playwright, `npm test`.

```
CODE PATHS                                                         USER FLOWS
[+] src/widgets/action-executor.ts                                [+] Open a token, click an action
  |-- [TESTED] 3 action types, encoding, unknown key (:19-47)       |-- [GAP] [->E2E] click existing action -> alert (E10)
  |-- [PLAN] send result, union shape                               '-- [GAP] [->E2E] list -> detail -> Back (E10)
  '-- [TESTED] demoAlertMessage (:49-61)                           [+] Send screen
[+] src/ui/phone-frame.ts                                           |-- [PLAN] [->E2E] valid -> status -> Send -> Sent (simulated)
  |-- [GAP] click handler branch (:283-288)  (E10)                  |-- [PLAN] [->E2E] caution: popup only on Send, Cancel keeps data
  '-- [GAP] screenMode list/detail/send (:41-64)  (E10)             |-- [PLAN] double-click submits once; Back inactive in Sending
[+] src/send/* (tron-address, amount, tron-fee, risk-client, session)|-- [PLAN] edit resets status; stale reply dropped, both orders
  '-- [PLAN] table-driven unit tests T3-T7, mocked fetch            |-- [PLAN] unavailable -> Check again; Send allowed after 15 s
[+] worker/src/index.ts                                             '-- [PLAN] amount and fee states (DR5), refusal notice (DR12)
  |-- [PLAN] exact {level,label?}; caution/unknown carry no label (E7)
  |-- [PLAN] level mapping (E6); RISK_ENABLED secret (E5); KV down closed
  |-- [PLAN] Counter under concurrency (E3); OPTIONS and exact-origin CORS
  '-- [PLAN] Idempotency-Key; Aegis 4xx/5xx/timeout -> unknown
[+] CI and deploy: [PLAN] failing test fails the PR, the main push (E1) and the Cloudflare build (E8)
GAPS: 3 existing-behavior gaps (regression risk, 2 E2E), all closed by E10. Planned rows are required proof of approved behavior.
```

Test value cards (new E2E): Value: protects=clicking an existing action widget in the phone still shows the same demo alert; fails_when=the T2 change to phone-frame.ts or action-executor.ts drops or alters the alert branch; why_new=no test opens a token or clicks a widget; seam=none; no_claim=iOS/Android rendering. Value: protects=list to detail to Back navigation works with a third screen mode; fails_when=screenMode handling in phone-frame.ts is changed incorrectly; why_new=no test covers navigation; seam=none; no_claim=visual layout.
Tests made obsolete by this plan: none.

**Section 4, Performance (4 findings, scale marked unknown where not measured).** (a) fee estimate depends on the recipient, not the amount: cache by (contract, recipient) per session, chain parameters once per session; TronGrid keyless rate limit unknown; (b) Durable Object free plan allows 100,000 row writes per day: read the budget first and write only on a real Aegis call; (c) timeouts: TronGrid 5 s, seed 5 s, Worker to Aegis 8 s, client ceiling 15 s; (d) seed file size unknown: cap entries (for example 200) in `validate-fixtures`. All accepted as T5/T6/T9 details.

**Outside voice.** Codex not installed; the native fallback needs TaskOutput, which this session does not provide: unavailable, no clean-review credit (logged as `codex-plan-review: unavailable`).

**NOT in scope (unchanged and added).** EVM/Ethereum (TODO); real signing and broadcast; receipt screens (S4); Cloudflare Queue, background polling and handle table (removed by A1); GitHub Actions deploy of the Worker (declined in E8); a DESIGN.md (TODO); `/v2/check-address` graph verdict.

**What already exists (reused).** `AbortSignal.timeout` and `fetch` (platform), `StaleFetchGuard`, `price-chart.ts` keyless-fetch-with-fallback pattern, `phone-frame.ts` chassis and themes, `action-executor.ts` handler table (extended by one handler), the CI test run in `validate-registry.yml` (widened by E1), Cloudflare Workers Builds (A2). Shared code accepted: `src/send/tron-address.ts` for client and Worker (E9, removes about 45 duplicate lines [estimated]).

**Failure modes (new paths).** Worker to Aegis timeout: tested, user sees "Couldn't verify" (not silent). Aegis 402/429: mapped to unknown, user sees "Couldn't verify"; operator sees it only in logs (alert delivery is a P3 TODO). KV or Durable Object write failure: Worker fails closed, tested, seed-only site. Wrong RISK_ENABLED value: seed-only, tested (E5). Cloudflare build fails: previous Worker stays live (E8). Caution result with a label: never leaves the Worker (E7). Critical gaps: 0.

**Worktree parallelization.**

| Step | Modules touched | Depends on |
|------|----------------|------------|
| Schema, gate, fixtures, opt-in data (T1) | registry.schema.json, src/registry-client, public/lists, fixtures | none |
| Pure send logic (T3, T4, T5) | src/send | none |
| Risk client, seed, session (T6, T7) | src/send, public | T3 |
| Worker (T9, T13) | worker, tests | T3 |
| UI and wiring (T2, T8, T12) | src/ui, src/widgets, src/style.css, e2e | T1, T6, T7 |
| CI and guards (T10, T14, T11) | .github, scripts, CONTRIBUTING.md | none |

Lanes: A: T1 then T2 (T2 first adds the E10 tests); B: T3 then T4 and T5 then T6 then T7 then T8; C: T9 and T13 (after T3, parallel with B); D: T10, T14, T11 (independent). Launch A, B, D together; start C once T3 merges. Conflict flags: `src/ui/phone-frame.ts` (T2 then T8) and `.github/workflows/deploy.yml` (T10, T11, T14 in one lane) must be sequenced.

**Suppressed findings (confidence below 5).** TronGrid keyless rate limit could throttle fee estimation during a live demo (confidence 4/10, no evidence either way).

**Approval readiness: PASS.** Checked: E1 (eng D3), E3 (eng D5), E4 (eng D6), the eng Scope Challenge D2 answer; E2 is superseded by the user's A1; E5 (D1), E6 (D2), E7 (D3), E8 (D4), E9 (D5), E10 (D6) each cite their own answers above; A1 and A2 are the user's own directives; DR1 to DR14 are answered in the design review. Implementation details attached to approved rows carry their own citations.

**Completion summary (re-review).** Scope Challenge: scope accepted as-is. Reality rows: 7/7 emitted, 2 unverified (wrangler secret syntax; Durable Objects enablement). Architecture: 5 issues. Code quality: 3. Test review: diagram produced, 3 gaps. Performance: 4. NOT in scope and What already exists: written. TODOS.md: 0 new proposals, 1 obsolete entry removed (A2). Failure modes: 0 critical gaps. Unresolved decisions: 0. Outside voice: unavailable (Codex not installed, native fallback not possible). Parallelization: 4 lanes, 3 parallel. Lake Score: 0/6 (no option was scored 10/10).

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | CLEAR | mode: SCOPE_REDUCTION; 13 questions (D1-D13), 0 unresolved |
| Outside Review | codex plan-review (default-on) | Independent 2nd opinion | 4 attempts | unavailable | Codex CLI not installed; native fallback needs TaskOutput (not available). No outside coverage, no clean-review credit |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 2 (this run: re-review) | CLEAR | 10 issues, 0 critical gaps; E5-E10 approved (kill switch secret, medium=caution, label only for clear, tests in the Cloudflare build, shared validator, regression tests); E2 superseded by A1 |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | CLEAR | score: 3/10 -> 8/10, 14 decisions |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | - | not run |

**OUTSIDE COVERAGE:** codex, phases plan-review (CEO, eng, eng re-review) and design: unavailable (CLI not installed). The design phase used a native Claude agent (in-host), which is not outside coverage. No gstack designer mockups exist (no OpenAI API key).

**VERDICT:** CEO + ENG + DESIGN CLEARED, ready to implement. Three items are confirmed on first use (T13): Durable Objects on the account, the Cloudflare build settings from E8/E9, and `wrangler secret put`.

NO UNRESOLVED DECISIONS
