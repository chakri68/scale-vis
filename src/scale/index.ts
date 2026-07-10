// scale/ — PURE. No DOM, no framework, imports nothing but config (+ type-only
// shapes from schema, which erase at build). The entire correctness story lives
// here and is trivially unit-testable — that's the point.
export * from "./ppm";
export * from "./render-state";
export * from "./camera";
export * from "./quantity";
