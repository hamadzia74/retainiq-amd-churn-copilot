import { Button, PageHeader, Source } from "../components/ui";
import { Composer } from "../features/copilot/Composer";
import { MessageList } from "../features/copilot/MessageList";
import { StarterPrompts } from "../features/copilot/StarterPrompts";
import { useHealth } from "../hooks/queries";
import { useChat } from "../hooks/useChat";

/** Fills the screen height: header, a scrolling message list, and the pinned composer. */
export default function Copilot() {
  const { data: health } = useHealth();
  const { messages, busy, send, reset } = useChat();
  const online = !!health?.llm_available;
  const submit = (text: string) => { if (online && !busy) send(text); };

  return (
    <>
      <div className="max-sm:[&_p]:hidden">
        <PageHeader title="Copilot">
          Ask in plain language. The LLM on AMD decides which tools to call. Every number it gives
          comes from the churn model and the optimizer, never from its own guesses.
        </PageHeader>
      </div>

      <section className="-mx-4 flex min-h-0 flex-1 flex-col overflow-hidden border-line bg-panel sm:mx-0 sm:mb-6 sm:rounded-xl sm:border">
        <header className="flex shrink-0 items-center justify-end gap-2 border-y border-line px-4 py-2.5 sm:border-t-0">
          <Source kind="llm" />
          {messages.length > 0 && <Button variant="ghost" onClick={reset} disabled={busy} className="py-1.5 max-md:min-h-9">New chat</Button>}
        </header>

        <MessageList messages={messages} empty={<StarterPrompts onPick={submit} disabled={!online} />} />

        <Composer onSend={submit} disabled={!online} busy={busy}
          placeholder={online ? "Ask about customers, risk or campaigns…" : "LLM offline: the Copilot is paused"} />
      </section>
    </>
  );
}
