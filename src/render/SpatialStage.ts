// render/SpatialStage.ts — the spatial scene (design §7). Both objects on a
// shared ground plane at one global ppm, so length and height read truthfully
// at once. Owns its own camera + input.
//
// THE HARD RULE (§7): the scene layer's transform is PAN-ONLY. Zoom lives
// exclusively in effectivePPM, recomputed into every item's geometry each frame.
// Never scale() the scene — that would double-count and silently kill the
// marker⇄silhouette hatch, since a CSS scale doesn't change the glyphPx the
// threshold reads.
import { el, clear } from "./dom";
import { stageColor } from "./stage-color";
import { Tribute } from "./tribute";
import {
  basePPM,
  effectivePPM,
  computeRenderState,
  clampZoom,
  openingCamera,
  type Camera,
  type Projection,
} from "../scale";
import { GRID_TARGET_PX, ITEM_GAP } from "../config";
import type { Item } from "../data/schema";
import type { SpatialMode } from "../app/state";

/**
 * Pick a "nice" world spacing (meters) whose on-screen size lands near
 * GRID_TARGET_PX at the current ppm — snapped to the 1/2/5 × 10ⁿ ladder. As you
 * zoom in, ppm rises, the chosen spacing steps down (10m → 5m → 2m → 1m …), and
 * a finer grid appears on its own. That's the "more sub-grid when zoomed in".
 */
function niceGridMeters(ppm: number): number {
  const raw = GRID_TARGET_PX / ppm; // meters that would fill the target px
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / pow; // 1..10
  const nice = n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10;
  return nice * pow;
}

interface ItemNodes {
  root: HTMLElement; // positioned wrapper, tinted to the item's hue
  silhouette: HTMLElement; // mask-recolored shape
  marker: HTMLElement; // dot + leader + label
  markerLabel: HTMLElement;
  measure: HTMLElement; // anchor-dim bracket
  measureLabel: HTMLElement;
  caption: HTMLElement; // name under the foot
}

export class SpatialStage {
  private container!: HTMLElement;
  private scene!: HTMLElement;
  private ground!: HTMLElement;
  private items: Item[] = [];
  private nodes: ItemNodes[] = [];
  private mode: SpatialMode = "length";
  // Per-item projection (meters + art aspect) and the primary-callout dimension,
  // both derived once per comparison/mode from the current view. render() only
  // multiplies these by ppm each frame.
  private projs: Projection[] = [];
  private primaryMeters: number[] = [];
  private primaryVertical = false; // height/top call out a vertical dimension
  private camera: Camera = openingCamera();
  private tribute = new Tribute(); // Alan Grant, when the cast calls for him
  private ro?: ResizeObserver;
  private base = 1;
  private ac?: AbortController; // removes input listeners on destroy()

  mount(container: HTMLElement) {
    this.container = container;
    container.classList.add("stage", "stage--spatial");
    this.scene = el("div", { class: "stage__scene" });
    this.ground = el("div", { class: "stage__ground" });
    // Ground is a child of the CONTAINER, not the panned scene, so it always
    // spans the full viewport width — panning sideways never drags an edge into
    // view (an infinite ground plane). We re-apply only the VERTICAL pan to it
    // in render() so it stays glued under the feet. Appended before the scene
    // so items paint on top of the line.
    container.appendChild(this.ground);
    container.appendChild(this.scene);

    this.bindInput();
    this.ro = new ResizeObserver(() => this.reflow());
    this.ro.observe(container);
  }

  setComparison(items: Item[], mode: SpatialMode) {
    this.items = items;
    this.mode = mode;
    this.camera = openingCamera();
    this.computeProjections();
    this.buildNodes(); // clears the scene — the tribute must mount after it
    this.tribute.setComparison(this.scene, items, mode);
    this.reflow();
  }

  // Map the current view onto each item: which real dims fill along/across,
  // which SVG's aspect, and which dimension is the primary callout.
  //   length -> side art, callout length (horizontal)
  //   height -> side art, callout height (vertical)
  //   top    -> top  art, callout width  (vertical)
  private computeProjections() {
    const top = this.mode === "top";
    this.primaryVertical = this.mode !== "length";
    this.projs = this.items.map((item) => ({
      along: item.length,
      across: top ? item.width : item.height,
      aspect: top ? item.topAspect : item.bboxAspect,
    }));
    this.primaryMeters = this.items.map((item) =>
      this.mode === "length"
        ? item.length
        : top
          ? item.width
          : item.height,
    );
  }

  resetCamera() {
    this.camera = openingCamera();
    this.render();
  }

  destroy() {
    this.tribute.destroy(); // drops its intro timer, not just its node
    this.ro?.disconnect();
    this.ac?.abort(); // drop input listeners — else a new stage on this same
    // container (e.g. Length↔Height swap) would stack a second set on top.
    clear(this.container);
    this.container.classList.remove("stage", "stage--spatial");
  }

  private viewport() {
    return { w: this.container.clientWidth, h: this.container.clientHeight };
  }

  private buildNodes() {
    clear(this.scene);
    const maskOf = (item: Item) =>
      this.mode === "top" ? item.maskTop : item.maskSide;
    this.nodes = this.items.map((item, role) => {
      const hue = stageColor(item, { role });
      const root = el("div", { class: "stage__item", style: `--hue:${hue}` });

      const silhouette = el("div", { class: "stage__silhouette" });
      silhouette.style.setProperty("--src", `url("${maskOf(item)}")`);
      // Face each other: art is authored facing right, so left item (even role)
      // keeps facing right, right item (odd role) flips to face left. The flip
      // composes with the hatch scale via CSS (both feed one transform).
      silhouette.style.setProperty("--flip", role % 2 === 1 ? "-1" : "1");

      const markerLabel = el("div", { class: "stage__marker-label" });
      const marker = el("div", { class: "stage__marker" }, [
        el("div", { class: "stage__marker-leader" }),
        el("div", { class: "stage__marker-dot" }),
        markerLabel,
      ]);

      const measureLabel = el("div", { class: "stage__measure-label" });
      const measure = el("div", { class: "stage__measure" }, [measureLabel]);

      const caption = el("div", { class: "stage__caption", text: item.name });

      root.append(measure, silhouette, marker, caption);
      this.scene.appendChild(root);
      return {
        root,
        silhouette,
        marker,
        markerLabel,
        measure,
        measureLabel,
        caption,
      };
    });
  }

  /** Re-measure the viewport and recompute the opening ppm, then render. */
  private reflow() {
    if (this.items.length === 0) return;
    // Alan is fit with the items, not around them — he's standing on the same
    // ground, so the frame has to account for him or he overflows it.
    this.base = basePPM(
      [...this.projs, ...this.tribute.projection()],
      this.viewport(),
    );
    this.render();
  }

  /** Per-frame: pan on the scene transform, everything else off effectivePPM. */
  private render() {
    const { w, h } = this.viewport();
    const ppm = effectivePPM(this.base, this.camera.zoom);
    const groundY = h * 0.82;

    // Lay footprints left-to-right, centered as a group; zoom naturally spreads
    // them because each wPx grows with ppm.
    const states = this.projs.map((p, i) =>
      computeRenderState(p, ppm, {
        name: this.items[i].name,
        primaryMeters: this.primaryMeters[i],
      }),
    );
    // Alan takes the leading slot in the row, counted in the total so the whole
    // cast centers together. Laid out beside the group instead, he hangs off the
    // stage's clipped edge the moment the group is wide. reflow() feeds the same
    // footprint to basePPM, so the slot he takes here is the slot the fit
    // reserved for him.
    const tributeW = this.tribute.widthAt(ppm);
    const totalW =
      states.reduce((s, rs) => s + rs.wPx, 0) +
      (states.length - 1) * ITEM_GAP +
      (tributeW > 0 ? tributeW + ITEM_GAP : 0);
    let x = (w - totalW) / 2;

    this.tribute.layout(ppm, x, groundY);
    if (tributeW > 0) x += tributeW + ITEM_GAP;

    // Pan lives here and ONLY here.
    this.scene.style.transform = `translate(${this.camera.panX}px, ${this.camera.panY}px)`;
    // Ground sits in the container (full-width, effectively infinite); give it
    // just the vertical pan so it tracks the feet without ever showing an edge.
    this.ground.style.top = `${groundY + this.camera.panY}px`;

    // World-anchored grid: snap major spacing to nice meters, subdivide by 5,
    // and phase it to the composition center (x) and the ground line (y) so it
    // zooms from center and a major line always rides the ground.
    const majorPx = niceGridMeters(ppm) * ppm;
    const cs = this.container.style;
    cs.setProperty("--grid-major", `${majorPx}px`);
    cs.setProperty("--grid-minor", `${majorPx / 5}px`);
    cs.setProperty("--grid-ox", `${w / 2 + this.camera.panX}px`);
    cs.setProperty("--grid-oy", `${groundY + this.camera.panY}px`);

    states.forEach((rs, i) => {
      const n = this.nodes[i];
      const footX = x + rs.wPx / 2;
      const isSil = rs.kind === "silhouette";

      n.root.classList.toggle("is-silhouette", isSil);
      n.root.classList.toggle("is-marker", !isSil);

      // Silhouette: bottom edge sits on the ground line, centered on footX.
      n.silhouette.style.width = `${rs.wPx}px`;
      n.silhouette.style.height = `${rs.hPx}px`;
      n.silhouette.style.left = `${footX - rs.wPx / 2}px`;
      n.silhouette.style.top = `${groundY - rs.hPx}px`;

      // Marker: dot on the true foot position; label + leader rise above it.
      n.marker.style.left = `${footX}px`;
      n.marker.style.top = `${groundY}px`;
      if (rs.kind === "marker") n.markerLabel.textContent = rs.label;

      // Caption under the foot.
      n.caption.style.left = `${footX}px`;
      n.caption.style.top = `${groundY + 8}px`;

      // Primary-dimension measurement bracket (only worth showing as a glyph).
      this.layoutMeasure(n, rs, footX, groundY, i);

      x += rs.wPx + ITEM_GAP;
    });
  }

  private layoutMeasure(
    n: ItemNodes,
    rs: { wPx: number; hPx: number },
    footX: number,
    groundY: number,
    i: number,
  ) {
    n.measureLabel.textContent = fmtMeters(this.primaryMeters[i]);
    if (this.primaryVertical) {
      // vertical bracket to the left of the silhouette (height or width)
      n.measure.classList.remove("is-horizontal");
      n.measure.classList.add("is-vertical");
      n.measure.style.left = `${footX - rs.wPx / 2 - 14}px`;
      n.measure.style.top = `${groundY - rs.hPx}px`;
      n.measure.style.height = `${rs.hPx}px`;
      n.measure.style.width = "";
    } else {
      // horizontal bracket under the silhouette (length)
      n.measure.classList.remove("is-vertical");
      n.measure.classList.add("is-horizontal");
      n.measure.style.left = `${footX - rs.wPx / 2}px`;
      n.measure.style.top = `${groundY + 34}px`;
      n.measure.style.width = `${rs.wPx}px`;
      n.measure.style.height = "";
    }
  }

  private bindInput() {
    const c = this.container;
    this.ac = new AbortController();
    const { signal } = this.ac;

    c.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const factor = Math.exp(-e.deltaY * 0.0015);
        this.camera.zoom = clampZoom(this.camera.zoom * factor);
        this.render();
      },
      { passive: false, signal },
    );

    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    c.addEventListener(
      "pointerdown",
      (e) => {
        e.preventDefault(); // don't let a native selection/drag start
        dragging = true;
        lastX = e.clientX;
        lastY = e.clientY;
        c.setPointerCapture(e.pointerId);
        c.classList.add("is-panning");
      },
      { signal },
    );
    c.addEventListener(
      "pointermove",
      (e) => {
        if (!dragging) return;
        this.camera.panX += e.clientX - lastX;
        this.camera.panY += e.clientY - lastY;
        lastX = e.clientX;
        lastY = e.clientY;
        this.render();
      },
      { signal },
    );
    const end = (e: PointerEvent) => {
      dragging = false;
      c.releasePointerCapture?.(e.pointerId);
      c.classList.remove("is-panning");
    };
    c.addEventListener("pointerup", end, { signal });
    c.addEventListener("pointercancel", end, { signal });
  }
}

function fmtMeters(m: number): string {
  const s = m >= 10 ? m.toFixed(0) : m.toFixed(m < 1 ? 2 : 1);
  return `${s} m`;
}
