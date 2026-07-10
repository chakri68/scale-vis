// config.ts — every tunable constant, one place (design §16).
// These are guesses until tuned against real assets; that's exactly why they
// live here and nowhere else.

// --- Spatial scene ---
export const MIN_GLYPH_PX = 24; // below this: silhouette -> marker
export const FIT_FRACTION = 0.8; // opening-frame padding
export const MAX_ZOOM = 40; // usability cap on spatial zoom
export const RATIO_COUNT_SUGGEST = 150; // above this: offer count view
export const MARKER_HATCH_MS = 250; // marker <-> silhouette crossfade
export const ITEM_GAP = 48; // px between footprints
// Load-time warn threshold for silhouette-vs-data aspect drift. Auto-crop (§10)
// removes padding as a cause, so this now only flags GENUINE art proportion
// mismatch; 8% tolerates natural hand-drawn variance (a drooping tail, a raised
// frill) while still catching a shape that's plain wrong.
export const ASPECT_TOLERANCE = 0.08;
export const GRID_TARGET_PX = 100; // desired on-screen spacing of a major grid cell

// --- Count scene ---
export const MAX_TILES = 12; // count scene glyphs before "× N"
export const MAX_EQUIVALENCES = 3;
export const NICE_COUNT_MIN = 5;
export const NICE_COUNT_MAX = 2000;

// Count scene is composition, not scale (§9) — kept separate on purpose so a
// count-tile size can never be mistaken for a to-scale size.
export const HERO_FIT_FRACTION = 0.55; // hero fills this much of stage height
export const TILE_MIN_PX = 28; // count-tile edge floor
export const TILE_MAX_PX = 96; // count-tile edge cap
