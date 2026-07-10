// main.ts — entry: mount app, start router (design §3).
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/home.css";
import "./styles/compare.css";

import { loadItems } from "./data/load";
import { buildIndex } from "./data/search";
import { onRouteChange, parseHash, navigate } from "./app/router";
import { mountHome, type Page } from "./app/pages/home";
import { mountCompare } from "./app/pages/compare";

const root = document.getElementById("app")!;

async function boot() {
  const items = await loadItems();
  const index = buildIndex(items);

  let current: Page | null = null;

  const renderRoute = () => {
    const route = parseHash();
    current?.destroy();
    current = null;

    if (route.name === "compare") {
      const a = index.byId.get(route.a);
      const b = index.byId.get(route.b);
      if (!a || !b) {
        navigate("#/");
        return;
      }
      current = mountCompare(root, a, b, route.mode, index);
    } else {
      current = mountHome(root, index);
    }
  };

  onRouteChange(renderRoute);
  renderRoute();

  // Reveal only once the pixel font is in — never flash a fallback (§15).
  try {
    await document.fonts.ready;
  } catch {
    /* fonts API unavailable — reveal anyway */
  }
  document.body.classList.remove("booting");
  document.body.classList.add("booted");
}

boot().catch((err) => {
  console.error(err);
  root.innerHTML = `<pre class="fatal">boot failed:\n${String(err)}</pre>`;
  document.body.classList.remove("booting");
});
