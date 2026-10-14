# Design review of the redesigned Token UI Studio (2026-10-14)

Method: /design-review run against the local build, driven through Chromium (Playwright: gstack's own browser and Aside
were not available on this machine). Pages: gallery, studio (1440, 1920, 768, 375), phone mode (`?view=phone`, iPhone 14),
list, token, Send, Receive, dark and light, iOS and Android. Rendered design system extracted from the DOM; axe-core
(serious and critical) is clean on all of them and now runs as an e2e test.

## Verdict
**Design score B, AI-slop score B-.** It reads as a competent 2025 developer tool wrapped around a clean iOS-style wallet.
It is modern and consistent, but not yet distinctive: it looks like "a good default", not like a product with its own
point of view. The phone is the stronger half; the studio chrome is correct and quiet.

| Category | Grade | Note |
| --- | --- | --- |
| Visual hierarchy | B | Clear focal points (phone in the middle, Send is the loudest control). Right panel competes: the trust-findings column is heavier than the editor it serves. |
| Typography | B+ | Inter (studio) and the platform font (phone), tight titles, tabular numbers, mono for code and addresses. One miss fixed: the Send hint was monospace. |
| Spacing and layout | B | 4-pt rhythm, 16-px gutters, phone always fits. The gallery was 3 + 1 (fixed to 2 x 2). |
| Color and contrast | B | One cool accent, neutral surfaces, WCAG AA on every checked screen. Studio is dark-only. |
| Interaction states | B- | Focus rings, hover lift, disabled states exist. Token rows were mouse-only (fixed). No pressed/loading polish on the phone. |
| Responsive | B+ | Phone mode, safe areas, tablet column. Touch targets were 29-34 px on Back/Lists (fixed to 44). |
| Content and microcopy | B | Plain, specific. Sample chart no longer invents a price. |
| AI slop | B- | A gradient icon tile above the heading and equal card grid were the tells; the tile is flat now. The rest is restrained. |
| Motion | C+ | Almost none: screen changes in the phone cut instantly. This is the biggest gap to "refined". |
| Performance feel | B | Fonts self-hosted, no layout shift. Logos flash a letter before the image arrives. |

## First impression (gallery)
I land on a dark page with a small icon tile, a bold title and four near-identical cards. My eye goes to the title, then
the first card, then the arrow icons. It says "developer tool", competently. Nothing says *what you will see* until you
open a list: the cards show network logos, not the product's own output.

## Fixed in this pass (one commit each)
1. FINDING-001: gallery lists as 2 x 2; brand tile flat instead of a glowing gradient.
2. FINDING-002: balanced large title (no orphaned "+ TRON)"); Back and Lists are 44-px touch targets.
3. FINDING-003: Send address hint in the UI font, not monospace.
4. FINDING-004: token rows (sidebar and phone list) reachable and operable by keyboard.
Earlier in the branch: contrast, field label, landmarks, honest sample chart, tablet column.

## What would make it feel refined (prioritized, not done)
1. **Screen transitions in the phone** (push/pop slide ~280 ms ease-out, dialogs as a sheet; none under reduced motion).
2. **Large-title collapse and a blurred sticky bar** on scroll, like iOS.
3. **Gallery cards that show the product**: a live mini phone of each list instead of generic network logos.
4. **A wallet-home hero** (total balance, quick actions) so the phone looks like a wallet, not only a list.
5. **Android as Material 3**: today it is iOS with a punch-hole; give it tonal buttons, a different top bar and ripple.
6. **Editor**: syntax highlighting and inline error markers; trust findings collapsed by severity.
7. **Loading polish**: fade logos in, skeletons for the chart, so no letter flash.
8. **Light studio theme** following the system setting.
9. **Live prices**: CoinGecko is rate-limited and blocked by CORS from the site, so most charts show the sample.
   Cache prices in the Worker (stays within the free plan) or drop the live call.
10. **Sidebar search** once a network has more than ~20 tokens.

Screenshots: `docs/designs/redesign/review/` (before and after for the gallery and the iPhone list, studio at 1920).

## Status of the prioritized list (2026-10-14)
All ten items are done on branch `design-v2`:
1. Screen transitions: screens slide in (forward/back), dialogs rise, live edits keep the scroll.
2. Large-title collapse and a blurred sticky bar on the wallet home and the token card.
3. Gallery cards show a cropped mini phone of the list.
4. Wallet-home hero: illustrative total balance and Send/Receive shortcuts (asset picker when several tokens qualify).
5. Android is Material 3: tonal surfaces, app bar with an arrow, filter chips, pill buttons, action tiles, ripple.
6. Editor: syntax colors, the exact character where the JSON breaks (line and column), trust findings grouped and collapsible.
7. Loading polish: logos fade in, the price chart has a skeleton.
8. Light studio theme following the system, with a toggle (system / light / dark) that remembers the choice.
9. Live prices through the Worker (`GET /price`), cached 15 min, so charts work without CoinGecko CORS/rate limits.
10. Sidebar filter for networks with more than 12 tokens.

Screenshots: `docs/designs/redesign/v2/`.
