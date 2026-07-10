import { describe, it, expect } from "vitest";
import { computeRenderState, markerLabel } from "../../src/scale/render-state";
import type { Projection } from "../../src/scale/ppm";
import { MIN_GLYPH_PX } from "../../src/config";

// aspect = along/across. A T-rex side view is wide: 3.0. A human is tall: 0.28.
const trex: Projection = { along: 12, across: 4, aspect: 3.0 };
const human: Projection = { along: 0.5, across: 1.8, aspect: 0.28 };
// A top-view projection uses width as `across` with the top-art aspect.
const trexTop: Projection = { along: 12, across: 1.5, aspect: 8.0 };

const meta = (name: string, primaryMeters: number) => ({ name, primaryMeters });

describe("computeRenderState", () => {
  it("drawn width = along·ppm; height follows the ART aspect, never a data field", () => {
    const rs = computeRenderState(trex, 10, meta("T-rex", 12));
    expect(rs.wPx).toBeCloseTo(120); // 12 * 10
    expect(rs.hPx).toBeCloseTo(120 / 3.0); // width / aspect
  });

  it("same renderer serves the top view — just a different projection", () => {
    const rs = computeRenderState(trexTop, 10, meta("T-rex", 1.5));
    expect(rs.wPx).toBeCloseTo(120); // 12 * 10 (still length along)
    expect(rs.hPx).toBeCloseTo(120 / 8.0); // narrower: width across
  });

  it("becomes a marker below the glyph floor, labelled with the primary dim", () => {
    const rs = computeRenderState(human, 1, meta("Human", 1.8));
    expect(rs.kind).toBe("marker");
    if (rs.kind === "marker") expect(rs.label).toBe("Human · 1.8 m");
  });

  it("hatches to silhouette exactly at the floor", () => {
    const ppm = (MIN_GLYPH_PX + 1) / trex.along; // width is the larger dim
    const rs = computeRenderState(trex, ppm, meta("T-rex", 12));
    expect(rs.kind).toBe("silhouette");
  });

  it("marker still carries true wPx/hPx so the foot stays honest", () => {
    const rs = computeRenderState(human, 1, meta("Human", 1.8));
    expect(rs.wPx).toBeCloseTo(0.5);
    expect(rs.hPx).toBeGreaterThan(0);
  });
});

describe("markerLabel", () => {
  it("labels name + the primary dimension", () => {
    expect(markerLabel(meta("Human", 1.8))).toBe("Human · 1.8 m");
    expect(markerLabel(meta("T-rex", 12))).toBe("T-rex · 12 m");
  });
});
