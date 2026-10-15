import { useEffect, useState } from "react";
import type { Rect } from "./placement";

export type TargetStatus = "none" | "waiting" | "found" | "missing";

const POLL_MS = 100;
const GIVE_UP_MS = 3000;

const isVisible = (el: Element) => {
  const r = el.getBoundingClientRect();
  return el.getClientRects().length > 0 && r.width > 0 && r.height > 0;
};

/** The first visible element with this `data-tour` value (desktop and mobile markup may both carry it). */
export function findTarget(name: string): { element: HTMLElement | null; exists: boolean } {
  const all = [...document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`)];
  return { element: all.find(isVisible) ?? null, exists: all.length > 0 };
}

const same = (a: Rect | null, b: DOMRect) =>
  !!a && Math.abs(a.top - b.top) < 0.5 && Math.abs(a.left - b.left) < 0.5 &&
  Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5;

/**
 * Finds a tour target, waits for it to render (route changes, lazy pages), scrolls it into
 * view and tracks its position every frame (scroll, resize, layout shifts).
 * `missing` = not rendered in time, or rendered but hidden at this screen size.
 */
export function useTargetRect(target: string | undefined, resetKey: string) {
  const [state, setState] = useState<{ rect: Rect | null; element: HTMLElement | null; status: TargetStatus }>(
    { rect: null, element: null, status: target ? "waiting" : "none" });

  useEffect(() => {
    if (!target) {
      setState({ rect: null, element: null, status: "none" });
      return;
    }
    setState({ rect: null, element: null, status: "waiting" });
    let cancelled = false;
    let poll = 0;
    let frame = 0;
    const started = performance.now();

    const track = (el: HTMLElement) => {
      let last: Rect | null = null;
      const tick = () => {
        if (cancelled) return;
        const r = el.getBoundingClientRect();
        if (!same(last, r)) {
          last = { top: r.top, left: r.left, width: r.width, height: r.height };
          setState({ rect: last, element: el, status: "found" });
        }
        frame = requestAnimationFrame(tick);
      };
      tick();
    };

    const search = () => {
      if (cancelled) return;
      const { element, exists } = findTarget(target);
      if (element) {
        const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
        element.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
        track(element);
      } else if (exists || performance.now() - started > GIVE_UP_MS) {
        setState({ rect: null, element: null, status: "missing" });     // hidden here, or never rendered
      } else {
        poll = window.setTimeout(search, POLL_MS);
      }
    };
    poll = window.setTimeout(search, 50);                                // let the route render first

    return () => {
      cancelled = true;
      window.clearTimeout(poll);
      cancelAnimationFrame(frame);
    };
  }, [target, resetKey]);

  return state;
}
