// app/state.ts — shared app-level types (design §12).
//
// The design sketches an observable store here, but a comparison is only ever
// two items (§4), so the compare page just recomputes the scene imperatively on
// each change — no subscriber machinery earns its keep yet. When the ranking
// view (roadmap §20) lands with N items, a real store goes here. For now this
// module owns the one type both the router and the pages share.

// length/height/top are spatial framings; weight switches to the count scene.
// - length: side elevation, primary callout = length (horizontal)
// - height: side elevation, primary callout = height (vertical)
// - top:    plan view (length × width), primary callout = width (vertical)
export type Mode = "length" | "height" | "top" | "weight";
export type SpatialMode = Exclude<Mode, "weight">;
