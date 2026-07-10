// app/pages/home.ts — pickers, popular, surprise-me (design §13).
import { el, clear } from "../../render/dom";
import type { SearchIndex } from "../../data/search";
import { createPicker } from "../picker";
import { compareHash, navigate } from "../router";

export interface Page {
  destroy(): void;
}

const POPULAR: [string, string][] = [
  ["trex", "human"],
  ["triceratops", "bus"],
  ["argentinosaurus", "blue-whale"],
  ["velociraptor", "chicken"],
];

export function mountHome(root: HTMLElement, index: SearchIndex): Page {
  clear(root);

  const a = createPicker(index, { placeholder: "e.g. T-Rex" });
  const b = createPicker(index, { placeholder: "e.g. Human" });

  const compareBtn = el("button", {
    class: "btn primary",
    type: "button",
    text: "Compare",
  });
  compareBtn.addEventListener("click", () => {
    const ia = a.get();
    const ib = b.get();
    if (ia && ib) navigate(compareHash(ia.id, ib.id));
  });

  const popular = el("div", { class: "home__popular" }, [
    el("span", { class: "home__popular-label", text: "Popular:" }),
  ]);
  for (const [x, y] of POPULAR) {
    const ix = index.byId.get(x);
    const iy = index.byId.get(y);
    if (!ix || !iy) continue;
    const link = el("a", {
      class: "home__popular-link",
      href: compareHash(x, y),
      text: `${ix.name} vs ${iy.name}`,
    });
    popular.appendChild(link);
  }

  const surprise = el("button", {
    class: "btn home__surprise",
    type: "button",
    text: "🎲 Surprise Me",
  });
  surprise.addEventListener("click", () => {
    const all = index.all;
    const i = Math.floor(Math.random() * all.length);
    let j = Math.floor(Math.random() * all.length);
    while (j === i) j = Math.floor(Math.random() * all.length);
    navigate(compareHash(all[i].id, all[j].id));
  });

  const page = el("div", { class: "home" }, [
    el("h1", { class: "home__title", text: "SCALE-VIS" }),
    el("p", {
      class: "home__tagline",
      text: "Compare anything… to anything.",
    }),
    el("div", { class: "home__pickers" }, [
      a.node,
      el("span", { class: "home__vs", text: "vs" }),
      b.node,
      compareBtn,
    ]),
    popular,
    surprise,
  ]);

  root.appendChild(page);
  return { destroy: () => clear(root) };
}
