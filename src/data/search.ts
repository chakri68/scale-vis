// data/search.ts — in-memory autocomplete over name + aliases (design §13).
import type { Item } from "./schema";

export interface SearchIndex {
  byId: Map<string, Item>;
  all: Item[];
}

export function buildIndex(items: Item[]): SearchIndex {
  return { byId: new Map(items.map((i) => [i.id, i])), all: items };
}

/**
 * Instant substring filter over name + aliases, ranked: name-prefix beats
 * name-substring beats alias hit. Empty query returns everything, stable order.
 */
export function search(index: SearchIndex, query: string, limit = 8): Item[] {
  const q = query.trim().toLowerCase();
  if (!q) return index.all.slice(0, limit);

  const scored: { item: Item; score: number }[] = [];
  for (const item of index.all) {
    const name = item.name.toLowerCase();
    let score = -1;
    if (name.startsWith(q)) score = 3;
    else if (name.includes(q)) score = 2;
    else if (item.aliases.some((a) => a.toLowerCase().includes(q))) score = 1;
    if (score >= 0) scored.push({ item, score });
  }
  scored.sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name));
  return scored.slice(0, limit).map((s) => s.item);
}
