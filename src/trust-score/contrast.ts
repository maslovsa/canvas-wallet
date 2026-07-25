// WCAG AA contrast check. Implementation note vs. the original CEO-plan
// wording ("nearest gradient stop by the badge's on-screen position"):
// that's a layout-dependent computation coupled to the render pipeline
// (flagged by the eng review's outside voice as harder than described).
// Checking against the WORST (lowest-contrast) of ALL gradient stops is
// simpler, layout-independent, and strictly more conservative — if the
// badge would pass against every stop, it passes against whichever one it
// actually renders over. Documented here rather than silently done.

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return [r, g, b];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const srgb = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * srgb[0]! + 0.7152 * srgb[1]! + 0.0722 * srgb[2]!;
}

export function contrastRatio(hexA: string, hexB: string): number {
  const lumA = relativeLuminance(hexToRgb(hexA));
  const lumB = relativeLuminance(hexToRgb(hexB));
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

const WCAG_AA_NORMAL_TEXT = 4.5;

export interface ContrastCheckResult {
  passes: boolean;
  worstRatio: number;
  worstAgainst: string;
}

/** Checks badgeText color against primaryColor and every background gradient/solid stop; reports the worst case. */
export function checkBadgeContrast(
  badgeTextColor: string,
  primaryColor: string | undefined,
  backgroundColors: readonly string[],
): ContrastCheckResult {
  const candidates: Array<{ color: string; label: string }> = [];
  if (primaryColor) candidates.push({ color: primaryColor, label: "theme.primaryColor" });
  for (const [i, color] of backgroundColors.entries()) {
    candidates.push({ color, label: `background.colors[${i}]` });
  }

  let worst: { ratio: number; label: string } = { ratio: Infinity, label: "(no background)" };
  for (const { color, label } of candidates) {
    const ratio = contrastRatio(badgeTextColor, color);
    if (ratio < worst.ratio) worst = { ratio, label };
  }

  return {
    passes: worst.ratio >= WCAG_AA_NORMAL_TEXT,
    worstRatio: worst.ratio,
    worstAgainst: worst.label,
  };
}
