import { describe, expect, it } from "vitest";
import { MARGIN, placeCard, SHEET_BREAKPOINT } from "./placement";

const vp = { width: 1280, height: 800 };
const card = { width: 340, height: 220 };

function onScreen(l: ReturnType<typeof placeCard>, size = card, viewport = vp) {
  if (l.mode !== "anchored") throw new Error("expected anchored");
  expect(l.top).toBeGreaterThanOrEqual(MARGIN);
  expect(l.left).toBeGreaterThanOrEqual(MARGIN);
  expect(l.top + size.height).toBeLessThanOrEqual(viewport.height - MARGIN);
  expect(l.left + size.width).toBeLessThanOrEqual(viewport.width - MARGIN);
}

describe("placeCard", () => {
  it("uses a bottom sheet on phones", () => {
    expect(placeCard({ top: 100, left: 10, width: 100, height: 40 }, card, { width: SHEET_BREAKPOINT - 1, height: 800 })).toEqual({ mode: "sheet" });
  });

  it("centres the card when there is no target", () => {
    expect(placeCard(null, card, vp)).toEqual({ mode: "center" });
  });

  it("goes below the target when there is room", () => {
    const l = placeCard({ top: 100, left: 500, width: 200, height: 50 }, card, vp);
    expect(l).toMatchObject({ mode: "anchored", side: "bottom" });
    onScreen(l);
  });

  it("flips above when the target is near the bottom", () => {
    const l = placeCard({ top: 700, left: 500, width: 200, height: 50 }, card, vp);
    expect(l).toMatchObject({ side: "top" });
    onScreen(l);
  });

  it("goes beside a target too tall for above/below", () => {
    const l = placeCard({ top: 40, left: 100, width: 300, height: 720 }, card, vp);
    expect(l).toMatchObject({ side: "right" });
    onScreen(l);
  });

  it("honours a preferred side and its opposite", () => {
    expect(placeCard({ top: 300, left: 500, width: 100, height: 50 }, card, vp, "left")).toMatchObject({ side: "left" });
    expect(placeCard({ top: 300, left: 20, width: 100, height: 50 }, card, vp, "left")).toMatchObject({ side: "right" });
  });

  it("stays on screen even when nothing fits, e.g. a target covering the viewport", () => {
    onScreen(placeCard({ top: 0, left: 0, width: 1280, height: 800 }, card, vp));
  });

  it("clamps horizontally for targets at the edge", () => {
    const l = placeCard({ top: 100, left: 1250, width: 20, height: 20 }, card, vp);
    onScreen(l);
  });
});
