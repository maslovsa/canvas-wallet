// A round picture for an address-book entry: the initial letter on a name-colored disc is always there, and the
// image is laid over it once (and only if) it loads, so a slow or broken URL never shows a broken-image icon.
// The URL has already passed sanitizeAvatarUrl; no referrer is sent. Text is set with textContent only.
export function createAvatar(name: string, url: string | undefined, className: string, withLetter = true): HTMLElement {
  const avatar = document.createElement("span");
  avatar.className = className;
  avatar.setAttribute("aria-hidden", "true"); // decorative: the name beside it is the text
  if (withLetter) avatar.textContent = [...name][0]?.toUpperCase() ?? "?"; // the inline label avatar has none: its text is the name only
  avatar.style.setProperty("--book-hue", String(hueOf(name)));
  if (url) {
    const img = document.createElement("img");
    img.className = "book-avatar-img";
    img.alt = "";
    img.decoding = "async";
    img.referrerPolicy = "no-referrer";
    img.hidden = true;
    img.addEventListener("load", () => {
      img.hidden = false;
    });
    img.addEventListener("error", () => img.remove());
    img.src = url;
    avatar.append(img);
  }
  return avatar;
}

/** A stable hue (0-359) from the name: the same entry always gets the same avatar color. */
export function hueOf(text: string): number {
  let hash = 0;
  for (const ch of text) hash = (hash * 31 + ch.codePointAt(0)!) % 360;
  return hash;
}
