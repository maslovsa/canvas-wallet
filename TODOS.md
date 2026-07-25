# TODOS

Deferred work tracked from `/plan-ceo-review` (2026-07-22). Not blockers for
v1 — see `~/.gstack/projects/сanvas-wallet/ceo-plans/2026-07-22-token-ui-studio.md`
for full context.

## P3: Diff-against-production view

**What:** When editing an existing token config, visually highlight exactly
what changed vs. the currently-published version (side-by-side or inline
diff of the rendered card, not just raw JSON).

**Why:** Real value for registry maintainers reviewing edits to existing
tokens — right now a reviewer has to mentally diff two JSON blobs to
understand what a PR actually changes visually.

**Pros:** Makes PR review meaningfully faster and safer for edits (as
opposed to new-token submissions, which don't need this). Directly
complements the CODEOWNERS review process (Outside Voice T2) by giving the
named reviewer a clearer signal.

**Cons:** Requires rendering both the old and new config through the
simulator and diffing visual output, not just JSON — nontrivial relative to
its scope. Only useful for edits, not the more common "add new token" flow.

**Context:** Surfaced during /plan-ceo-review's Step 0 scope-expansion
ceremony (2026-07-22) as expansion candidate #6, deferred at the time as
lower-priority than the 5 accepted expansions (trust score, multi-registry
client, share link, dual chrome, template gallery). Re-surfaced and
confirmed still deferred during the 11-section deep review's TODOS pass.

**Effort estimate:** M (human team) → CC+gstack: ~45 min.

**Priority:** P3

**Depends on / blocked by:** None — can be built anytime after the base
editor + simulator exist.

## P3: PR preview deploys

**What:** Let a PR reviewer see the actual rendered token card (not just raw
JSON) before approving a token-config PR.

**Why:** Strengthens the CODEOWNERS-required human review step — the actual
backstop for anything schema validation can't catch (misleading badge text,
a card that just "looks wrong"). Right now a reviewer only sees a JSON diff.

**Pros:** Directly complements the CODEOWNERS review process by giving the
named reviewer a much clearer signal than raw JSON.

**Cons:** GitHub Pages supports only ONE deploy source per repo — either
"deploy from a branch" or "deploy via Actions" (this repo uses Actions, set
up 2026-07-25). A per-PR preview mechanism (e.g. the common
`rossjrw/pr-preview-action`, which deploys to a branch) risks conflicting
with the working Actions-based deploy. Needs either a conflict-free
approach or a deliberate architecture change, not a quick add.

**Context:** Surfaced as CEO review Section 9 finding, left unresolved at
review time. Raised again post-deploy (2026-07-25) and explicitly deferred
rather than risk the live deploy mechanism — see the tradeoff above.

**Effort estimate:** M (human team) → CC+gstack: ~1-2h, plus real testing
against a live Pages deploy to confirm no conflict.

**Priority:** P3

**Depends on / blocked by:** A second active contributor actually needing
this (the CODEOWNERS self-approval note in CONTRIBUTING.md already flags
that solo review has bigger gaps than "no visual preview").
