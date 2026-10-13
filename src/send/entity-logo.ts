// Logo of the VASP that owns a screened address (Aegis verdict.entity.logo_url), shown next to its name when
// the address is clear. A pure module shared by the risk-check Worker and the phone's Send screen: the Worker
// drops anything that is not an acceptable logo URL, and the client checks again before it ever puts the URL
// in an <img> (it does not trust the Worker's answer blindly). Aegis serves these from jsDelivr as 160x160
// PNGs; anything else (another host, http, credentials, a port, a query, a non-PNG path) is refused.
const ALLOWED_HOSTS = new Set(["cdn.jsdelivr.net"]);
export const MAX_LOGO_URL_LENGTH = 300;

export function sanitizeLogoUrl(raw: unknown): string | undefined {
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
  return url.href;
}
