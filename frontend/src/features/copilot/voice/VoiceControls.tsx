import { Mic, Square, X } from "lucide-react";
import { motion } from "motion/react";
import { Spinner } from "../../../components/ui";
import { formatClock, type RecorderState } from "./recorderState";
import { MAX_SECONDS } from "./useRecorder";

/** Mic button: start recording, or stop while recording. Shows why when voice is unavailable. */
export function MicButton({ state, onStart, onStop, unavailable }: {
  state: RecorderState; onStart: () => void; onStop: () => void; unavailable?: string;
}) {
  const recording = state.phase === "recording";
  const working = state.phase === "requesting" || state.phase === "transcribing";
  const label = unavailable ? `Voice input unavailable: ${unavailable}` : recording ? "Stop recording" : "Ask by voice";
  return (
    <button type="button" data-tour="mic-button" aria-label={label} title={label}
      disabled={!!unavailable || working} onClick={recording ? onStop : onStart}
      className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        recording ? "bg-amd text-white hover:bg-amd-dark" : "text-muted hover:bg-hover hover:text-strong"}`}>
      {working ? <Spinner className="h-4 w-4" /> : recording ? <Square size={14} fill="currentColor" /> : <Mic size={17} />}
    </button>
  );
}

/** Shown in place of the text box while recording: red dot, timer, level meter, cancel. */
export function RecordingBar({ state, onCancel }: { state: RecorderState; onCancel: () => void }) {
  const bars = [0.35, 0.65, 1, 0.65, 0.35];
  return (
    <div className="flex min-h-9 flex-1 items-center gap-3 py-1" role="status" aria-live="polite">
      <motion.span className="h-2.5 w-2.5 shrink-0 rounded-full bg-amd" animate={{ opacity: [1, 0.35, 1] }}
        transition={{ duration: 1.2, repeat: Infinity }} />
      <span className="text-sm tabular-nums text-strong">{formatClock(state.seconds)}</span>
      <span className="text-xs text-subtle">/ {formatClock(MAX_SECONDS)}</span>
      <span className="flex h-5 items-center gap-0.5" aria-hidden>
        {bars.map((w, i) => (
          <span key={i} className="w-1 rounded-full bg-amd/80 transition-[height] duration-100"
            style={{ height: `${Math.max(3, Math.round(20 * Math.min(1, state.level * w * 1.6)))}px` }} />
        ))}
      </span>
      <span className="sr-only">Recording. Press stop when you're done.</span>
      <button type="button" onClick={onCancel}
        className="ml-auto inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-medium text-muted hover:bg-hover hover:text-strong">
        <X size={13} /> Cancel
      </button>
    </div>
  );
}
