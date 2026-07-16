// render/tribute.ts — Dr. Alan Grant on the ground plane, in memory of Sam Neill
// (1947–2026). He turns up whenever a comparison includes a dinosaur he shared
// the screen with — plus Utahraptor, which is what those raptors really were —
// and says something about it.
//
// He stands at TRUE SCALE like everything else on this stage: same ppm, same
// ground line, geometry recomputed each frame (§7). No exception carved out to
// make him read bigger. In an app whose whole claim is that the sizes are honest,
// a tribute that fudged its own numbers would be a poor tribute.
import { el } from "./dom";
import { MIN_GLYPH_PX } from "../config";
import type { Projection } from "../scale";
import type { SpatialMode } from "../app/state";
import type { Item } from "../data/schema";

/**
 * A pose he strikes for a given dinosaur, and what he says while striking it.
 *
 * `heightM` is per-pose and load-bearing: he's drawn to it at the scene's ppm,
 * so a kneeling figure sized as a standing one would be a 1.9 m man on one knee.
 * Sam Neill stood 1.85 m; the top of every cutout is the crown of the hat rather
 * than his head, so upright poses measure a little over that. The kneeling and
 * wide-stance figures are anatomical estimates — he's a guest on the stage, not
 * a measured item, so they're eyeballed rather than sourced.
 *
 * `aspect` is the tight content aspect (w/h), measured when each asset was cut.
 * These are background-removed photos rather than authored SVGs, so load.ts's
 * auto-crop — which walks SVG shapes — can't measure them. Recut the art, remeasure.
 */
interface Pose {
  art: string;
  heightM: number;
  aspect: number;
  lines: string[];
}

const POSES: Record<string, Pose> = {
  // The flare, from the scene where he waves the T-rex off the kids.
  trex: {
    art: "alan-grant-flare.png",
    heightM: 1.9,
    aspect: 0.5554,
    lines: [
      "Don't move! He can't see us if we don't move.",
      "Keep absolutely still. Its vision is based on movement.",
      "T-Rex doesn't want to be fed. He wants to hunt.",
      "I bet you'll never look at birds the same way again.",
    ],
  },
  // Just standing, looking up — there's no other way to play that scene.
  brachiosaurus: {
    art: "alan-grant-standing.png",
    heightM: 1.9,
    aspect: 0.3672,
    lines: [
      "Uh... it's... it's a dinosaur!",
      "They're moving in herds. They do move in herds.",
      "They're not monsters, Lex. They're just animals. And these are herbivores.",
      "Sure. Just think of it as... kind of a big cow.",
    ],
  },
  // Down on one knee, the way he met the sick one.
  triceratops: {
    art: "alan-grant-kneeling.png",
    heightM: 1.3,
    aspect: 0.8053,
    lines: [
      "Ellie, this one was always my favorite when I was a kid. And now I've seen one, it's the most beautiful thing I ever saw.",
    ],
  },
  // Holding one, which is as close as he ever wanted to get.
  velociraptor: {
    art: "alan-grant-raptor.png",
    heightM: 1.82,
    aspect: 0.6734,
    lines: [
      "They were smarter than dolphins or whales. They were smarter than primates.",
      "A six-inch retractable claw, like a razor, on the middle toe.",
      "The point is, you are alive when they start to eat you. So you know, try to show a little respect.",
      "You bred raptors?",
    ],
  },
  // Same pose as the velociraptor: it's the same lecture, and this is the animal
  // it actually fits.
  utahraptor: {
    art: "alan-grant-raptor.png",
    heightM: 1.82,
    aspect: 0.6734,
    lines: [
      "A six-inch retractable claw, like a razor, on the middle toe.",
      "The point is, you are alive when they start to eat you. So you know, try to show a little respect.",
      "He doesn't bother to bite your jugular like a lion, say... no no.",
    ],
  },
  // Crouched behind the log, watching the flock turn.
  gallimimus: {
    art: "alan-grant-kneeling.png",
    heightM: 1.3,
    aspect: 0.8053,
    lines: ["Just like a flock of birds evading a predator."],
  },
};

/** Grant at large — the pool every appearance can fall back on. */
const GENERAL_LINES = [
  "Life found a way.",
  "That's the difference between imagining and seeing: to be able to touch them.",
  "Back then, they hadn't tried to eat me yet.",
  "Some of the worst things imaginable have been done with the best intentions.",
  "I guess we'll just have to evolve too.",
  "I like the abacus, Billy.",
  "Well... that's the important thing.",
];

const MEMORIAL = "Dr. Alan Grant · 1947–2026";
const INTRO_MS = 5000; // the opening bubble hangs around, then gets out of the way

/**
 * The pose for a comparison, or null when he doesn't belong in it — which is
 * also how the stage decides whether to show him at all. With two of his
 * dinosaurs on stage the left one wins; he only gets to stand one way.
 */
function poseFor(items: Item[]): Pose | null {
  for (const item of items) {
    const pose = POSES[item.id];
    if (pose) return pose;
  }
  return null;
}

export class Tribute {
  private root: HTMLElement | null = null;
  private figure!: HTMLElement;
  private quote!: HTMLElement;
  private pose: Pose | null = null;
  private quotes: string[] = [];
  private idx = 0;
  private introTimer = 0;

  /**
   * Build (or tear down) the figure for this comparison. Mounts into the panned
   * scene so he tracks the world, not the viewport.
   *
   * He sits the top view out. Every pose is side-or-front art, and the plan view
   * is the one framing where a standing man is just a hat — there's no honest
   * way to draw him into it.
   */
  setComparison(scene: HTMLElement, items: Item[], mode: SpatialMode) {
    this.destroy();
    if (mode === "top") return;
    const pose = poseFor(items);
    if (!pose) return;

    this.pose = pose;
    this.quotes = [...pose.lines, ...GENERAL_LINES];
    // Open on a line about the dinosaur that's actually on screen; clicking
    // walks on into the general pool.
    this.idx = Math.floor(Math.random() * pose.lines.length);

    this.quote = el("p", {
      class: "tribute__quote",
      text: this.quotes[this.idx],
    });
    const bubble = el("div", { class: "tribute__bubble" }, [
      this.quote,
      el("p", { class: "tribute__memorial", text: MEMORIAL }),
    ]);
    this.figure = el("button", {
      class: "tribute__figure",
      type: "button",
      "aria-label": `${MEMORIAL}. Click for another quote.`,
    });
    this.figure.style.setProperty(
      "--src",
      `url("${import.meta.env.BASE_URL}tribute/${pose.art}")`,
    );

    this.root = el("div", { class: "tribute is-open" }, [bubble, this.figure]);
    scene.appendChild(this.root);

    // A silent amber figure with no affordance would go unnoticed, so the bubble
    // is open on arrival and retreats to hover/click once it's been seen.
    this.introTimer = window.setTimeout(
      () => this.root?.classList.remove("is-open"),
      INTRO_MS,
    );

    this.figure.addEventListener("click", () => this.next());
    // The stage turns any pointerdown into a pan (§7). Without this, clicking him
    // would start a drag and the click would read as the end of a pan gesture.
    this.figure.addEventListener("pointerdown", (e) => e.stopPropagation());
  }

  private next() {
    if (!this.root) return;
    clearTimeout(this.introTimer); // he's clearly been noticed
    this.root.classList.remove("is-open");
    this.idx = (this.idx + 1) % this.quotes.length;
    this.quote.textContent = this.quotes[this.idx];
  }

  /**
   * His footprint for the opening fit (§5), or [] when he isn't here.
   *
   * He has to be in the fit. Left out of it, the frame is sized to the items
   * alone and he simply overflows it: beside a turkey-sized velociraptor a 1.9 m
   * man is the biggest thing on the stage, so he'd hang off the top of the
   * screen and push the other item out of view. Being in the fit costs the
   * comparison a few percent of size and keeps every pairing composed.
   */
  projection(): Projection[] {
    if (!this.pose) return [];
    const { heightM, aspect } = this.pose;
    return [{ along: heightM * aspect, across: heightM, aspect }];
  }

  /**
   * His drawn width at this ppm, or 0 when he isn't on stage — which is also the
   * signal to the caller that he claims no space in the row.
   *
   * Below the glyph floor he's a few pixels of blue and an unreadable bubble,
   * worse than absent. Items degrade to a marker at this size; he just steps
   * out, because a marker would file him as another measured thing on the stage.
   */
  widthAt(ppm: number): number {
    if (!this.pose) return 0;
    const hPx = this.pose.heightM * ppm;
    return hPx < MIN_GLYPH_PX ? 0 : hPx * this.pose.aspect;
  }

  /**
   * Place him on the ground with his left edge at `leftPx` (scene px). Called
   * per frame with the current ppm, so he zooms with everything else.
   */
  layout(ppm: number, leftPx: number, groundY: number) {
    if (!this.root || !this.pose) return;
    const wPx = this.widthAt(ppm);
    this.root.classList.toggle("is-hidden", wPx === 0);
    if (wPx === 0) return;

    const hPx = this.pose.heightM * ppm;
    this.root.style.left = `${leftPx}px`;
    this.root.style.top = `${groundY - hPx}px`;
    this.root.style.width = `${wPx}px`;
    this.root.style.height = `${hPx}px`;
  }

  destroy() {
    clearTimeout(this.introTimer);
    this.root?.remove();
    this.root = null;
    this.pose = null;
  }
}
