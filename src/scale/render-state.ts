// scale/render-state.ts — the floor (design §6). Per item, per frame, off the
// CURRENT ppm. Zoom-reactive heart of the spatial scene.
import { MIN_GLYPH_PX } from "../config";
import type { Projection } from "./ppm";

export type RenderState =
  | { kind: "silhouette"; wPx: number; hPx: number }
  | { kind: "marker"; wPx: number; hPx: number; label: string };

export interface MarkerMeta {
  name: string;
  primaryMeters: number; // the dimension the current framing calls out
}

export function markerLabel(meta: MarkerMeta): string {
  return `${meta.name} · ${formatMeters(meta.primaryMeters)}`;
}

function formatMeters(m: number): string {
  // 1.8 m, 12 m, 0.18 m — keep it short and honest.
  const s = m >= 10 ? m.toFixed(0) : m.toFixed(m < 1 ? 2 : 1);
  return `${s} m`;
}

/**
 * UNIFORM scale only. Drawn width = along·ppm; drawn height follows the ART
 * aspect (`wPx / aspect`), never the other real dimension — that's what keeps a
 * silhouette from ever being stretched. Because the load-time check (§10) keeps
 * the art aspect matched to the real dims, `hPx` equals across·ppm; deriving it
 * from the art rather than the data is what guarantees no stretch even if they
 * drift. Geometry is framing-agnostic now: which dimension is "primary" only
 * affects the marker label, so the caller passes it in.
 */
export function computeRenderState(
  p: Projection,
  ppm: number,
  meta: MarkerMeta,
): RenderState {
  const wPx = p.along * ppm;
  const hPx = wPx / p.aspect;

  const glyphPx = Math.max(wPx, hPx);
  return glyphPx < MIN_GLYPH_PX
    ? { kind: "marker", wPx, hPx, label: markerLabel(meta) }
    : { kind: "silhouette", wPx, hPx };
}
