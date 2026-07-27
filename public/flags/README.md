# Vendored flag icons

All 257 SVGs in this directory are the full `flags/4x3/*.svg` set from
[lipis/flag-icons](https://github.com/lipis/flag-icons) v7.5.0 (MIT
license), fetched via jsDelivr
(`https://cdn.jsdelivr.net/npm/flag-icons@7.5.0/flags/4x3/{cc}.svg`).

This started as a 3-file subset (US/HK/VG, the jurisdictions that showed up
as an `issuer.country` at launch) mirroring the "keep only what you need"
approach `apps/ui/public/flags/` uses in the maslovsa/aegis-platform repo
(their own AML-relevant 5-code subset: RU/UA/BY/IR/KG). It's since been
expanded to the full upstream set so any `issuer.country` — present or
future — renders a real flag instead of falling back to emoji. See
`src/country/country-flag.ts` for the resolver and the emoji/globe fallback
chain for anything not in this directory (there shouldn't be much: a
handful of the package's own non-ISO extras like `gb-eng`/`es-ct` were
deliberately excluded, since `registry.schema.json` only ever allows a
2-letter `issuer.country`).

**To refresh from a newer flag-icons release:** re-run the fetch against
the new version tag, regenerate `VENDORED_FLAG_CODES` in
`src/country/country-flag.ts` from the resulting file list, and re-run
`npm run validate:fixtures && npm test`.
