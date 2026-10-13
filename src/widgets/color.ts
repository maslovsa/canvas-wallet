// Small color helpers for widgets that paint with a token's own accent color (ui.theme.primaryColor).

/** Relative luminance of a #rrggbb color (WCAG 2.x). Returns undefined for anything that is not exactly #rrggbb. */
export function relativeLuminance(hex: string): number | undefined {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return undefined;
  const n = Number.parseInt(m[1]!, 16);
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

function contrast(l1: number, l2: number): number {
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/** Black or white, whichever reads better on `background`. A malformed color falls back to white (the default accent is dark enough). */
export function readableTextColor(background: string): "#000000" | "#ffffff" {
  const l = relativeLuminance(background);
  if (l === undefined) return "#ffffff";
  return contrast(l, 0) >= contrast(l, 1) ? "#000000" : "#ffffff";
}
