// render/dom.ts — tiny el()/svg() helpers (createElement(NS) under the hood).
// Views keep references to created nodes and MUTATE attributes on update rather
// than re-creating — required for CSS transitions to fire and for smooth zoom.

const SVG_NS = "http://www.w3.org/2000/svg";

type Attrs = Record<string, string | number | boolean | null | undefined>;
type Child = Node | string;

function applyAttrs(node: Element, attrs?: Attrs) {
  if (!attrs) return;
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") node.setAttribute("class", String(v));
    else if (k === "text") node.textContent = String(v);
    else node.setAttribute(k, v === true ? "" : String(v));
  }
}

function append(node: Node, children?: Child[]) {
  if (!children) return;
  for (const c of children) {
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
}

/** HTML element. `attrs.class`/`attrs.text` are special-cased; rest are attributes. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Attrs,
  children?: Child[],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  applyAttrs(node, attrs);
  append(node, children);
  return node;
}

/** SVG element (namespaced). Same signature as el(). */
export function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs?: Attrs,
  children?: Child[],
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  applyAttrs(node, attrs);
  append(node, children);
  return node;
}

/** Set several SVG/HTML attributes at once (per-frame mutation path). */
export function setAttrs(node: Element, attrs: Attrs) {
  applyAttrs(node, attrs);
}

/** Remove every child of a node. */
export function clear(node: Node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}
