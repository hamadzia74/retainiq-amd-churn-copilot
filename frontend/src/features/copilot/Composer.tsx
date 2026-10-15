import { SendHorizontal } from "lucide-react";
import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { Button } from "../../components/ui";

const LINE_PX = 20;
const MAX_LINES = 5;

/**
 * Pinned input bar with a solid, full-width background. The textarea grows from 1 to 5
 * lines; Enter sends, Shift+Enter adds a new line.
 */
export function Composer({ onSend, disabled, busy, placeholder }: {
  onSend: (text: string) => void; disabled: boolean; busy: boolean; placeholder: string;
}) {
  const [text, setText] = useState("");
  const field = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, LINE_PX * MAX_LINES + 16)}px`;
  }, [text]);

  const send = () => {
    const t = text.trim();
    if (!t || disabled || busy) return;
    onSend(t);
    setText("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };

  return (
    <form data-tour="composer" onSubmit={(e) => { e.preventDefault(); send(); }}
      className="shrink-0 border-t border-line bg-panel px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4">
      <div className="flex items-end gap-2 rounded-xl border border-line bg-field p-1.5 pl-3 transition-colors focus-within:border-amd/60">
        <textarea ref={field} rows={1} value={text} disabled={disabled} aria-label="Message"
          onChange={(e) => setText(e.target.value)} onKeyDown={onKeyDown} placeholder={placeholder}
          className="max-h-[116px] min-h-9 flex-1 resize-none bg-transparent py-2 text-sm leading-5 text-strong placeholder:text-subtle focus:outline-none disabled:cursor-not-allowed" />
        <Button type="submit" disabled={disabled || busy || !text.trim()} className="h-9 px-3 max-md:min-h-9">
          <SendHorizontal size={15} strokeWidth={2} />
          <span className="max-sm:sr-only">Send</span>
        </Button>
      </div>
      <p className="mt-1.5 hidden text-[11px] text-subtle sm:block">Enter to send · Shift + Enter for a new line</p>
    </form>
  );
}
