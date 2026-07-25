// Icon URLs are allowed from external hosts (design doc's resolved Open
// Question: external icon URLs permitted, with mitigation required), but
// only from an allowlisted set of domains, enforced here AND re-checked by
// the CI schema validator (scripts/validate-fixtures.ts) — not client-side
// only. Keep this list short and deliberate; adding a domain is a PR like
// any other change to the registry's trust surface.
export const ICON_DOMAIN_ALLOWLIST: readonly string[] = [
  "raw.githubusercontent.com",
  "assets.trustwallet.com",
  "cdn.jsdelivr.net",
];

export function isIconDomainAllowed(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return ICON_DOMAIN_ALLOWLIST.includes(hostname);
  } catch {
    return false;
  }
}
