import { describe, it, expect } from "vitest";
import { clampZoom, shouldSuggestCount, minZoom, maxZoom } from "../../src/scale/camera";

describe("clampZoom", () => {
  it("holds the whole larger object on screen (no zooming into void)", () => {
    expect(clampZoom(0.2)).toBe(minZoom);
  });
  it("caps at the usability ceiling", () => {
    expect(clampZoom(9999)).toBe(maxZoom);
  });
  it("passes through in-range values", () => {
    expect(clampZoom(5)).toBe(5);
  });
});

describe("shouldSuggestCount", () => {
  const trex = { length: 12 };
  const human = { length: 0.5 };
  const bacterium = { length: 0.000002 };

  it("stays quiet for a comfortable length ratio", () => {
    expect(shouldSuggestCount([trex, human])).toBe(false);
  });
  it("fires for an extreme length ratio", () => {
    expect(shouldSuggestCount([trex, bacterium])).toBe(true);
  });
  it("needs two items", () => {
    expect(shouldSuggestCount([trex])).toBe(false);
  });
});
