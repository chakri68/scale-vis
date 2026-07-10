// render/QuantityStage.ts — the count scene (design §9). "N copies of unit Y."
// Weight and extreme-ratio length are the SAME renderer, parameterized by the
// count that the caller already computed.
//
// Sizing here is COMPOSITION, not scale (§9): the hero and tiles are sized to
// read, never off effectivePPM. This is the one place glyph size is an
// intentional lie, so the sizing constants are kept separate from the spatial
// ones (config.ts) — a count-tile size must never be mistaken for a scale size.
import { el, clear } from "./dom";
import { stageColor } from "./stage-color";
import { formatCount } from "./anim";
import { HERO_FIT_FRACTION, MAX_TILES, TILE_MAX_PX, TILE_MIN_PX } from "../config";
import type { Item } from "../data/schema";

function glyph(item: Item, hue: string, wPx: number, hPx: number): HTMLElement {
  const g = el("div", { class: "count__glyph", style: `--hue:${hue}` });
  // Count scene always uses the side silhouette (already auto-cropped at load).
  g.style.setProperty("--src", `url("${item.maskSide}")`);
  g.style.width = `${wPx}px`;
  g.style.height = `${hPx}px`;
  return g;
}

export class QuantityStage {
  private container!: HTMLElement;
  private scene!: HTMLElement;
  private zoom = 1;
  // Base scale that fits the whole composition inside the stage. Inspect-zoom
  // multiplies this — it never changes the fit, only leans in/out.
  private fitScale = 1;

  mount(container: HTMLElement) {
    this.container = container;
    container.classList.add("stage", "stage--count");
    this.scene = el("div", { class: "count__scene" });
    container.appendChild(this.scene);

    // Zoom here is INSPECT-ONLY — a CSS transform so the reader can lean into
    // the hero or the tiles. It does NOT traverse the ratio. The whole reason
    // this scene exists is that traversing the ratio linearly is unusable; do
    // not "fix" this into a real zoom.
    container.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        this.zoom = Math.min(4, Math.max(0.5, this.zoom * Math.exp(-e.deltaY * 0.0015)));
        this.applyTransform();
      },
      { passive: false },
    );
  }

  private applyTransform() {
    this.scene.style.transform = `scale(${this.fitScale * this.zoom})`;
  }

  /** hero = the thing being measured; unit = what it's counted in; n = how many. */
  setComparison(hero: Item, unit: Item, n: number) {
    this.zoom = 1;
    this.fitScale = 1;
    this.scene.style.transform = "";
    clear(this.scene);

    const h = this.container.clientHeight || 400;
    const heroHue = stageColor(hero, { role: 0 });
    const unitHue = stageColor(unit, { role: 1 });

    // Hero: reference only, sized to read — HERO_FIT_FRACTION of stage height.
    const heroH = h * HERO_FIT_FRACTION;
    const heroW = heroH * hero.bboxAspect;
    const heroBox = el("div", { class: "count__hero" }, [
      glyph(hero, heroHue, heroW, heroH),
      el("div", { class: "count__hero-name", text: hero.name }),
    ]);

    // Tiles: a sample grid of unit glyphs, edge clamped, fading toward the end.
    const tileEdge = Math.min(TILE_MAX_PX, Math.max(TILE_MIN_PX, h * 0.12));
    const tileH = tileEdge;
    const tileW = tileH * unit.bboxAspect;
    const shown = Math.min(n, MAX_TILES);
    const tiles = el("div", { class: "count__tiles" });
    for (let i = 0; i < shown; i++) {
      const t = glyph(unit, unitHue, tileW, tileH);
      // fade the last couple so the row reads as "…and more"
      if (n > MAX_TILES && i >= shown - 3) {
        t.style.opacity = String(0.7 - (i - (shown - 3)) * 0.22);
      }
      tiles.appendChild(t);
    }

    const label = el("div", { class: "count__label", style: `--hue:${unitHue}` }, [
      el("span", { class: "count__times", text: "× " }),
      el("span", { class: "count__n", text: formatCount(n) }),
      el("span", { class: "count__unit", text: ` ${unit.name}` }),
    ]);

    this.scene.append(heroBox, tiles, label);

    // Reading scrollHeight forces a layout pass; tile/hero sizes are explicit
    // px so this is accurate before the mask images finish loading. Scale the
    // whole scene down if it would overflow the stage — the ×N label must
    // always be visible (it's the entire point of the count scene).
    const availH = h - 24;
    const availW = (this.container.clientWidth || 600) - 24;
    this.fitScale = Math.min(
      1,
      availH / this.scene.scrollHeight,
      availW / this.scene.scrollWidth,
    );
    this.applyTransform();
  }

  destroy() {
    clear(this.container);
    this.container.classList.remove("stage", "stage--count");
  }
}
