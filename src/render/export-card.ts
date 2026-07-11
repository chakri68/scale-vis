// render/export-card.ts — render a comparison to a shareable PNG "card".
//
// Why a canvas reconstruction instead of screenshotting the DOM: the stage is
// built from DOM divs whose silhouettes are CSS masks and whose title is a web
// font. The usual dependency-free "DOM → PNG" trick (serialize into an SVG
// <foreignObject>, draw that onto a canvas) silently drops both — CSS mask
// images and unembedded @font-face don't rasterize inside foreignObject — so
// the export would come out as blank boxes in a fallback font. Instead we redraw
// the scene here from the SAME pure scale math the live stage uses (basePPM /
// computeRenderState), tint the mask SVGs on an offscreen canvas exactly the way
// the CSS mask-recolor does, and compose a clean fixed-size card around it. One
// price: this mirrors SpatialStage's layout, so the two must stay in step.
import {
  basePPM,
  computeRenderState,
  type Projection,
  type Metric,
} from "../scale";
import { ITEM_GAP } from "../config";
import { stageColor } from "./stage-color";
import { formatCount } from "./anim";
import type { Item } from "../data/schema";
import type { SpatialMode } from "../app/state";

// Card geometry, in logical (CSS) px. Rendered at DPR = CARD_SCALE for crisp
// output; 1200×630 is the OG/Twitter card ratio so it previews well when shared.
const CARD_W = 1200;
const CARD_H = 630;
const CARD_SCALE = 2;
const PAD = 48;
const STAGE_TOP = 122;
const STAGE_BOTTOM = 56; // gap from card bottom to stage bottom (room for URL)
const GROUND_FRAC = 0.82; // matches SpatialStage.render()

export type CardInput =
  | { scene: "spatial"; a: Item; b: Item; mode: SpatialMode }
  | { scene: "count"; hero: Item; unit: Item; metric: Metric; n: number };

/** Build the PNG and hand the browser a download for it. */
export async function downloadCard(input: CardInput): Promise<void> {
  const blob = await renderCard(input);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${cardFilename(input)}.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoke on the next tick so the click's navigation to the blob has fired.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Render the card and resolve to a PNG Blob. */
export async function renderCard(input: CardInput): Promise<Blob> {
  // Fonts must be resident before we draw text, or the pixel title/mono body
  // fall back mid-raster. They're loaded at boot (display=block), so this is
  // usually already settled.
  await document.fonts.ready;

  const canvas = document.createElement("canvas");
  canvas.width = CARD_W * CARD_SCALE;
  canvas.height = CARD_H * CARD_SCALE;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(CARD_SCALE, CARD_SCALE); // draw in logical px; backing store is 2×

  const tk = tokens();
  drawBackdrop(ctx, tk);

  if (input.scene === "spatial") await drawSpatial(ctx, tk, input);
  else await drawCount(ctx, tk, input);

  drawChrome(ctx, tk, input);

  const blob = await new Promise<Blob | null>((res) =>
    canvas.toBlob(res, "image/png"),
  );
  if (!blob) {
    // Only realistic cause is a tainted canvas; our masks are self-contained
    // data-URI SVGs, so this shouldn't fire — but fail loud if it ever does.
    throw new Error("Card export failed (canvas could not be encoded).");
  }
  return blob;
}

// --- theme tokens, resolved from CSS custom properties (no drift from tokens.css)

interface Tokens {
  bg: string;
  ground: string;
  grid: string;
  accent: string;
  text: string;
  muted: string;
  fontPixel: string;
  fontMono: string;
}

function tokens(): Tokens {
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string) => cs.getPropertyValue(name).trim();
  return {
    bg: v("--bg") || "#000000",
    ground: v("--ground") || "#3a362e",
    grid: v("--grid") || "#16150f",
    accent: v("--accent") || "#ffb000",
    text: v("--text") || "#ece7da",
    muted: v("--muted") || "#8b8574",
    fontPixel: v("--font-pixel") || '"Press Start 2P", monospace',
    fontMono: v("--font-mono") || "monospace",
  };
}

/** stageColor() returns a "var(--trace-n)" reference; resolve it to a hex. */
function resolveHue(cssVarExpr: string): string {
  const name = cssVarExpr.match(/--[\w-]+/)?.[0];
  if (!name) return cssVarExpr;
  const hex = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return hex || "#48c9b0";
}

// --- backdrop: black + faint oscilloscope grid + glowing ground line ---

function drawBackdrop(ctx: CanvasRenderingContext2D, tk: Tokens) {
  ctx.fillStyle = tk.bg;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  ctx.strokeStyle = tk.grid;
  ctx.lineWidth = 1;
  const step = 56;
  ctx.beginPath();
  for (let x = 0; x <= CARD_W; x += step) {
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, CARD_H);
  }
  for (let y = 0; y <= CARD_H; y += step) {
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(CARD_W, y + 0.5);
  }
  ctx.stroke();
}

function groundY(): number {
  const stageH = CARD_H - STAGE_TOP - STAGE_BOTTOM;
  return STAGE_TOP + stageH * GROUND_FRAC;
}

function drawGround(ctx: CanvasRenderingContext2D, tk: Tokens) {
  const gy = Math.round(groundY()) + 0.5;
  ctx.save();
  ctx.strokeStyle = tk.ground;
  ctx.lineWidth = 1;
  ctx.shadowColor = withAlpha(tk.ground, 0.6);
  ctx.shadowBlur = 6;
  ctx.beginPath();
  ctx.moveTo(0, gy);
  ctx.lineTo(CARD_W, gy);
  ctx.stroke();
  ctx.restore();
}

// --- spatial scene: both items to scale on a shared ground, opening framing ---

async function drawSpatial(
  ctx: CanvasRenderingContext2D,
  tk: Tokens,
  { a, b, mode }: Extract<CardInput, { scene: "spatial" }>,
) {
  drawGround(ctx, tk);

  const items = [a, b];
  const top = mode === "top";
  // Mirror SpatialStage.computeProjections(): which real dims fill along/across
  // and which silhouette's aspect. primaryMeters is the callout dimension.
  const projs: Projection[] = items.map((it) => ({
    along: it.length,
    across: top ? it.width : it.height,
    aspect: top ? it.topAspect : it.bboxAspect,
  }));
  const primaryMeters = items.map((it) =>
    mode === "length" ? it.length : top ? it.width : it.height,
  );

  const stageX = PAD;
  const stageW = CARD_W - PAD * 2;
  const stageH = CARD_H - STAGE_TOP - STAGE_BOTTOM;
  const ppm = basePPM(projs, { w: stageW, h: stageH }); // zoom 1: clean fit
  const gy = groundY();

  const states = projs.map((p, i) =>
    computeRenderState(p, ppm, {
      name: items[i].name,
      primaryMeters: primaryMeters[i],
    }),
  );
  const totalW =
    states.reduce((s, rs) => s + rs.wPx, 0) + (states.length - 1) * ITEM_GAP;
  let x = stageX + (stageW - totalW) / 2;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const rs = states[i];
    const hue = resolveHue(stageColor(item, { role: i }));
    const footX = x + rs.wPx / 2;
    const flip = i % 2 === 1; // face each other (art authored facing right)

    if (rs.kind === "silhouette") {
      await drawGlyph(
        ctx,
        top ? item.maskTop : item.maskSide,
        footX - rs.wPx / 2,
        gy - rs.hPx,
        rs.wPx,
        rs.hPx,
        hue,
        flip,
      );
      // Primary-dimension label above the shape.
      label(ctx, fmtMeters(primaryMeters[i]), footX, gy - rs.hPx - 12, hue, {
        align: "center",
        size: 15,
        font: tk.fontMono,
        glow: true,
      });
    } else {
      drawMarker(ctx, footX, gy, hue, rs.label, tk);
    }

    // Name caption under the foot.
    label(ctx, item.name, footX, gy + 22, hue, {
      align: "center",
      size: 14,
      font: tk.fontMono,
      alpha: 0.9,
    });

    x += rs.wPx + ITEM_GAP;
  }
}

/** A dot on the true foot + a leader + label — mirrors the DOM marker (§6). */
function drawMarker(
  ctx: CanvasRenderingContext2D,
  footX: number,
  gy: number,
  hue: string,
  text: string,
  tk: Tokens,
) {
  const leaderH = 26;
  ctx.save();
  ctx.strokeStyle = withAlpha(hue, 0.55);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(footX + 0.5, gy);
  ctx.lineTo(footX + 0.5, gy - leaderH);
  ctx.stroke();

  ctx.fillStyle = hue;
  ctx.shadowColor = hue;
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.arc(footX, gy, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  label(ctx, text, footX, gy - leaderH - 10, hue, {
    align: "center",
    size: 14,
    font: tk.fontMono,
    glow: true,
  });
}

// --- count scene: hero + a fading row of unit tiles + "× N" ---

async function drawCount(
  ctx: CanvasRenderingContext2D,
  tk: Tokens,
  { hero, unit, metric, n }: Extract<CardInput, { scene: "count" }>,
) {
  const midY = (STAGE_TOP + (CARD_H - STAGE_BOTTOM)) / 2;
  const heroHue = resolveHue(stageColor(hero, { role: 0 }));
  const unitHue = resolveHue(stageColor(unit, { role: 1 }));

  // Three fixed horizontal zones inside the usable width, so the layout holds
  // for any hero aspect (a long blue whale can't shove the tiles off the card):
  //   [hero] [ = N × ] [ tile grid ]
  const HERO_ZONE = 420;
  const EQ_ZONE = 240;
  const heroCx = PAD + HERO_ZONE / 2;
  const eqCx = PAD + HERO_ZONE + EQ_ZONE / 2;
  const tilesL = PAD + HERO_ZONE + EQ_ZONE;
  const tilesW = CARD_W - PAD - tilesL;

  // Hero fit to its zone (composition, not scale — §9): cap both width and
  // height, keep the art aspect. A wide hero ends up short; a tall one narrow.
  const heroBoxW = HERO_ZONE - 48;
  const heroBoxH = 260;
  const heroH = Math.min(heroBoxH, heroBoxW / hero.bboxAspect);
  const heroW = heroH * hero.bboxAspect;
  await drawGlyph(
    ctx,
    hero.maskSide,
    heroCx - heroW / 2,
    midY - heroH / 2,
    heroW,
    heroH,
    heroHue,
    false,
  );
  label(ctx, hero.name, heroCx, midY + heroH / 2 + 20, heroHue, {
    align: "center",
    size: 15,
    font: tk.fontMono,
    alpha: 0.9,
  });

  // "= N ×" bridge, centered in its zone (shrunk to fit if the count is huge).
  const eqText = `= ${formatCount(n)} ×`;
  label(ctx, fit(ctx, eqText, EQ_ZONE - 16, 30, tk.fontMono), eqCx, midY, tk.text, {
    align: "center",
    baseline: "middle",
    size: 30,
    font: tk.fontMono,
  });
  label(ctx, metric === "weight" ? "by weight" : "by length", eqCx, midY + 34, tk.muted, {
    align: "center",
    baseline: "middle",
    size: 14,
    font: tk.fontMono,
  });

  // A small grid of unit tiles, fading toward the edge — a hint of the count,
  // not a literal N of them (that's the whole point of count view — §9).
  const cols = 4;
  const rows = 3;
  const tileH = 44;
  const gap = 14;
  const tileW = tileH * unit.bboxAspect;
  const gridW = cols * tileW + (cols - 1) * gap;
  const gridH = rows * tileH + (rows - 1) * gap;
  const startX = tilesL + (tilesW - gridW) / 2;
  const startY = midY - gridH / 2;
  const shown = Math.min(cols * rows, Math.max(1, n));
  for (let k = 0; k < shown; k++) {
    const col = k % cols;
    const row = Math.floor(k / cols);
    ctx.save();
    ctx.globalAlpha = 1 - (k / (cols * rows)) * 0.6; // fade toward the edge
    await drawGlyph(
      ctx,
      unit.maskSide,
      startX + col * (tileW + gap),
      startY + row * (tileH + gap),
      tileW,
      tileH,
      unitHue,
      false,
    );
    ctx.restore();
  }
  label(ctx, unit.name, tilesL + tilesW / 2, startY + gridH + 22, unitHue, {
    align: "center",
    size: 14,
    font: tk.fontMono,
    alpha: 0.9,
  });
}

// --- chrome: title, headline, share URL ---

function drawChrome(
  ctx: CanvasRenderingContext2D,
  tk: Tokens,
  input: CardInput,
) {
  // Wordmark (pixel font, amber, glowing — the one branded element).
  label(ctx, "SCALE-VIS", PAD, 48, tk.accent, {
    align: "left",
    baseline: "alphabetic",
    size: 20,
    font: tk.fontPixel,
    glow: true,
  });

  // Headline sentence.
  label(ctx, headline(input), PAD, 92, tk.text, {
    align: "left",
    size: 22,
    font: tk.fontMono,
  });

  // Share URL, centered along the bottom.
  const url = fit(ctx, shareUrl(), CARD_W - PAD * 2, 14, tk.fontMono);
  label(ctx, url, CARD_W / 2, CARD_H - 24, tk.muted, {
    align: "center",
    size: 14,
    font: tk.fontMono,
  });
}

function headline(input: CardInput): string {
  if (input.scene === "count") {
    return `${input.hero.name} = ${formatCount(input.n)} × ${input.unit.name}`;
  }
  const { a, b, mode } = input;
  const dim = (it: Item) =>
    mode === "length" ? it.length : mode === "top" ? it.width : it.height;
  const verb = mode === "length" ? "longer" : mode === "top" ? "wider" : "taller";
  const word = mode === "length" ? "length" : mode === "top" ? "width" : "height";
  const [big, small] = dim(a) >= dim(b) ? [a, b] : [b, a];
  const ratio = dim(small) > 0 ? dim(big) / dim(small) : 0;
  if (ratio < 1.05) return `${a.name} and ${b.name} are about the same ${word}`;
  return `${big.name} is ${fmtRatio(ratio)}× ${verb} than ${small.name}`;
}

function shareUrl(): string {
  // The hash IS the shareable comparison (§12). host+hash reads cleaner than a
  // full localhost href and still round-trips when pasted at the live domain.
  return `${location.host}${location.pathname}${location.hash}`.replace(
    /\/$/,
    "",
  );
}

function cardFilename(input: CardInput): string {
  const ids =
    input.scene === "count"
      ? `${input.hero.id}-x-${input.unit.id}`
      : `${input.a.id}-vs-${input.b.id}`;
  return `scale-vis-${ids}`;
}

// --- glyph tinting: rasterize the mask SVG and recolor it to the stage hue,
//     exactly as the CSS `mask` + `background-color` does on the live stage ---

async function drawGlyph(
  ctx: CanvasRenderingContext2D,
  maskUri: string,
  x: number,
  y: number,
  w: number,
  h: number,
  hue: string,
  flip: boolean,
) {
  const dw = Math.max(1, Math.round(w * CARD_SCALE));
  const dh = Math.max(1, Math.round(h * CARD_SCALE));
  let img: HTMLImageElement;
  try {
    img = await loadSvg(maskUri, dw, dh);
  } catch {
    return; // a missing/broken mask just drops that glyph rather than aborting
  }

  // Offscreen at device resolution: draw the shape, then paint the hue through
  // its alpha (source-in) so we keep the silhouette but throw away its colors.
  const oc = document.createElement("canvas");
  oc.width = dw;
  oc.height = dh;
  const octx = oc.getContext("2d")!;
  octx.drawImage(img, 0, 0, dw, dh);
  octx.globalCompositeOperation = "source-in";
  octx.fillStyle = hue;
  octx.fillRect(0, 0, dw, dh);

  ctx.save();
  ctx.shadowColor = withAlpha(hue, 0.4); // phosphor bloom (§14)
  ctx.shadowBlur = 10;
  if (flip) {
    ctx.translate(x + w, y);
    ctx.scale(-1, 1);
    ctx.drawImage(oc, 0, 0, w, h);
  } else {
    ctx.drawImage(oc, x, y, w, h);
  }
  ctx.restore();
}

/**
 * Load a cropped mask SVG as an image. load.ts strips width/height (leaving only
 * the viewBox), which Firefox rasterizes to 0×0 when drawn to canvas — so we
 * re-inject a concrete pixel size. preserveAspectRatio="none" is already set, so
 * the content stretches to fill it, matching the CSS mask's `/ 100% 100%`.
 */
function loadSvg(
  dataUri: string,
  w: number,
  h: number,
): Promise<HTMLImageElement> {
  const comma = dataUri.indexOf(",");
  const svgText = decodeURIComponent(dataUri.slice(comma + 1));
  const sized = svgText.replace(/<svg\b/, `<svg width="${w}" height="${h}"`);
  const src = "data:image/svg+xml," + encodeURIComponent(sized);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("svg load failed"));
    img.src = src;
  });
}

// --- text + color helpers ---

interface LabelOpts {
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
  size: number;
  font: string;
  glow?: boolean;
  alpha?: number;
}

function label(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  opts: LabelOpts,
) {
  ctx.save();
  ctx.font = `${opts.size}px ${opts.font}`;
  ctx.textAlign = opts.align ?? "left";
  ctx.textBaseline = opts.baseline ?? "alphabetic";
  ctx.fillStyle = color;
  if (opts.alpha != null) ctx.globalAlpha = opts.alpha;
  if (opts.glow) {
    ctx.shadowColor = withAlpha(color, 0.45);
    ctx.shadowBlur = 8;
  }
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** Truncate with an ellipsis until it fits maxW at the given font. */
function fit(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxW: number,
  size: number,
  font: string,
): string {
  ctx.save();
  ctx.font = `${size}px ${font}`;
  if (ctx.measureText(text).width <= maxW) {
    ctx.restore();
    return text;
  }
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > maxW) {
    t = t.slice(0, -1);
  }
  ctx.restore();
  return t + "…";
}

function fmtMeters(m: number): string {
  const s = m >= 10 ? m.toFixed(0) : m.toFixed(m < 1 ? 2 : 1);
  return `${s} m`;
}

function fmtRatio(r: number): string {
  if (r >= 100) return String(Math.round(r));
  if (r >= 10) return r.toFixed(0);
  return r.toFixed(1);
}

/** #rrggbb (+ optional #rgb) → rgba() at the given alpha. */
function withAlpha(hex: string, alpha: number): string {
  let h = hex.replace("#", "").trim();
  if (h.length === 3) h = h.replace(/./g, (c) => c + c);
  const int = parseInt(h, 16);
  if (Number.isNaN(int) || h.length !== 6) return hex;
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
