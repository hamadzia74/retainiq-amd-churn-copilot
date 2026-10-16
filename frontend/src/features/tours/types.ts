import type { LucideIcon } from "lucide-react";

export type Placement = "auto" | "top" | "bottom" | "left" | "right";

export interface TourStep {
  title: string;
  /** 1-3 short sentences, written to be read aloud. */
  body: string;
  /** Navigate here first (exact app path). Omit to stay on the current page. */
  route?: string;
  /** Value of the `data-tour` attribute to spotlight. Omit for a centred card. */
  target?: string;
  placement?: Placement;
  /** "target-click": the tour waits for the user to click the highlighted element. */
  advanceOn?: "next" | "target-click";
  /** Short label shown above a click-to-advance target, e.g. "Click to open". */
  callout?: string;
  /** Example text for the target's input, offered via a "Paste example" button. Never submitted. */
  sample?: string;
  /** Show this step only when the feature is switched on (e.g. the mic exists only when voice is available). */
  requires?: "voice";
}

export interface Tour {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  steps?: TourStep[];
  /** A group: shown as an expandable entry in the picker. */
  subTours?: Tour[];
}
