// Logo of the VASP that owns a screened address (Aegis verdict.entity.logo_url), shown next to its name when
// the address is clear. A pure module shared by the risk-check Worker and the phone's Send screen: the Worker
// drops anything that is not an acceptable logo URL, and the client checks again before it ever puts the URL
// in an <img> (it does not trust the Worker's answer blindly). Aegis serves these from jsDelivr as 160x160
// PNGs; anything else (another host, http, credentials, a port, a query, a non-PNG path) is refused.
const ALLOWED_HOSTS = new Set(["cdn.jsdelivr.net"]);
export const MAX_LOGO_URL_LENGTH = 300;

/**
 * A logo URL on a risky address must not give the reason away: Aegis files some logos under paths such as
 * ".../logos/sanctioned/<name>.png", which would show up in the network tab, the DOM and the seed file.
 */
const RISK_PATH = /sanction|ofac|sdn|blacklist|frozen|mixer|illicit|scam|hack|stolen|exploit|launder|fraud|terror|criminal/i;

/** `forRisk: true` (a caution result) also refuses a URL whose path names a risk reason. */
export function sanitizeLogoUrl(raw: unknown, forRisk = false): string | undefined {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_LOGO_URL_LENGTH || raw.trim() !== raw) return undefined;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:" || !ALLOWED_HOSTS.has(url.hostname)) return undefined;
  if (url.username !== "" || url.password !== "" || url.port !== "" || url.search !== "" || url.hash !== "") return undefined;
  if (!url.pathname.toLowerCase().endsWith(".png")) return undefined;
  if (forRisk && RISK_PATH.test(decodeURIComponent(url.pathname))) return undefined;
  return url.href;
}
