// data/schema.ts — Item type + runtime validator (design §11).

export type AnchorDim = "length" | "height";

export type Category =
  | "dinosaur"
  | "animal"
  | "vehicle"
  | "object"
  | "human"
  | "structure"
  | "space";

export interface Item {
  id: string;
  name: string;
  category: Category;
  svg: string; // side silhouette, path under public/silhouettes/
  svgTop: string; // top-down (plan) silhouette

  length: number; // meters
  height: number; // meters
  width: number; // meters — the third dimension, used by the top view
  weight?: number; // kg
  weightRange?: [number, number]; // kg — don't fake precision

  anchor?: AnchorDim; // default framing (giraffe -> "height")
  sourceUrl?: string; // cite the number

  aliases: string[];
  description?: string;

  // NOT authored — derived at load by auto-cropping each SVG to its content (§10).
  bboxAspect: number; // side art aspect, measured from the tight content bbox
  topAspect: number; // top art aspect, measured from the tight content bbox
  maskSide: string; // cropped side silhouette as a data: URI, ready for CSS mask
  maskTop: string; // cropped top silhouette as a data: URI
}

// items.json is authored without the derived fields; load.ts fills them in.
export type RawItem = Omit<
  Item,
  "bboxAspect" | "topAspect" | "maskSide" | "maskTop"
>;

const CATEGORIES: ReadonlySet<string> = new Set([
  "dinosaur",
  "animal",
  "vehicle",
  "object",
  "human",
  "structure",
  "space",
]);

/**
 * Hand-rolled runtime validator over a raw record (design §11). Returns the
 * record typed as RawItem or throws with a pointed message — boot-time only,
 * so a bad data entry fails loud instead of rendering a silent lie.
 */
export function validateRawItem(x: unknown, index: number): RawItem {
  const where = `items.json[${index}]`;
  if (typeof x !== "object" || x === null) {
    throw new Error(`${where}: not an object`);
  }
  const r = x as Record<string, unknown>;

  const str = (k: string): string => {
    const v = r[k];
    if (typeof v !== "string" || v.length === 0) {
      throw new Error(`${where}: "${k}" must be a non-empty string`);
    }
    return v;
  };
  const posNum = (k: string): number => {
    const v = r[k];
    if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) {
      throw new Error(`${where}: "${k}" must be a positive number`);
    }
    return v;
  };
  const optPosNum = (k: string): number | undefined => {
    if (r[k] === undefined) return undefined;
    return posNum(k);
  };

  const id = str("id");
  const name = str("name");
  const category = str("category");
  if (!CATEGORIES.has(category)) {
    throw new Error(`${where}: unknown category "${category}"`);
  }
  const svg = str("svg");
  const svgTop = str("svgTop");
  const length = posNum("length");
  const height = posNum("height");
  const width = posNum("width");
  const weight = optPosNum("weight");

  let weightRange: [number, number] | undefined;
  if (r.weightRange !== undefined) {
    const wr = r.weightRange;
    if (
      !Array.isArray(wr) ||
      wr.length !== 2 ||
      typeof wr[0] !== "number" ||
      typeof wr[1] !== "number" ||
      wr[0] <= 0 ||
      wr[1] < wr[0]
    ) {
      throw new Error(`${where}: "weightRange" must be [min, max], 0 < min <= max`);
    }
    weightRange = [wr[0], wr[1]];
  }

  let anchor: AnchorDim | undefined;
  if (r.anchor !== undefined) {
    if (r.anchor !== "length" && r.anchor !== "height") {
      throw new Error(`${where}: "anchor" must be "length" or "height"`);
    }
    anchor = r.anchor;
  }

  const aliases = r.aliases ?? [];
  if (!Array.isArray(aliases) || aliases.some((a) => typeof a !== "string")) {
    throw new Error(`${where}: "aliases" must be a string[]`);
  }

  const sourceUrl = r.sourceUrl === undefined ? undefined : str("sourceUrl");
  const description =
    r.description === undefined ? undefined : str("description");

  return {
    id,
    name,
    category: category as Category,
    svg,
    svgTop,
    length,
    height,
    width,
    weight,
    weightRange,
    anchor,
    sourceUrl,
    aliases: aliases as string[],
    description,
  };
}
