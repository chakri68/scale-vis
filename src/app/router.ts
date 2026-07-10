// app/router.ts — hash router; URL <-> comparison (design §12). The URL is the
// source of truth for a comparison, which is what makes it shareable.
//
//   #/                          home
//   #/c/<a>/<b>                 compare a vs b (default mode)
//   #/c/<a>/<b>?m=length|height|weight
import type { Mode } from "./state";

export type Route =
  | { name: "home" }
  | { name: "compare"; a: string; b: string; mode?: Mode };

const MODES: ReadonlySet<string> = new Set(["length", "height", "top", "weight"]);

export function parseHash(hash: string = location.hash): Route {
  const raw = hash.replace(/^#/, "");
  const [path, queryStr] = raw.split("?");
  const parts = path.split("/").filter(Boolean); // ["c", a, b]

  if (parts[0] === "c" && parts[1] && parts[2]) {
    const query = new URLSearchParams(queryStr);
    const m = query.get("m");
    const mode = m && MODES.has(m) ? (m as Mode) : undefined;
    return { name: "compare", a: parts[1], b: parts[2], mode };
  }
  return { name: "home" };
}

export function compareHash(a: string, b: string, mode?: Mode): string {
  const base = `#/c/${a}/${b}`;
  return mode ? `${base}?m=${mode}` : base;
}

/** Navigate, pushing history (a real navigation — pickers, surprise-me). */
export function navigate(hash: string) {
  location.hash = hash;
}

/** Update the URL without a history entry or a remount (mode/anchor toggles). */
export function replace(hash: string) {
  history.replaceState(null, "", hash);
}

export function onRouteChange(cb: (route: Route) => void): () => void {
  const handler = () => cb(parseHash());
  window.addEventListener("hashchange", handler);
  return () => window.removeEventListener("hashchange", handler);
}
