import { Check, ChevronLeft, ChevronRight, ClipboardPaste, MousePointerClick, Volume2, VolumeX, X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { Spinner } from "../../components/ui";
import { EASE_OUT } from "../../motion/variants";
import { findTour } from "./catalogue";
import { speechSupported, useNarration } from "./narration";
import { placeCard, type Rect, type Size } from "./placement";
import { tourStore, useTourState } from "./tourStore";
import { useTargetRect } from "./useTargetRect";

const PAD = 6;                       // spotlight padding around the target
const CARD_WIDTH = 340;
// Every blocking layer opts in to pointer events; the container itself lets clicks through,
// so the spotlight hole is clickable on click-to-advance steps.
const DIM = "pointer-events-auto bg-black/55";
const GLIDE = { duration: 0.28, ease: EASE_OUT };

function useViewport(): Size {
  const read = () => ({ width: window.innerWidth, height: window.innerHeight });
  const [vp, setVp] = useState(read);
  useEffect(() => {
    const on = () => setVp(read());
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return vp;
}

/** Fill a controlled React input with example text (it is never submitted). */
function pasteInto(el: HTMLTextAreaElement | HTMLInputElement, text: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, text);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

/**
 * Runs the active guided tour: navigates, spotlights the target, narrates, and shows the step card.
 * Read-only by construction: the page is `inert` and covered by an overlay; the only clickable
 * spot is the highlighted target, and only on click-to-advance steps.
 */
export function TourRunner() {
  const activeId = useTourState((s) => s.activeTourId);
  const stepIndex = useTourState((s) => s.stepIndex);
  const muted = useTourState((s) => s.muted);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const vp = useViewport();
  const reduced = useReducedMotion();
  const glide = reduced ? { duration: 0 } : GLIDE;     // reduced motion: the spotlight jumps instead of gliding

  const tour = findTour(activeId);
  const steps = tour?.steps ?? [];
  const step = steps[stepIndex];
  const stepKey = `${activeId}:${stepIndex}`;
  const clickToAdvance = step?.advanceOn === "target-click";

  // 1. Go to the step's page first.
  useEffect(() => {
    if (step?.route && pathname !== step.route) navigate(step.route);
  }, [stepKey]);                                       // eslint-disable-line react-hooks/exhaustive-deps

  // 2. Find and track the target (restarts when the step or page changes).
  const { rect, element, status } = useTargetRect(step?.target, `${stepKey}@${pathname}`);

  // 3. Read-only: the app can't be focused or typed into while a tour runs,
  //    except on click-to-advance steps (the overlay still limits clicks to the target).
  useEffect(() => {
    const root = document.getElementById("root");
    if (!root || !step) return;
    if (clickToAdvance) root.removeAttribute("inert");
    else root.setAttribute("inert", "");
    return () => root.removeAttribute("inert");
  }, [step, clickToAdvance]);

  // 4. Click-to-advance: the user's click does what it normally does (e.g. open the customer), then we move on.
  useEffect(() => {
    if (!clickToAdvance || !element) return;
    const onClick = () => window.setTimeout(() => tourStore.next(), 60);
    element.addEventListener("click", onClick, { once: true });
    return () => element.removeEventListener("click", onClick);
  }, [clickToAdvance, element]);

  // 5. Keyboard: Esc closes, arrows move.
  useEffect(() => {
    if (!tour) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") tourStore.stop();
      else if (e.key === "ArrowRight" && !clickToAdvance) tourStore.next();
      else if (e.key === "ArrowLeft") tourStore.back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tour, clickToAdvance]);

  // 6. Read the step aloud (stops on step change, mute and close).
  useNarration(step ? `${step.title}. ${step.body}` : "", !!step && !muted, stepKey);

  // Measure the card so placement can keep it on screen.
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardSize, setCardSize] = useState<Size>({ width: CARD_WIDTH, height: 230 });
  useLayoutEffect(() => {
    const el = cardRef.current;
    if (el && (Math.abs(el.offsetHeight - cardSize.height) > 1 || Math.abs(el.offsetWidth - cardSize.width) > 1)) {
      setCardSize({ width: el.offsetWidth, height: el.offsetHeight });
    }
  });

  if (!tour || !step) return null;

  const waiting = status === "waiting";
  const hole: Rect | null = rect && {
    top: Math.max(0, rect.top - PAD),
    left: Math.max(0, rect.left - PAD),
    width: Math.min(rect.width + PAD * 2, vp.width),
    height: Math.min(rect.height + PAD * 2, vp.height),
  };
  const layout = placeCard(hole, { width: Math.min(CARD_WIDTH, vp.width - 24), height: cardSize.height }, vp, step.placement ?? "auto");
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === steps.length - 1;
  const pasteTarget = step.sample ? element?.querySelector<HTMLTextAreaElement | HTMLInputElement>("textarea, input") : null;

  // Positions are plain numbers (no CSS transforms), so the entry animation can't fight them.
  const cardWidth = Math.min(CARD_WIDTH, vp.width - 24);
  const cardStyle: CSSProperties =
    layout.mode === "anchored" ? { top: layout.top, left: layout.left, width: cardWidth }
      : layout.mode === "center" ? { top: Math.max(12, (vp.height - cardSize.height) / 2), left: (vp.width - cardWidth) / 2, width: cardWidth }
        : {};

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[70]" role="presentation">
      {/* Dimmed overlay. With a target, four panels leave a hole around it; the hole itself
          is covered too unless this is a click-to-advance step. */}
      {hole ? (
        <>
          <motion.div className={`absolute inset-x-0 top-0 ${DIM}`} initial={false} animate={{ height: hole.top }} transition={glide} />
          <motion.div className={`absolute inset-x-0 bottom-0 ${DIM}`} initial={false} animate={{ top: hole.top + hole.height }} transition={glide} />
          <motion.div className={`absolute left-0 ${DIM}`} initial={false} animate={{ top: hole.top, height: hole.height, width: hole.left }} transition={glide} />
          <motion.div className={`absolute right-0 ${DIM}`} initial={false}
            animate={{ top: hole.top, height: hole.height, left: hole.left + hole.width }} transition={glide} />
          {!clickToAdvance && (
            <div className="pointer-events-auto absolute" style={{ top: hole.top, left: hole.left, width: hole.width, height: hole.height }} />
          )}
          <motion.div className="pointer-events-none absolute rounded-xl border-2 border-amd"
            initial={false} animate={{ top: hole.top, left: hole.left, width: hole.width, height: hole.height }} transition={glide} />
        </>
      ) : (
        <div className={`absolute inset-0 ${DIM}`} />
      )}

      {waiting && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 text-sm text-white/85">
          <Spinner className="h-4 w-4" /> Loading…
        </div>
      )}

      {/* Click-to-advance: a small static tab attached to the spotlight's top edge. */}
      {hole && clickToAdvance && (
        <span className="pointer-events-none absolute inline-flex items-center gap-1 rounded-t-md bg-amd px-2 py-0.5 text-[11px] font-semibold text-white"
          style={{ top: Math.max(0, hole.top - 20), left: hole.left + 10 }}>
          <MousePointerClick size={12} /> {step.callout ?? "Click to continue"}
        </span>
      )}

      {/* The step card. Keyed by step, so it re-enters on every step; the previous card is
          replaced immediately (no exit animation to wait for). */}
      {!waiting && (
          <motion.div key={stepKey} ref={cardRef} role="dialog" aria-modal="true" aria-label={step.title}
            drag={layout.mode === "anchored"} dragMomentum={false}
            initial={{ opacity: 0, y: layout.mode === "sheet" ? 24 : 8 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduced ? 0 : 0.2, ease: EASE_OUT }}
            style={cardStyle}
            className={`pointer-events-auto absolute overflow-hidden border border-line bg-panel shadow-2xl ${
              layout.mode === "sheet" ? "inset-x-0 bottom-0 rounded-t-2xl pb-[env(safe-area-inset-bottom)]" : "rounded-2xl"}`}>
            {/* Segmented progress along the top edge */}
            <div className="flex gap-1 px-4 pt-3" aria-hidden>
              {steps.map((_, i) => (
                <span key={i} className={`h-1 flex-1 rounded-full transition-colors ${i <= stepIndex ? "bg-amd" : "bg-line"}`} />
              ))}
            </div>

            <div className={`flex items-center gap-2 px-4 pt-3 select-none ${layout.mode === "anchored" ? "cursor-move" : ""}`}>
              <p className="min-w-0 flex-1 truncate text-[11px] font-medium text-muted">
                {tour.label} · Step {stepIndex + 1} of {steps.length}
              </p>
              <button type="button" onClick={tourStore.stop} aria-label="Close tour"
                className="-mr-2 grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-hover hover:text-strong">
                <X size={16} />
              </button>
            </div>

            <div className="px-4 pb-4">
              <h3 className="text-base font-semibold leading-snug text-strong">{step.title}</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-soft">{step.body}</p>
              {step.sample && (
                <div className="mt-3 rounded-lg border border-dashed border-line p-2.5">
                  <p className="text-xs leading-relaxed text-soft">{step.sample}</p>
                  {pasteTarget && !pasteTarget.disabled ? (
                    <button type="button" onClick={() => pasteInto(pasteTarget, step.sample!)}
                      className="mt-2 inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-amd-fg hover:underline">
                      <ClipboardPaste size={13} /> Paste into the question box
                    </button>
                  ) : (
                    <p className="mt-1.5 text-[11px] text-subtle">The Copilot is paused while the LLM is offline, so there's nowhere to paste it yet.</p>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 border-t border-line px-3 py-2.5">
              {speechSupported() ? (
                <button type="button" onClick={tourStore.toggleMuted} aria-label={muted ? "Turn narration on" : "Turn narration off"}
                  title={muted ? "Narration off" : "Narration on"}
                  className={`inline-flex min-h-9 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium transition-colors hover:bg-hover ${muted ? "text-subtle" : "text-soft"}`}>
                  {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
                  <span className="max-sm:sr-only">{muted ? "Muted" : "Narrating"}</span>
                </button>
              ) : <span />}
              <div className="ml-auto flex items-center gap-1.5">
                {!isFirst && (
                  <button type="button" onClick={tourStore.back}
                    className="inline-flex min-h-9 items-center gap-1 rounded-full px-3 text-xs font-semibold text-soft hover:bg-hover hover:text-strong">
                    <ChevronLeft size={14} /> Back
                  </button>
                )}
                {clickToAdvance ? (
                  <button type="button" onClick={tourStore.next} title="Skip this step"
                    className="inline-flex min-h-9 items-center gap-1 rounded-full border border-line px-3 text-xs font-semibold text-soft hover:bg-hover hover:text-strong">
                    Skip <ChevronRight size={14} />
                  </button>
                ) : (
                  <button type="button" onClick={tourStore.next}
                    className="inline-flex min-h-9 items-center gap-1 rounded-full bg-amd px-4 text-xs font-semibold text-white hover:bg-amd-dark">
                    {isLast ? <>Done <Check size={14} /></> : <>Next <ChevronRight size={14} /></>}
                  </button>
                )}
              </div>
            </div>
          </motion.div>
      )}
    </div>,
    document.body,
  );
}
