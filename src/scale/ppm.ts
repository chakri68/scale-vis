// scale/ppm.ts — the bridge between meters (everything real) and screen pixels
// (everything drawn). Design §5.
import { FIT_FRACTION, ITEM_GAP } from "../config";

export interface Size {
  w: number;
  h: number;
}

/**
 * A 2D projection of an item onto the picture plane: two real dimensions plus
 * the art aspect of the chosen silhouette. This is what makes side and top
 * views one renderer instead of two — a view just decides which real dims fill
 * `along`/`across` and which SVG's aspect to use:
 *   - side view: along = length, across = height, aspect = length/height
 *   - top  view: along = length, across = width,  aspect = length/width
 */
export interface Projection {
  along: number; // meters laid along the ground (horizontal)
  across: number; // in-plane vertical meters (height or width)
  aspect: number; // art aspect = along/across of the chosen silhouette
}

/**
 * ppm at zoom = 1: the WHOLE composition fits FIT_FRACTION of BOTH viewport
 * axes. The subtlety: because scale is uniform and each silhouette's viewBox
 * aspect matches its real length/height, an item's drawn size is just
 * ppm × real dimensions on BOTH axes at once (width = length·ppm, height =
 * height·ppm). So a fit that respects only one axis necessarily overflows the
 * other for mixed shapes — height-anchoring a long, low bus would blow it far
 * past the viewport width.
 *
 * The one non-overflowing max-size fit is therefore min(fit-width, fit-height):
 *   - width:  ppm·Σlength + (n-1)·ITEM_GAP = w·FIT   (gaps are fixed px)
 *   - height: ppm·maxHeight                = h·FIT
 * The anchor does NOT enter here — it only picks the primary callout (§7). A
 * tall, narrow item is height-limited automatically (its width fit is huge), so
 * it fills the vertical whichever way the anchor is toggled, which is exactly
 * what "fit a giraffe vertically" wanted — just derived instead of branched.
 */
export function basePPM(projs: Projection[], viewport: Size): number {
  if (projs.length === 0) return 1;

  const sumAlong = projs.reduce((s, p) => s + p.along, 0);
  const maxAcross = Math.max(...projs.map((p) => p.across));
  const gapsPx = (projs.length - 1) * ITEM_GAP;

  // Guard: a viewport too narrow to hold the gaps alone would give <=0 width.
  const ppmAlong = Math.max(viewport.w * FIT_FRACTION - gapsPx, 1) / sumAlong;
  const ppmAcross = (viewport.h * FIT_FRACTION) / maxAcross;
  return Math.min(ppmAlong, ppmAcross);
}

export const effectivePPM = (base: number, zoom: number): number => base * zoom;
