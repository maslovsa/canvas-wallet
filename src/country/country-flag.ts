// Country-code -> flag icon resolver for `token.issuer.country`.
//
// Ported from the Aegis Platform's Graph Lab country-flag mechanism
// (apps/ui/src/lib/graph/country-flag-chooser.ts + country-flag-overlay.ts
// + cluster-tooltips.tsx's flagEmoji, in the maslovsa/aegis-platform repo).
// Same two-tier design, adapted to this project's country set:
//
//   1. A small set of vendored SVG assets (public/flags/{cc}.svg) for the
//      codes that actually appear as an `issuer.country` in our lists —
//      real, crisp flags. Aegis vendors RU/UA/BY/IR/KG (their AML-relevant
//      jurisdictions); this project vendors US/HK/VG (the jurisdictions of
//      Circle, First Digital, and Tether — see public/lists/paras.json and
//      public/lists/aegis-super-list.json). Same mechanism, different
//      country set, because the two products care about different
//      countries. Extend VENDORED_FLAG_CODES + add the matching SVG under
//      public/flags/ if a new issuer country shows up.
//   2. A universal Unicode regional-indicator emoji fallback for any other
//      ISO 3166-1 alpha-2 code, so an unvendored country still renders
//      *something* meaningful instead of silently falling back to the globe.
//      This is the same trick as aegis-platform's cluster-tooltips.tsx
//      flagEmoji() — each letter maps to U+1F1E6..U+1F1FF. It's
//      OS/font-dependent (real flag glyph on macOS/iOS, boxed letter-pair
//      on platforms without an emoji font with flag support, e.g. many
//      Windows browsers) — which is exactly why the vendored SVG is
//      preferred whenever we have one.
//
// Source of the vendored SVGs: lipis/flag-icons (MIT), fetched from
// https://cdn.jsdelivr.net/npm/flag-icons/flags/4x3/{cc}.svg — see
// public/flags/README.md for attribution and how to add another one.

export const VENDORED_FLAG_CODES: ReadonlySet<string> = new Set(["US", "HK", "VG"]);

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
  return `/flags/${cc.toLowerCase()}.svg`;
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
