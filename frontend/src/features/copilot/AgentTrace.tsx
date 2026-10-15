import { AlertTriangle, Check, ChevronRight } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useId, useState } from "react";
import type { AgentStep } from "../../api/types";
import { Spinner } from "../../components/ui";
import { EASE_OUT } from "../../motion/variants";
import { stepTime, traceHeader, traceOpen } from "./trace";

const reveal = {
  initial: { height: 0, opacity: 0 },
  animate: { height: "auto", opacity: 1 },
  exit: { height: 0, opacity: 0 },
  transition: { duration: 0.2, ease: EASE_OUT },
};

function Chevron({ open }: { open: boolean }) {
  return (
    <motion.span animate={{ rotate: open ? 90 : 0 }} transition={{ duration: 0.18 }} className="inline-flex text-subtle">
      <ChevronRight size={14} strokeWidth={2.25} />
    </motion.span>
  );
}

function StepIcon({ status }: { status: AgentStep["status"] }) {
  if (status === "running") return <Spinner className="h-3.5 w-3.5" />;
  if (status === "failed") return <AlertTriangle size={14} className="text-warning" />;
  return <Check size={14} strokeWidth={2.5} className="text-positive" />;
}

/** One step of the trace. Steps with details get their own arrow to show them. */
function StepRow({ step }: { step: AgentStep }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const details = step.details ?? [];
  const hasDetails = details.length > 0;
  const body = (
    <>
      <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-panel ring-1 ring-line"><StepIcon status={step.status} /></span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-3">
          <span className={`text-[13px] ${step.status === "running" ? "text-strong" : "text-fg"}`}>
            {step.label}{step.status === "running" && "…"}
          </span>
          <span className="shrink-0 text-[11px] tabular-nums text-subtle">{stepTime(step.ms)}</span>
        </span>
        {step.summary && <span className="mt-0.5 block text-xs text-muted">{step.summary}</span>}
      </span>
      {hasDetails && <span className="mt-1"><Chevron open={open} /></span>}
    </>
  );
  return (
    <li className="relative">
      {hasDetails ? (
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls={id}
          className="flex w-full items-start gap-2.5 rounded-lg px-1.5 py-1.5 text-left hover:bg-hover max-md:min-h-11">
          {body}
        </button>
      ) : (
        <div className="flex items-start gap-2.5 px-1.5 py-1.5">{body}</div>
      )}
      <AnimatePresence initial={false}>
        {open && hasDetails && (
          <motion.ul id={id} {...reveal} className="overflow-hidden">
            <div className="mb-1 ml-9 space-y-1 rounded-lg bg-panel px-3 py-2 text-xs text-soft ring-1 ring-line">
              {details.map((d, i) => <li key={i} className="break-words">{d}</li>)}
            </div>
          </motion.ul>
        )}
      </AnimatePresence>
    </li>
  );
}

/**
 * The Copilot's progress trace as an accordion: open while it works, collapsed to
 * "How I got this · N steps · Xs" afterwards. Clicking the arrow (or the row) toggles it,
 * and that choice sticks for this answer.
 */
export function AgentTrace({ steps, running, durationMs, status }: {
  steps: AgentStep[]; running: boolean; durationMs?: number; status?: string;
}) {
  const [choice, setChoice] = useState<boolean | null>(null);
  const panelId = useId();
  const visible = steps.filter((s) => s.status !== "cancelled");
  if (!visible.length) return null;
  const open = traceOpen(running, choice);

  return (
    <div data-tour="agent-trace" className="mb-2 rounded-xl border border-line bg-sunken">
      <button type="button" onClick={() => setChoice(!open)} aria-expanded={open} aria-controls={panelId}
        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-medium text-soft hover:text-strong max-md:min-h-11">
        <Chevron open={open} />
        {running && <Spinner className="h-3 w-3" />}
        <span className="min-w-0 flex-1 truncate">{traceHeader(steps, running, durationMs)}</span>
      </button>
      {status && <p className="px-3 pb-2 text-[11px] text-warning">{status}</p>}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div id={panelId} {...reveal} className="overflow-hidden">
            <ol className="relative mx-2 mb-2 space-y-0.5 border-t border-line pt-1.5">
              {visible.map((s) => <StepRow key={s.id} step={s} />)}
            </ol>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
