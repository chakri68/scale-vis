# Scale-Vis

Compare anything to anything, at true scale.

**Live:** [scale-vis.chakri.me](https://scale-vis.chakri.me/)

How big is a T-Rex, _really_? Scale-Vis puts any two things side by side
on a shared ground line at one honest pixels-per-meter — animals, dinosaurs,
buses, bananas — and when the ratio gets too silly to walk with a camera, it
flips to "N copies of X" instead. Dinosaurs are the hero draw; the engine under
the hood doesn't know or care what a dinosaur is.

## Why it exists

Numbers hide size. You read "the blue whale is 30 meters long," nod, and retain
nothing, because 30 meters is an abstraction and your brain doesn't do
abstractions. But a whale next to a human, both to scale, both on the same
floor — that lands. That's the whole pitch. Make size visceral, never lie about
it to look impressive, and stay fun enough to be worth a screenshot.

## Running it

```bash
npm install
npm run dev      # vite dev server; silhouette/data mismatches show as console.warn
npm run build    # tsc + vite production bundle
npm run test     # vitest over the pure scale core
```

No backend, no accounts, no database. It's static JSON and client-side math all
the way down.

## How it works

Two facts do most of the heavy lifting:

**Position is truthful; glyph size has a floor.** Where an object sits on the
scale is always honest. But a mouse next to a Brachiosaurus is a sub-pixel
smudge, so below `MIN_GLYPH_PX` the object stops drawing as a silhouette and
becomes a labelled marker dot — foot still planted at its true position, only
the picture swapped. Zoom in and it _hatches_ back into a real silhouette the
instant it clears the pixel floor. Same object, same renderer, different zoom.

**There are two scenes, not three modes.** The _spatial_ scene puts both things
on a shared ground plane at one global ppm — length and height show up
truthfully at the same time because everything shares that one number.
Length/Height is a framing toggle (which measurement leads), _not_ two
renderers. The _count_ scene handles weight and length ratios too extreme to
walk, as "N copies of unit Y." That's the whole model. Get this wrong and you
end up building three tangled modes instead of the two that are actually here.

The correctness story lives entirely in `src/scale/` — pure functions, no DOM,
imports nothing but `config`. ppm math, the render-state floor, camera bounds,
count math. It's the part that can lie to you, so it's the part that's unit-
tested. Everything in `src/render/` is just SVG plumbing on top.

One rule that keeps the whole thing honest: **zoom flows through the data, not
through a CSS transform.** Zoom lives in `effectivePPM = base * zoom`, recomputed
into every glyph each frame. Pan is the only thing on the SVG group transform. If
you put `scale(zoom)` on the group it double-counts _and_ silently breaks the
marker-to-silhouette hatch — a transform scales pixels the browser already
painted, it doesn't change the `glyphPx` the threshold reads, so a tiny object
stays a blurry dot forever. So: zoom = data, pan = compositing. Don't mix them.

## Layout

```
src/
  scale/        PURE math — ppm, render-state, camera, count. The correctness story.
  render/       SVG view layer — SpatialStage, QuantityStage, markers, animation.
  app/          hash router, state store, home + compare pages, the item picker.
  data/         items.json + schema + loader (crops SVGs, derives aspect at load).
  styles/       amber-phosphor tokens + per-page CSS.
tests/scale/    vitest over the pure core.
public/silhouettes/   hand-drawn SVGs, one side + one top per item.
```

`src/config.ts` holds every tunable — glyph floor, fit padding, zoom cap, the
ratio where count view gets offered, animation timings. If a number controls
"feel," it's in there and nowhere else.

## Adding an item

Two files, no codegen:

1. Drop a silhouette SVG into `public/silhouettes/`.
2. Add its record to `src/data/items.json` — real-world dimensions in meters,
   weight in kg, a source URL for the numbers.

Reload. The loader crops the SVG to its tight bounding box, measures the aspect
from the _actual geometry_, and warns in dev if the art's proportions disagree
with the numbers you typed. That warning is a real punch-list, not noise —
either the drawing's wrong or the data is.

## Stack

Vite + vanilla TypeScript + vanilla CSS. Zero runtime dependencies — no
framework, no animation library. TS for the source, Vitest for the engine,
hand-rolled SVG via a tiny `createElementNS` helper. The animations are CSS
keyframes and a couple of `requestAnimationFrame` loops where CSS can't reach
(number count-ups, the hatch choreography).

It started as React and got rewritten to vanilla. The `scale/` folder didn't
change a line — which is roughly the point of keeping it pure.
