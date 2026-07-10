// data/load.ts — import items.json, validate, AUTO-CROP each SVG to its content,
// derive the tight art aspect, and run the dev-only drift check (design §10, §11).
import rawItems from "./items.json";
import { validateRawItem, type Item, type RawItem } from "./schema";
import { ASPECT_TOLERANCE } from "../config";

const BASE = import.meta.env.BASE_URL; // respects Vite's base path
const svgUrl = (file: string) => `${BASE}silhouettes/${file}`;

interface Cropped {
  src: string; // cropped SVG as a data: URI, ready for CSS mask
  aspect: number; // tight content aspect (width / height)
}

/**
 * Auto-crop an SVG to its actual drawn content: render it offscreen, measure
 * the tight bounding box of every shape (stroke included) in viewBox units via
 * getBBox + getCTM, then rewrite the viewBox to exactly that box. This removes
 * any transparent padding an export tool baked in — the reason a viewBox aspect
 * can disagree with the art — so the hand-authored "tight viewBox" convention
 * is no longer something you have to get right. preserveAspectRatio="none" lets
 * the CSS mask stretch the (now-tight) content to fill its element exactly.
 *
 * Returns null if the DOM/measurement isn't available (SSR, or a pathological
 * SVG); the caller then falls back to the raw file + its authored viewBox.
 */
function cropSvg(svgText: string): Cropped | null {
  if (typeof document === "undefined") return null;

  const holder = document.createElement("div");
  holder.style.cssText =
    "position:absolute;left:-99999px;top:0;width:0;height:0;overflow:visible";
  holder.innerHTML = svgText;
  document.body.appendChild(holder);
  try {
    const svg = holder.querySelector("svg");
    if (!svg) return null;

    const shapes = svg.querySelectorAll<SVGGraphicsElement>(
      "path,rect,circle,ellipse,polygon,polyline,line",
    );
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;

    shapes.forEach((s) => {
      const m = s.getCTM(); // shape-local -> viewBox user space
      if (!m) return;
      const bb = s.getBBox();
      // Include the stroke: it's part of the visible silhouette, and the alpha
      // mask picks it up. getBBox() is fill-only, so inflate by half-stroke.
      const cs = getComputedStyle(s);
      const half =
        cs.stroke && cs.stroke !== "none"
          ? (parseFloat(cs.strokeWidth) || 0) / 2
          : 0;
      const xs = [bb.x - half, bb.x + bb.width + half];
      const ys = [bb.y - half, bb.y + bb.height + half];
      for (const x of xs)
        for (const y of ys) {
          const vx = m.a * x + m.c * y + m.e;
          const vy = m.b * x + m.d * y + m.f;
          if (vx < minX) minX = vx;
          if (vx > maxX) maxX = vx;
          if (vy < minY) minY = vy;
          if (vy > maxY) maxY = vy;
        }
    });

    const w = maxX - minX;
    const h = maxY - minY;
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
      return null;
    }

    svg.setAttribute("viewBox", `${minX} ${minY} ${w} ${h}`);
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    svg.removeAttribute("width");
    svg.removeAttribute("height");

    const src = "data:image/svg+xml," + encodeURIComponent(svg.outerHTML);
    return { src, aspect: w / h };
  } finally {
    holder.remove();
  }
}

function checkAspect(
  id: string,
  which: string,
  artAspect: number,
  dataAspect: number,
  fixHint: string,
) {
  if (!import.meta.env.DEV) return;
  const drift = Math.abs(artAspect - dataAspect) / dataAspect;
  if (drift > ASPECT_TOLERANCE) {
    console.warn(
      `[scale-vis] "${id}" ${which}: cropped silhouette aspect ${artAspect.toFixed(2)} ` +
        `vs data ${dataAspect.toFixed(2)} (${(drift * 100) | 0}% off). ${fixHint}`,
    );
  }
}

function hydrate(item: RawItem, sideSvg: string, topSvg: string): Item {
  // Auto-crop; fall back to the raw file if measurement is unavailable.
  const side = cropSvg(sideSvg) ?? { src: svgUrl(item.svg), aspect: NaN };
  const top = cropSvg(topSvg) ?? { src: svgUrl(item.svgTop), aspect: NaN };
  const bboxAspect = Number.isFinite(side.aspect)
    ? side.aspect
    : item.length / item.height;
  const topAspect = Number.isFinite(top.aspect)
    ? top.aspect
    : item.length / item.width;

  checkAspect(
    item.id,
    "side",
    bboxAspect,
    item.length / item.height,
    "The art's proportions disagree with length/height — redraw or adjust the numbers.",
  );
  checkAspect(
    item.id,
    "top",
    topAspect,
    item.length / item.width,
    "The art's proportions disagree with length/width — redraw or adjust the numbers.",
  );

  return {
    ...item,
    bboxAspect,
    topAspect,
    maskSide: side.src,
    maskTop: top.src,
  };
}

async function fetchSvg(id: string, file: string): Promise<string> {
  const res = await fetch(svgUrl(file));
  if (!res.ok) {
    throw new Error(`[scale-vis] "${id}": missing silhouette ${file}`);
  }
  return res.text();
}

let cache: Promise<Item[]> | null = null;

/** Load, validate and hydrate the full inventory. Memoized — one fetch pass. */
export function loadItems(): Promise<Item[]> {
  if (cache) return cache;
  cache = (async () => {
    const raws = (rawItems as unknown[]).map(validateRawItem);
    const items = await Promise.all(
      raws.map(async (raw) => {
        const [side, top] = await Promise.all([
          fetchSvg(raw.id, raw.svg),
          fetchSvg(raw.id, raw.svgTop),
        ]);
        return hydrate(raw, side, top);
      }),
    );
    return items;
  })();
  return cache;
}
