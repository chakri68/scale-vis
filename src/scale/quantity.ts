// scale/quantity.ts — count math + equivalence-unit picking (§9). Weight and
// extreme-ratio length are the SAME renderer, parameterized by metric.
import {
  MAX_EQUIVALENCES,
  NICE_COUNT_MAX,
  NICE_COUNT_MIN,
} from "../config";
import type { Item } from "../data/schema";

export type Metric = "weight" | "length";

// Only the fields count math touches — weight is optional on Item, so callers
// must have already filtered to items that carry the metric.
type Measured = Pick<Item, "id" | "weight" | "length">;

function metricValue(item: Measured, m: Metric): number | undefined {
  return m === "weight" ? item.weight : item.length;
}

/** How many `unit`s equal one `hero`, by metric. Rounded — see §9 honesty note. */
export function count(hero: Measured, unit: Measured, m: Metric): number {
  const h = metricValue(hero, m);
  const u = metricValue(unit, m);
  if (h === undefined || u === undefined || u <= 0) return NaN;
  return Math.round(h / u);
}

export interface Equivalence {
  unit: Item;
  n: number;
}

/**
 * Pick equivalence units whose counts land in a readable range, preferring
 * counts near the middle of the nice range (geometric mean — "middle" on a
 * ratio scale, not an arithmetic one, since counts span orders of magnitude).
 * Never picks the hero itself.
 */
export function pickEquivalenceUnits(
  hero: Item,
  candidates: Item[],
  m: Metric,
): Equivalence[] {
  const heroVal = metricValue(hero, m);
  if (heroVal === undefined) return [];

  const niceMid = Math.sqrt(NICE_COUNT_MIN * NICE_COUNT_MAX);

  return candidates
    .filter((u) => u.id !== hero.id && metricValue(u, m) !== undefined)
    .map((u) => ({ unit: u, n: count(hero, u, m) }))
    .filter(({ n }) => n >= NICE_COUNT_MIN && n <= NICE_COUNT_MAX)
    .sort(
      (a, b) =>
        Math.abs(Math.log(a.n) - Math.log(niceMid)) -
        Math.abs(Math.log(b.n) - Math.log(niceMid)),
    )
    .slice(0, MAX_EQUIVALENCES);
}
