// Country-code -> flag icon resolver for `token.issuer.country`.
//
// Ported from the Aegis Platform's Graph Lab country-flag mechanism
// (apps/ui/src/lib/graph/country-flag-chooser.ts + country-flag-overlay.ts
// + cluster-tooltips.tsx's flagEmoji, in the maslovsa/aegis-platform repo).
// Same two-tier design:
//
//   1. A vendored SVG per country code (public/flags/{cc}.svg) — real, crisp
//      flags. Aegis-platform vendors only its own AML-relevant subset
//      (RU/UA/BY/IR/KG, 5 files); this project vendors the FULL lipis/flag-icons
//      set (257 files, every code the upstream package ships — the real
//      ISO 3166-1 alpha-2 countries plus a handful of the package's own
//      extras like EU/UN/XK) so any issuer.country renders a real flag, not
//      just the handful of jurisdictions we happened to need at launch.
//   2. A universal Unicode regional-indicator emoji fallback for any 2-letter
//      code that ISN'T in the vendored set (there shouldn't be many, but a
//      future ISO code or a typo'd ui author input still renders *something*
//      meaningful instead of a broken image). Same trick as aegis-platform's
//      cluster-tooltips.tsx flagEmoji() — each letter maps to
//      U+1F1E6..U+1F1FF. OS/font-dependent (real flag glyph on macOS/iOS,
//      boxed letter-pair on platforms without emoji-flag support) — which is
//      exactly why the vendored SVG is preferred whenever we have one.
//
// Source of the vendored SVGs: lipis/flag-icons (MIT), fetched from
// https://cdn.jsdelivr.net/npm/flag-icons@7.5.0/flags/4x3/{cc}.svg — see
// public/flags/README.md for attribution and how to refresh the set.

export const VENDORED_FLAG_CODES: ReadonlySet<string> = new Set([
  "AD", "AE", "AF", "AG", "AI", "AL", "AM", "AO", "AQ", "AR",
  "AS", "AT", "AU", "AW", "AX", "AZ", "BA", "BB", "BD", "BE",
  "BF", "BG", "BH", "BI", "BJ", "BL", "BM", "BN", "BO", "BQ",
  "BR", "BS", "BT", "BV", "BW", "BY", "BZ", "CA", "CC", "CD",
  "CF", "CG", "CH", "CI", "CK", "CL", "CM", "CN", "CO", "CP",
  "CR", "CU", "CV", "CW", "CX", "CY", "CZ", "DE", "DG", "DJ",
  "DK", "DM", "DO", "DZ", "EC", "EE", "EG", "EH", "ER", "ES",
  "ET", "EU", "FI", "FJ", "FK", "FM", "FO", "FR", "GA", "GB",
  "GD", "GE", "GF", "GG", "GH", "GI", "GL", "GM", "GN", "GP",
  "GQ", "GR", "GS", "GT", "GU", "GW", "GY", "HK", "HM", "HN",
  "HR", "HT", "HU", "IC", "ID", "IE", "IL", "IM", "IN", "IO",
  "IQ", "IR", "IS", "IT", "JE", "JM", "JO", "JP", "KE", "KG",
  "KH", "KI", "KM", "KN", "KP", "KR", "KW", "KY", "KZ", "LA",
  "LB", "LC", "LI", "LK", "LR", "LS", "LT", "LU", "LV", "LY",
  "MA", "MC", "MD", "ME", "MF", "MG", "MH", "MK", "ML", "MM",
  "MN", "MO", "MP", "MQ", "MR", "MS", "MT", "MU", "MV", "MW",
  "MX", "MY", "MZ", "NA", "NC", "NE", "NF", "NG", "NI", "NL",
  "NO", "NP", "NR", "NU", "NZ", "OM", "PA", "PC", "PE", "PF",
  "PG", "PH", "PK", "PL", "PM", "PN", "PR", "PS", "PT", "PW",
  "PY", "QA", "RE", "RO", "RS", "RU", "RW", "SA", "SB", "SC",
  "SD", "SE", "SG", "SH", "SI", "SJ", "SK", "SL", "SM", "SN",
  "SO", "SR", "SS", "ST", "SV", "SX", "SY", "SZ", "TC", "TD",
  "TF", "TG", "TH", "TJ", "TK", "TL", "TM", "TN", "TO", "TR",
  "TT", "TV", "TW", "TZ", "UA", "UG", "UM", "UN", "US", "UY",
  "UZ", "VA", "VC", "VE", "VG", "VI", "VN", "VU", "WF", "WS",
  "XK", "XX", "YE", "YT", "ZA", "ZM", "ZW",
]);

const GLOBE = "\u{1F310}"; // shown when there's no vendored flag AND the code can't map to an emoji.

/**
 * Path to a vendored flag SVG for this country code, or null if we don't
 * have one. Never guesses — an unvendored code returns null so the caller
 * can fall back to `countryFlagEmoji` (or the globe) instead of a 404 image.
 */
export function countryFlagAssetUrl(country: string | undefined): string | null {
  if (!country) return null;
  const cc = country.toUpperCase();
  if (!VENDORED_FLAG_CODES.has(cc)) return null;
  // Must respect Vite's base path (e.g. "/canvas-wallet/" on GitHub Pages) —
  // a hardcoded root-relative "/flags/..." 404s on any subpath deployment,
  // same reasoning as network-registry.ts's networks.json fetch.
  return `${import.meta.env.BASE_URL}flags/${cc.toLowerCase()}.svg`;
}

/**
 * A 2-letter ISO 3166-1 country code maps directly to its flag emoji via the
 * Unicode regional-indicator-symbol trick (each letter -> U+1F1E6..U+1F1FF).
 * Works for the full ISO set with zero assets. Returns the globe glyph for
 * anything that isn't a plausible 2-letter code — never guesses a country.
 */
export function countryFlagEmoji(country: string | undefined): string {
  if (!country || country.length !== 2) return GLOBE;
  const codePoints = [...country.toUpperCase()].map((c) => 0x1f1e6 + (c.charCodeAt(0) - 65));
  if (codePoints.some((cp) => cp < 0x1f1e6 || cp > 0x1f1ff)) return GLOBE;
  return String.fromCodePoint(...codePoints);
}

export { GLOBE as GLOBE_EMOJI };
