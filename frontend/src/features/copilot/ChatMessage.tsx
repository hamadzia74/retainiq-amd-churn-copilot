import { lazy, Suspense } from "react";
import { Spinner } from "../../components/ui";
import type { ChatMessage as Message } from "../../hooks/useChat";
import { AgentTrace } from "./AgentTrace";
import { balanceMarkdown } from "./trace";
import { SuggestionChips } from "./SuggestionChips";

// The markdown renderer is the Copilot's heaviest dependency: load it only when an answer arrives.
const Markdown = lazy(() => import("react-markdown"));

const CURSOR = "▍";

/** One chat bubble. `suggest` is passed only for the latest answer, which shows the follow-up chips. */
export function ChatMessage({ message: m, suggest }: {
  message: Message; suggest?: { onPick: (text: string) => void; disabled: boolean };
}) {
  if (m.role === "user") {
    return (
      <div className="ml-auto w-fit max-w-[85%] whitespace-pre-wrap break-words rounded-xl rounded-br-sm bg-user-bubble px-3.5 py-2 text-sm text-strong">
        {m.text}
      </div>
    );
  }

  const streaming = !!m.pending && m.text.length > 0;
  const shownText = streaming ? balanceMarkdown(m.text) + CURSOR : m.text;     // tidy partial markdown + a typing cursor
  return (
    <div className="max-w-[95%]">
      <AgentTrace steps={m.steps} running={!!m.pending} durationMs={m.durationMs} status={m.pending ? m.status : undefined} />
      {m.pending && !m.text && !m.steps.length && (
        <div className="flex items-center gap-2 text-sm text-muted">
          <Spinner className="h-3 w-3" />
          {m.status ? <span className="text-warning">Thinking on AMD… ({m.status})</span> : "Thinking on AMD…"}
        </div>
      )}
      {m.text && (
        <div aria-live={streaming ? "off" : "polite"}
          className={`prose-chat break-words rounded-xl rounded-bl-sm px-3.5 py-2 text-sm ${
            m.error ? "bg-error-bg text-error-fg" : "bg-sunken text-fg"}`}>
          <Suspense fallback={<p className="whitespace-pre-wrap">{shownText}</p>}>
            <Markdown>{shownText}</Markdown>
          </Suspense>
        </div>
      )}
      {suggest && !m.pending && (
        <SuggestionChips items={m.suggestions} loading={m.suggestionsLoading} disabled={suggest.disabled} onPick={suggest.onPick} />
      )}
    </div>
  );
}
