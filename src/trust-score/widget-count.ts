import type { Widget } from "../types.ts";

const WIDGET_COUNT_SANITY_THRESHOLD = 4;

export function checkWidgetCount(widgets: readonly Widget[] | undefined): { excessive: boolean; count: number } {
  const count = widgets?.length ?? 0;
  return { excessive: count > WIDGET_COUNT_SANITY_THRESHOLD, count };
}
