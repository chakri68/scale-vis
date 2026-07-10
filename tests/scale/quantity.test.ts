import { describe, it, expect } from "vitest";
import { count, pickEquivalenceUnits } from "../../src/scale/quantity";
import type { Item } from "../../src/data/schema";

const item = (o: Partial<Item> & Pick<Item, "id">): Item => ({
  name: o.id,
  category: "object",
  svg: "",
  svgTop: "",
  length: 1,
  height: 1,
  width: 1,
  aliases: [],
  bboxAspect: 1,
  topAspect: 1,
  maskSide: "",
  maskTop: "",
  ...o,
});

const trex = item({ id: "trex", weight: 8000, length: 12 });
const dumbbell = item({ id: "dumbbell", weight: 5 });
const fridge = item({ id: "fridge", weight: 140 });
const corolla = item({ id: "corolla", weight: 1300 });
const feather = item({ id: "feather", weight: 0.01 }); // count would blow past NICE_COUNT_MAX

describe("count", () => {
  it("rounds hero/unit by metric", () => {
    expect(count(trex, dumbbell, "weight")).toBe(1600);
    expect(count(trex, fridge, "weight")).toBe(57);
  });
  it("is NaN when a metric is missing", () => {
    const noWeight = item({ id: "x" });
    // @ts-expect-error deliberately drop weight
    noWeight.weight = undefined;
    expect(Number.isNaN(count(trex, noWeight, "weight"))).toBe(true);
  });
});

describe("pickEquivalenceUnits", () => {
  it("keeps only counts inside the nice range and never the hero itself", () => {
    const picks = pickEquivalenceUnits(
      trex,
      [trex, dumbbell, fridge, corolla, feather],
      "weight",
    );
    const ids = picks.map((p) => p.unit.id);
    expect(ids).not.toContain("trex"); // never itself
    expect(ids).not.toContain("feather"); // 800k copies — past NICE_COUNT_MAX
    expect(ids).toContain("dumbbell");
    expect(ids).toContain("fridge");
  });

  it("prefers counts near the geometric middle of the nice range", () => {
    const picks = pickEquivalenceUnits(
      trex,
      [dumbbell, fridge, corolla],
      "weight",
    );
    // corolla: 6 (near NICE_COUNT_MIN), fridge: 57 (near sqrt(5*2000)≈100), dumbbell: 1600
    // fridge should rank first — closest to the geometric mid.
    expect(picks[0].unit.id).toBe("fridge");
  });
});
