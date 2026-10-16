import { SendHorizontal } from "lucide-react";
import { useCallback, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { Button } from "../../components/ui";
import { MicButton, RecordingBar } from "./voice/VoiceControls";
import { recordingSupported, useRecorder } from "./voice/useRecorder";

const LINE_PX = 20;
const MAX_LINES = 5;

export interface VoiceOptions {
  available: boolean;
  /** Why voice is unavailable, shown on the mic button. */
  reason?: string;
}

/**
 * Pinned input bar with a solid, full-width background. The textarea grows from 1 to 5
 * lines; Enter sends, Shift+Enter adds a new line. The mic records a question, which is
 * transcribed on AMD and placed in the box - it waits for the user to press Send.
 */
export function Composer({ onSend, disabled, busy, placeholder, voice }: {
  onSend: (text: string) => void; disabled: boolean; busy: boolean; placeholder: string; voice: VoiceOptions;
}) {
  const [text, setText] = useState("");
  const field = useRef<HTMLTextAreaElement>(null);

  const insertTranscript = useCallback((spoken: string) => {
    setText((prev) => (prev.trim() ? `${prev.trimEnd()} ${spoken}` : spoken));
    requestAnimationFrame(() => {
      const el = field.current;
      if (el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
    });
  }, []);
  const recorder = useRecorder(insertTranscript);
  const { phase } = recorder.state;
  const recording = phase === "recording";
  const transcribing = phase === "transcribing";

  useLayoutEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, LINE_PX * MAX_LINES + 16)}px`;
  }, [text, phase]);

  const send = () => {
    const t = text.trim();
    if (!t || disabled || busy || recording || transcribing) return;
    onSend(t);
    setText("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };

  // Browsers only allow the microphone on HTTPS or localhost.
  const voiceUnavailable = !window.isSecureContext ? "the microphone needs HTTPS (or localhost)"
    : !recordingSupported() ? "this browser can't record audio"
    : disabled ? "the Copilot is paused" : !voice.available ? (voice.reason ?? "not available") : undefined;

  return (
    <form data-tour="composer" onSubmit={(e) => { e.preventDefault(); send(); }}
      className="shrink-0 border-t border-line bg-panel px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4">
      <div className={`flex items-end gap-1.5 rounded-xl border bg-field p-1.5 pl-3 transition-colors focus-within:border-amd/60 ${
        recording ? "border-amd/60" : "border-line"}`}>
        {recording ? (
          <RecordingBar state={recorder.state} onCancel={recorder.cancel} />
        ) : (
          <textarea ref={field} rows={1} value={text} disabled={disabled || transcribing} aria-label="Message"
            onChange={(e) => setText(e.target.value)} onKeyDown={onKeyDown}
            placeholder={transcribing ? "Transcribing your question on AMD…" : placeholder}
            className="max-h-[116px] min-h-9 flex-1 resize-none bg-transparent py-2 text-sm leading-5 text-strong placeholder:text-subtle focus:outline-none disabled:cursor-not-allowed" />
        )}
        {/* No mic at all when the server has no voice model; a greyed one when only the browser is the problem. */}
        {voice.available && <MicButton state={recorder.state} onStart={recorder.start} onStop={recorder.stop} unavailable={voiceUnavailable} />}
        <Button type="submit" disabled={disabled || busy || recording || transcribing || !text.trim()} className="h-9 px-3 max-md:min-h-9">
          <SendHorizontal size={15} strokeWidth={2} />
          <span className="max-sm:sr-only">Send</span>
        </Button>
      </div>
      {phase === "error" ? (
        <p role="alert" className="mt-1.5 text-[11px] text-error-fg">
          {recorder.state.error} <button type="button" onClick={recorder.dismiss} className="underline">Dismiss</button>
        </p>
      ) : (
        <p className="mt-1.5 hidden text-[11px] text-subtle sm:block">
          Enter to send · Shift + Enter for a new line{!voiceUnavailable && " · tap the mic to ask by voice"}
        </p>
      )}
    </form>
  );
}
