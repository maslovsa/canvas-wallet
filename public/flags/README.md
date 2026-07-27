# Vendored flag icons

SVGs in this directory are from [lipis/flag-icons](https://github.com/lipis/flag-icons)
(MIT license), fetched from the `flags/4x3/{cc}.svg` path of the published
npm package via jsDelivr. Same upstream source and same "keep only the
codes we actually need" approach as `apps/ui/public/flags/` in the
maslovsa/aegis-platform repo — that project vendors its own AML-relevant
set (RU/UA/BY/IR/KG); this one vendors the jurisdictions that show up as an
`issuer.country` in `public/lists/*.json` (see `src/country/country-flag.ts`).

| File | Country | Why it's here |
|---|---|---|
| `us.svg` | United States | Circle (USDC/EURC), Paxos (PYUSD/USDP/BUSD), World Liberty Financial (USD1) |
| `hk.svg` | Hong Kong | First Digital Labs (FDUSD) |
| `vg.svg` | British Virgin Islands | Tether Holdings Limited (USDT) |

To add another country: fetch `https://cdn.jsdelivr.net/npm/flag-icons/flags/4x3/{cc}.svg`,
save it here as `{cc}.svg` (lowercase ISO 3166-1 alpha-2), and add the code
to `VENDORED_FLAG_CODES` in `src/country/country-flag.ts`. An
`issuer.country` for a code that isn't vendored still renders correctly —
it falls back to a Unicode flag emoji, then to a globe icon if even that
isn't a valid 2-letter code — see that file for the fallback chain.
