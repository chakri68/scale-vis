// scale/camera.ts — zoom bounds, opening zoom, ratio -> count-suggest (§8).
import { MAX_ZOOM, RATIO_COUNT_SUGGEST } from "../config";
import type { Item } from "../data/schema";

export interface Camera {
  zoom: number;
  panX: number;
  panY: number;
}

export const minZoom = 1.0; // basePPM frames the whole composition; nothing to zoom out into
export const maxZoom = MAX_ZOOM; // usability cap, not a math cap
export const openingZoom = 1.0;

export const openingCamera = (): Camera => ({
  zoom: openingZoom,
  panX: 0,
  panY: 0,
});

export const clampZoom = (z: number): number =>
  Math.min(maxZoom, Math.max(minZoom, z));

type Extent = Pick<Item, "length">;

/**
 * Above RATIO_COUNT_SUGGEST the linear scene is technically usable but hostile —
 * the small object is thousands of screen-widths away. Surface a "switch to
 * count view" CTA. Linear stays fully available; count is an escape hatch, not a
 * replacement (§8).
 *
 * Judged on LENGTH (the along axis) regardless of view: that's the axis the
 * layout traverses, so it's what makes one item vanish off the side. An extreme
 * height/width difference doesn't need count — the min-both fit (§5) still frames
 * both, and the glyph floor turns anything too small into a marker.
 */
export function shouldSuggestCount(items: Extent[]): boolean {
  if (items.length < 2) return false;
  const max = Math.max(...items.map((i) => i.length));
  const min = Math.min(...items.map((i) => i.length));
  if (min <= 0) return false;
  return max / min > RATIO_COUNT_SUGGEST;
}
