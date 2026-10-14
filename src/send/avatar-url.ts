// The picture of an address-book entry (its "avatar"): a URL somewhere on the web. A pure module shared by the phone
// (which checks it again before it ever puts the URL in an <img>) and by CI. Only a few image hosts are accepted, over
// https, with no credentials, port or fragment, so a book cannot point the page at an arbitrary server:
//  - cdn.jsdelivr.net and upload.wikimedia.org: a plain .png / .jpg / .jpeg / .webp file, no query;
//  - api.dicebear.com: a generated avatar, "/<version>/<style>/png" with a ?seed= (and optional size).
export const MAX_AVATAR_URL_LENGTH = 300;
const FILE_HOSTS = new Set(["cdn.jsdelivr.net", "upload.wikimedia.org"]);
const GENERATED_HOST = "api.dicebear.com";
const DICEBEAR_PATH = /^\/\d+\.x\/[a-z0-9-]+\/png$/;
const DICEBEAR_PARAMS = new Set(["seed", "size", "backgroundColor"]);

export function sanitizeAvatarUrl(raw: unknown): string | undefined {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_AVATAR_URL_LENGTH || raw.trim() !== raw) return undefined;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "" || url.port !== "" || url.hash !== "") return undefined;
  if (FILE_HOSTS.has(url.hostname)) {
    if (url.search !== "" || !/\.(png|jpe?g|webp)$/i.test(url.pathname)) return undefined;
    return url.href;
  }
  if (url.hostname === GENERATED_HOST) {
    if (!DICEBEAR_PATH.test(url.pathname) || !url.searchParams.has("seed")) return undefined;
    for (const key of url.searchParams.keys()) if (!DICEBEAR_PARAMS.has(key)) return undefined;
    return url.href;
  }
  return undefined;
}
