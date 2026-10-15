// Where the step card goes. Pure maths, no DOM - unit-tested in placement.test.ts.
import type { Placement } from "./types";

export interface Rect { top: number; left: number; width: number; height: number }
export interface Size { width: number; height: number }
export type Side = "top" | "bottom" | "left" | "right";

export type CardLayout =
  | { mode: "sheet" }                                           // phones: full-width bottom sheet
  | { mode: "center" }                                          // no target: centred card
  | { mode: "anchored"; top: number; left: number; side: Side };

export const SHEET_BREAKPOINT = 640;
export const MARGIN = 12;   // min distance from the viewport edge
export const GAP = 14;      // distance from the highlighted target

const OPPOSITE: Record<Side, Side> = { top: "bottom", bottom: "top", left: "right", right: "left" };
const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), Math.max(min, max));

function position(side: Side, t: Rect, card: Size) {
  switch (side) {
    case "bottom": return { top: t.top + t.height + GAP, left: t.left + t.width / 2 - card.width / 2 };
    case "top": return { top: t.top - GAP - card.height, left: t.left + t.width / 2 - card.width / 2 };
    case "right": return { top: t.top + t.height / 2 - card.height / 2, left: t.left + t.width + GAP };
    case "left": return { top: t.top + t.height / 2 - card.height / 2, left: t.left - GAP - card.width };
  }
}

/** Room on each side of the target, i.e. whether the card fits there without leaving the viewport. */
function room(side: Side, t: Rect, card: Size, vp: Size): number {
  switch (side) {
    case "bottom": return vp.height - MARGIN - (t.top + t.height + GAP) - card.height;
    case "top": return t.top - GAP - MARGIN - card.height;
    case "right": return vp.width - MARGIN - (t.left + t.width + GAP) - card.width;
    case "left": return t.left - GAP - MARGIN - card.width;
  }
}

export function placeCard(target: Rect | null, card: Size, vp: Size, preferred: Placement = "auto"): CardLayout {
  if (vp.width < SHEET_BREAKPOINT) return { mode: "sheet" };
  if (!target) return { mode: "center" };

  const order: Side[] = preferred === "auto"
    ? ["bottom", "top", "right", "left"]
    : [preferred, OPPOSITE[preferred], ...(["bottom", "top", "right", "left"] as Side[]).filter((s) => s !== preferred && s !== OPPOSITE[preferred])];

  // First side where it fits; otherwise the side with the most room (it will be clamped on screen).
  const side = order.find((s) => room(s, target, card, vp) >= 0)
    ?? order.reduce((best, s) => (room(s, target, card, vp) > room(best, target, card, vp) ? s : best));

  const p = position(side, target, card);
  return {
    mode: "anchored",
    side,
    top: clamp(p.top, MARGIN, vp.height - card.height - MARGIN),
    left: clamp(p.left, MARGIN, vp.width - card.width - MARGIN),
  };
}
