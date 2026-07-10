import { describe, it, expect } from "vitest";
import { basePPM, effectivePPM, type Projection } from "../../src/scale/ppm";
import { FIT_FRACTION, ITEM_GAP } from "../../src/config";

// Projections (along, across, aspect). aspect = along/across.
const trex: Projection = { along: 12, across: 4, aspect: 3 };
const human: Projection = { along: 0.5, across: 1.8, aspect: 0.5 / 1.8 };
const bus: Projection = { along: 11, across: 4.4, aspect: 2.5 }; // long + low

const drawnW = (ps: Projection[], ppm: number) =>
  ppm * ps.reduce((s, p) => s + p.along, 0) + (ps.length - 1) * ITEM_GAP;
const drawnH = (ps: Projection[], ppm: number) =>
  ppm * Math.max(...ps.map((p) => p.across));

describe("basePPM", () => {
  it("frames a wide composition to the width axis without overflow", () => {
    const vp = { w: 1000, h: 600 };
    const ppm = basePPM([trex, human], vp);
    expect(drawnW([trex, human], ppm)).toBeCloseTo(vp.w * FIT_FRACTION, 5);
    expect(drawnH([trex, human], ppm)).toBeLessThanOrEqual(vp.h * FIT_FRACTION + 1e-6);
  });

  it("frames a tall, narrow composition to the height axis", () => {
    const vp = { w: 1000, h: 600 };
    const ppm = basePPM([human, human], vp);
    expect(drawnH([human], ppm)).toBeCloseTo(vp.h * FIT_FRACTION, 5);
  });

  it("NEVER overflows either axis, whatever the shape (the bus regression)", () => {
    const vp = { w: 1000, h: 600 };
    for (const pair of [[trex, human], [bus, human], [human, human], [bus, trex]]) {
      const ppm = basePPM(pair, vp);
      expect(drawnW(pair, ppm)).toBeLessThanOrEqual(vp.w * FIT_FRACTION + 1e-6);
      expect(drawnH(pair, ppm)).toBeLessThanOrEqual(vp.h * FIT_FRACTION + 1e-6);
    }
  });

  it("single item, no gaps, still fits both axes", () => {
    const vp = { w: 1000, h: 600 };
    const ppm = basePPM([trex], vp);
    expect(drawnW([trex], ppm)).toBeLessThanOrEqual(vp.w * FIT_FRACTION + 1e-6);
    expect(drawnH([trex], ppm)).toBeLessThanOrEqual(vp.h * FIT_FRACTION + 1e-6);
  });

  it("never returns a non-positive ppm even in a degenerate viewport", () => {
    expect(basePPM([trex, human], { w: 10, h: 10 })).toBeGreaterThan(0);
  });

  it("empty input is safe", () => {
    expect(basePPM([], { w: 1000, h: 600 })).toBe(1);
  });
});

describe("effectivePPM", () => {
  it("scales base by zoom", () => {
    expect(effectivePPM(10, 1)).toBe(10);
    expect(effectivePPM(10, 3.5)).toBe(35);
  });
});
