// app/pages/compare.ts — stage + stat panels + controls (design §13).
// Maps onto the house-theme layout: stage as the inset CRT screen (main), a
// fixed 380px right sidebar, and a bottom control bar.
import { el, clear } from "../../render/dom";
import { SpatialStage } from "../../render/SpatialStage";
import { QuantityStage } from "../../render/QuantityStage";
import { stageColor } from "../../render/stage-color";
import { countUp, formatCount } from "../../render/anim";
import {
  shouldSuggestCount,
  count,
  pickEquivalenceUnits,
  type Metric,
} from "../../scale";
import type { SearchIndex } from "../../data/search";
import { createPicker } from "../picker";
import { downloadCard, type CardInput } from "../../render/export-card";
import { compareHash, navigate, replace } from "../router";
import type { Mode, SpatialMode } from "../state";
import type { Item } from "../../data/schema";
import type { Page } from "./home";

/** Default framing (§7): the larger item's anchor field, else its bigger dim. */
export function defaultMode(a: Item, b: Item): Mode {
  const larger = maxExtent(a) >= maxExtent(b) ? a : b;
  return larger.anchor ?? (larger.length >= larger.height ? "length" : "height");
}
const maxExtent = (i: Item) => Math.max(i.length, i.height);

const fmtM = (m: number) => (m >= 10 ? m.toFixed(0) : m.toFixed(m < 1 ? 2 : 1));
const fmtKg = (kg: number) =>
  kg >= 1000
    ? `${(kg / 1000).toLocaleString("en-US", { maximumFractionDigits: 1 })} t`
    : `${kg.toLocaleString("en-US")} kg`;
const fixed = (x: number, decimals: number) =>
  x.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

export function mountCompare(
  root: HTMLElement,
  a: Item,
  b: Item,
  initialMode: Mode | undefined,
  index: SearchIndex,
): Page {
  clear(root);
  let mode: Mode = initialMode ?? defaultMode(a, b);
  // Transient: extreme-length count-by-length view, not persisted to the URL.
  let countByLength = false;

  const stageHost = el("div", { class: "compare__stage" });
  const sidebar = el("aside", { class: "sidebar" });
  const controlbar = el("div", { class: "controlbar" });

  // Header pickers: change either side in place. Selecting navigates to the new
  // pair (preserving the current mode), which the router remounts. The onSelect
  // closures read the live `mode`, so a mid-session mode toggle is carried over.
  const pickerA = createPicker(index, {
    initial: a,
    onSelect: (item) => navigate(compareHash(item.id, b.id, mode)),
  });
  const pickerB = createPicker(index, {
    initial: b,
    onSelect: (item) => navigate(compareHash(a.id, item.id, mode)),
  });
  const swapBtn = el("button", {
    class: "icon-btn",
    type: "button",
    title: "swap sides",
    text: "⇄",
  });
  swapBtn.addEventListener("click", () =>
    navigate(compareHash(b.id, a.id, mode)),
  );
  const homeLink = el("a", {
    class: "compare__home",
    href: "#/",
    title: "home",
    text: "SCALE-VIS",
  });
  const header = el("div", { class: "compare__header" }, [
    homeLink,
    el("div", { class: "compare__pickers" }, [
      pickerA.node,
      swapBtn,
      pickerB.node,
    ]),
  ]);

  const shell = el("div", { class: "compare" }, [
    el("div", { class: "compare__body" }, [
      el("div", { class: "compare__main" }, [header, stageHost]),
      sidebar,
    ]),
    controlbar,
  ]);
  root.appendChild(shell);

  let spatial: SpatialStage | null = null;
  let quantity: QuantityStage | null = null;
  const cancels: Array<() => void> = [];

  const teardownStages = () => {
    spatial?.destroy();
    quantity?.destroy();
    spatial = null;
    quantity = null;
    clear(stageHost);
  };

  const isCountScene = () => mode === "weight" || countByLength;
  const countMetric = (): Metric => (mode === "weight" ? "weight" : "length");

  /** Hero = larger by the active metric; unit = the other. */
  const heroUnit = (metric: Metric): [Item, Item] => {
    const va = metric === "weight" ? a.weight ?? 0 : a.length;
    const vb = metric === "weight" ? b.weight ?? 0 : b.length;
    return va >= vb ? [a, b] : [b, a];
  };

  const renderStage = () => {
    teardownStages();
    if (isCountScene()) {
      quantity = new QuantityStage();
      quantity.mount(stageHost);
      const metric = countMetric();
      const [hero, unit] = heroUnit(metric);
      quantity.setComparison(hero, unit, count(hero, unit, metric));
    } else {
      spatial = new SpatialStage();
      spatial.mount(stageHost);
      spatial.setComparison([a, b], mode as SpatialMode);
    }
  };

  // --- Bottom control bar ---
  const modeChips = (["length", "height", "top", "weight"] as Mode[]).map((m) => {
    const chip = el("button", {
      class: "chip",
      type: "button",
      "data-mode": m,
      text: m[0].toUpperCase() + m.slice(1),
    });
    chip.addEventListener("click", () => setMode(m));
    return chip;
  });

  const cameraCtl = el("div", { class: "controlbar__camera" }, [
    iconBtn("−", "zoom out", () => spatial && wheelZoom(-1)),
    iconBtn("+", "zoom in", () => spatial && wheelZoom(1)),
    iconBtn("⟲", "reset", () => spatial?.resetCamera()),
  ]);

  const stats = el("div", { class: "controlbar__stats" });

  // Export the current comparison as a shareable PNG card. Reconstructs the
  // scene on a canvas (see export-card.ts) from whichever scene is live.
  const buildCardInput = (): CardInput => {
    if (isCountScene()) {
      const metric = countMetric();
      const [hero, unit] = heroUnit(metric);
      return { scene: "count", hero, unit, metric, n: count(hero, unit, metric) };
    }
    return { scene: "spatial", a, b, mode: mode as SpatialMode };
  };
  const exportLabel = el("span", { text: "PNG" });
  const exportBtn = el("button", {
    class: "controlbar__export",
    type: "button",
    title: "download a shareable PNG card",
  }, [el("span", { class: "controlbar__export-icon", text: "⤓" }), exportLabel]);
  exportBtn.addEventListener("click", async () => {
    if (exportBtn.hasAttribute("disabled")) return;
    exportBtn.setAttribute("disabled", "");
    exportLabel.textContent = "…";
    try {
      await downloadCard(buildCardInput());
    } catch (err) {
      console.error("[export] card render failed", err);
      exportLabel.textContent = "failed";
      setTimeout(() => (exportLabel.textContent = "PNG"), 1500);
      exportBtn.removeAttribute("disabled");
      return;
    }
    exportLabel.textContent = "PNG";
    exportBtn.removeAttribute("disabled");
  });

  // Copy the current comparison link. The URL is the shareable source of truth
  // (§12), so location.href already carries the pair + mode.
  const shareLabel = el("span", { text: "Share" });
  const shareBtn = el("button", {
    class: "controlbar__action",
    type: "button",
    title: "copy link to this comparison",
    // U+2197 + U+FE0E: force TEXT presentation so it renders as a thin terminal
    // glyph, never a color emoji (matches the ⇄ / ⟲ / ⤓ symbols already in use).
  }, [el("span", { class: "controlbar__action-icon", text: "↗︎" }), shareLabel]);
  let shareResetTimer = 0;
  const flashShare = (text: string, ok: boolean) => {
    shareLabel.textContent = text;
    shareBtn.classList.toggle("is-ok", ok);
    clearTimeout(shareResetTimer);
    shareResetTimer = window.setTimeout(() => {
      shareLabel.textContent = "Share";
      shareBtn.classList.remove("is-ok");
    }, 1500);
  };
  shareBtn.addEventListener("click", async () => {
    const url = location.href;
    const data = { title: `Scale-Vis — ${a.name} vs ${b.name}`, url };
    // Native share sheet where the platform has one (mobile, Safari, Edge).
    // Feature-detect; a user-cancelled sheet throws AbortError and is a no-op,
    // not a failure. Anything else falls through to copying the link.
    if (navigator.share && (!navigator.canShare || navigator.canShare(data))) {
      try {
        await navigator.share(data);
        return;
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;
      }
    }
    const ok = await copyText(url);
    flashShare(ok ? "Copied!" : "Copy failed", ok);
  });

  controlbar.append(
    el("div", { class: "controlbar__group" }, [
      ...modeChips,
      cameraCtl,
      shareBtn,
      exportBtn,
    ]),
    stats,
  );

  const wheelZoom = (dir: number) => {
    // Reuse the stage's own clamp by dispatching a synthetic wheel.
    stageHost.dispatchEvent(
      new WheelEvent("wheel", { deltaY: dir * -120, bubbles: true }),
    );
  };

  const syncChips = () => {
    for (const chip of modeChips) {
      chip.classList.toggle("on", chip.dataset.mode === mode && !countByLength);
    }
    cameraCtl.style.display = isCountScene() ? "none" : "";
  };

  const setMode = (m: Mode) => {
    mode = m;
    countByLength = false;
    replace(compareHash(a.id, b.id, mode));
    renderStage();
    syncChips();
    renderSidebar();
  };

  // --- Stats cluster: each item's numbers tinted to its trace hue ---
  const buildStats = () => {
    clear(stats);
    [a, b].forEach((item, role) => {
      const hue = stageColor(item, { role });
      const row = el("div", { class: "stat", style: `--hue:${hue}` }, [
        el("span", { class: "stat__name", text: item.name }),
        statNum(`${fmtM(item.length)} m`, "L"),
        statNum(`${fmtM(item.height)} m`, "H"),
        item.weight ? statNum(fmtKg(item.weight), "W") : el("span"),
      ]);
      stats.appendChild(row);
    });
    // count-up the primary number per row on load, preserving its precision
    // (formatCount rounds — fine for whole counts, wrong for 0.50 m / 1.3 t).
    stats.querySelectorAll<HTMLElement>(".stat__num-value").forEach((n) => {
      const to = parseFloat(n.dataset.to ?? "0");
      const decimals = Number(n.dataset.decimals ?? "0");
      const suffix = n.dataset.suffix ?? "";
      if (Number.isFinite(to)) {
        cancels.push(countUp(n, 0, to, 600, (x) => `${fixed(x, decimals)}${suffix}`));
      }
    });
  };

  // --- Sidebar: per-item info panels + count equivalents ---
  const renderSidebar = () => {
    clear(sidebar);

    // Extreme-ratio CTA (§8): linear stays available; count is an escape hatch.
    if (!isCountScene() && shouldSuggestCount([a, b])) {
      const cta = el("button", {
        class: "sidebar__cta",
        type: "button",
        text: "This ratio is extreme → switch to count view",
      });
      cta.addEventListener("click", () => {
        countByLength = true;
        renderStage();
        syncChips();
        renderSidebar();
      });
      sidebar.appendChild(cta);
    }

    if (isCountScene()) {
      const metric = countMetric();
      const [hero] = heroUnit(metric);
      const eqs = pickEquivalenceUnits(hero, index.all, metric);
      const panel = infoPanel(`${hero.name} — measured in`);
      for (const { unit, n } of eqs) {
        panel.body.appendChild(
          el("div", { class: "equiv" }, [
            el("span", { class: "equiv__n", text: `${formatCount(n)} ×` }),
            el("span", { class: "equiv__unit", text: unit.name }),
          ]),
        );
      }
      if (metric === "weight" && hero.weightRange) {
        panel.body.appendChild(
          el("div", {
            class: "equiv__note",
            text: `Weight is a range: ${fmtKg(hero.weightRange[0])}–${fmtKg(hero.weightRange[1])}. Counts use ${fmtKg(hero.weight!)}.`,
          }),
        );
      }
      sidebar.appendChild(panel.root);
    }

    [a, b].forEach((item, role) => {
      const hue = stageColor(item, { role });
      const panel = infoPanel(item.name, hue);
      const facts: [string, string][] = [
        ["length", `${fmtM(item.length)} m`],
        ["height", `${fmtM(item.height)} m`],
        ["width", `${fmtM(item.width)} m`],
      ];
      if (item.weight) facts.push(["weight", fmtKg(item.weight)]);
      if (item.weightRange)
        facts.push([
          "range",
          `${fmtKg(item.weightRange[0])}–${fmtKg(item.weightRange[1])}`,
        ]);
      facts.push(["category", item.category]);
      for (const [k, v] of facts) {
        panel.body.appendChild(
          el("div", { class: "fact" }, [
            el("span", { class: "fact__k", text: k }),
            el("span", { class: "fact__v", text: v }),
          ]),
        );
      }
      if (item.description)
        panel.body.appendChild(
          el("div", { class: "fact__desc", text: item.description }),
        );
      if (item.sourceUrl)
        panel.body.appendChild(
          el("a", {
            class: "fact__src",
            href: item.sourceUrl,
            target: "_blank",
            rel: "noopener",
            text: "source →",
          }),
        );
      sidebar.appendChild(panel.root);
    });
  };

  // initial paint
  renderStage();
  buildStats();
  syncChips();
  renderSidebar();

  return {
    destroy: () => {
      cancels.forEach((c) => c());
      teardownStages();
      clear(root);
    },
  };
}

// --- small view helpers ---

function statNum(text: string, tag: string): HTMLElement {
  const num = text.match(/[\d,.]+/)?.[0] ?? text;
  const suffix = text.slice(num.length);
  const bare = num.replace(/,/g, "");
  const decimals = bare.split(".")[1]?.length ?? 0;
  const value = el("span", {
    class: "stat__num-value",
    "data-to": bare,
    "data-decimals": String(decimals),
    "data-suffix": suffix,
    text: "0",
  });
  return el("span", { class: "stat__num" }, [
    el("span", { class: "stat__tag", text: tag }),
    value,
  ]);
}

/** Copy text to the clipboard, falling back to a hidden-textarea execCommand
 *  when the async Clipboard API is unavailable (insecure origin, older engine).
 *  Returns whether the copy landed. */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;top:-9999px;opacity:0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

function iconBtn(glyph: string, title: string, onClick: () => void): HTMLElement {
  const b = el("button", { class: "icon-btn", type: "button", title, text: glyph });
  b.addEventListener("click", onClick);
  return b;
}

function infoPanel(
  title: string,
  hue?: string,
): { root: HTMLElement; body: HTMLElement } {
  const body = el("div", { class: "panel__body" });
  const head = el("h2", { class: "panel__head", text: title });
  const root = el("div", { class: "panel", style: hue ? `--hue:${hue}` : "" }, [
    head,
    body,
  ]);
  head.addEventListener("click", () => root.classList.toggle("collapsed"));
  return { root, body };
}
