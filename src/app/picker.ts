// app/picker.ts — a searchable dropdown over the inventory, shared by the home
// page and the compare header. Instant substring filter via search.ts.
import { el, clear } from "../render/dom";
import { search, type SearchIndex } from "../data/search";
import type { Item } from "../data/schema";

export interface Picker {
  node: HTMLElement;
  get(): Item | null;
}

export interface PickerOpts {
  placeholder?: string;
  initial?: Item | null;
  // Fired when a row is chosen. Home leaves this off (it batches via Compare);
  // the compare header uses it to navigate immediately.
  onSelect?: (item: Item) => void;
}

export function createPicker(index: SearchIndex, opts: PickerOpts = {}): Picker {
  let selected: Item | null = opts.initial ?? null;

  const input = el("input", {
    type: "text",
    class: "picker__input",
    placeholder: opts.placeholder ?? "search…",
    autocomplete: "off",
    value: selected?.name ?? "",
  }) as HTMLInputElement;

  const list = el("div", { class: "picker__list" });
  const node = el("div", { class: "picker" }, [input, list]);

  // Animated open/close: the list stays in the DOM and fades/rises via the
  // .is-open class (display can't transition), so no layout thrash and a clean
  // 0.14s pop. Stale rows just sit hidden until the next open rebuilds them.
  const openList = () => list.classList.add("is-open");
  const closeList = () => list.classList.remove("is-open");

  const render = () => {
    clear(list);
    const results = search(index, input.value);
    for (const item of results) {
      const row = el("button", { class: "picker__row", type: "button" }, [
        el("span", { class: "picker__name", text: item.name }),
        el("span", { class: "picker__cat", text: item.category }),
      ]);
      row.addEventListener("mousedown", (e) => {
        e.preventDefault(); // select before blur closes the list
        selected = item;
        input.value = item.name;
        closeList();
        opts.onSelect?.(item);
      });
      list.appendChild(row);
    }
    if (results.length > 0) openList();
    else closeList();
  };

  input.addEventListener("focus", () => {
    input.select();
    render();
  });
  input.addEventListener("input", () => {
    selected = null; // typing invalidates a prior pick
    render();
  });
  input.addEventListener("blur", () => setTimeout(closeList, 120));

  return { node, get: () => selected };
}
