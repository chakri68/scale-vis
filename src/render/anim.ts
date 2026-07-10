// render/anim.ts — rAF utilities. CSS does the heavy lifting; this covers what
// CSS can't (number count-up). Honors prefers-reduced-motion.

export const prefersReducedMotion = (): boolean =>
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

/** Format a live number for stat readouts: grouped thousands, trims decimals. */
export function formatCount(n: number): string {
  const rounded = Math.round(n);
  return rounded.toLocaleString("en-US");
}

/**
 * Count a tabular-nums element from `from` to `to` over `ms`. Returns a cancel
 * fn. Reduced motion jumps straight to the final value.
 */
export function countUp(
  elm: HTMLElement,
  from: number,
  to: number,
  ms: number,
  format: (n: number) => string = formatCount,
): () => void {
  if (prefersReducedMotion() || ms <= 0) {
    elm.textContent = format(to);
    return () => {};
  }

  let raf = 0;
  let start = 0;
  let cancelled = false;

  const step = (ts: number) => {
    if (cancelled) return;
    if (!start) start = ts;
    const t = Math.min(1, (ts - start) / ms);
    elm.textContent = format(from + (to - from) * easeOutCubic(t));
    if (t < 1) raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);

  return () => {
    cancelled = true;
    cancelAnimationFrame(raf);
  };
}
