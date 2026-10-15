import { lazy, Suspense } from "react";
import { Spinner } from "../../components/ui";
import { SuggestionChips } from "./SuggestionChips";
import type { ChatMessage as Message } from "../../hooks/useChat";

// The markdown renderer is the Copilot's heaviest dependency: load it only when an answer arrives.
const Markdown = lazy(() => import("react-markdown"));

function ToolCalls({ tools }: { tools: Message["tools"] }) {
  if (!tools.length) return null;
  return (
    <div className="mb-2 flex flex-wrap gap-1.5">
      {tools.map((t, i) => (
        <span key={i} className="max-w-full truncate rounded-md bg-track px-2 py-1 font-mono text-[11px] text-soft">
          ⚙ {t.name}({Object.entries(t.args).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(", ")})
        </span>
      ))}
    </div>
  );
}

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
  return (
    <div className="max-w-[95%]">
      <ToolCalls tools={m.tools} />
      {m.pending && !m.text ? (
        <div className="flex items-center gap-2 text-sm text-muted">
          <Spinner className="h-3 w-3" />
          {m.status ? <span className="text-warning">Thinking on AMD… ({m.status})</span> : "Thinking on AMD…"}
        </div>
      ) : (
        <div className={`prose-chat break-words rounded-xl rounded-bl-sm px-3.5 py-2 text-sm ${
          m.error ? "bg-error-bg text-error-fg" : "bg-sunken text-fg"}`}>
          <Suspense fallback={<p className="whitespace-pre-wrap">{m.text}</p>}>
            <Markdown>{m.text}</Markdown>
          </Suspense>
        </div>
      )}
      {suggest && (
        <SuggestionChips items={m.suggestions} loading={m.suggestionsLoading} disabled={suggest.disabled} onPick={suggest.onPick} />
      )}
    </div>
  );
}
