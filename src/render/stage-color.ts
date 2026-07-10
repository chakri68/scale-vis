// render/stage-color.ts — the ONE owner of stage hue assignment (design §14).
// Swap the policy here and the whole app follows; nothing else reads the palette.
import type { Item } from "../data/schema";

const TRACE_VARS = [
  "--trace-1",
  "--trace-2",
  "--trace-3",
  "--trace-4",
  "--trace-5",
  "--trace-6",
] as const;

export interface StageColorCtx {
  role: number; // position in the comparison (0 = A, 1 = B, ...)
}

const CATEGORY_HUE: Record<Item["category"], number> = {
  dinosaur: 0,
  vehicle: 1,
  animal: 2,
  object: 3,
  human: 4,
  structure: 5,
  space: 5,
};

type Policy = "by-role" | "by-category";
let policy: Policy = "by-role"; // best for the 2-item view; ranking view wants by-category

export function setStageColorPolicy(p: Policy) {
  policy = p;
}

/** Returns a CSS var() reference, e.g. "var(--trace-1)". */
export function stageColor(item: Item, ctx: StageColorCtx): string {
  const idx =
    policy === "by-category"
      ? CATEGORY_HUE[item.category]
      : ctx.role % TRACE_VARS.length;
  return `var(${TRACE_VARS[idx]})`;
}
