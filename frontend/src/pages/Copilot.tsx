import { useQueryClient } from "@tanstack/react-query";
import { History } from "lucide-react";
import { useState } from "react";
import { api } from "../api/client";
import { queryKeys } from "../api/queries";
import { Button, Drawer, PageHeader, Source } from "../components/ui";
import { ChatHistory } from "../features/copilot/ChatHistory";
import { Composer } from "../features/copilot/Composer";
import { MessageList } from "../features/copilot/MessageList";
import { StarterPrompts } from "../features/copilot/StarterPrompts";
import { useHealth } from "../hooks/queries";
import { useChat } from "../hooks/useChat";

/** Fills the screen height: saved conversations, a scrolling message list, and the pinned composer. */
export default function Copilot() {
  const qc = useQueryClient();
  const { data: health } = useHealth();
  const { messages, busy, sessionId, send, reset, open } = useChat();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const online = !!health?.llm_available;
  const submit = (text: string) => { if (online && !busy) send(text); };

  const openChat = async (id: string) => {
    setOpening(id);
    setOpenError(null);
    try {
      const chat = await qc.fetchQuery({ queryKey: queryKeys.chat(id), queryFn: ({ signal }) => api.chat(id, signal), staleTime: 0 });
      open(chat.id, chat.messages);
      setHistoryOpen(false);
    } catch (e) {
      setOpenError((e as Error).message);
    } finally {
      setOpening(null);
    }
  };
  const newChat = () => {
    reset();
    setHistoryOpen(false);
  };
  const history = (
    <ChatHistory activeId={sessionId} busy={busy} opening={opening} onOpen={openChat} onNew={newChat}
      onDeleted={(id) => { if (id === sessionId) reset(); }} />
  );

  return (
    <>
      <div className="max-sm:[&_p]:hidden">
        <PageHeader title="Copilot">
          Ask in plain language. The LLM on AMD decides which tools to call. Every number it gives
          comes from the churn model and the optimizer, never from its own guesses.
        </PageHeader>
      </div>

      <section className="-mx-4 flex min-h-0 flex-1 overflow-hidden border-line bg-panel sm:mx-0 sm:mb-6 sm:rounded-xl sm:border">
        {/* Desktop: the history is a column. Smaller screens: a drawer from the History button. */}
        <aside className="hidden w-64 shrink-0 border-r border-line lg:block">{history}</aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex shrink-0 items-center gap-2 border-y border-line px-4 py-2.5 sm:border-t-0">
            <Button variant="ghost" onClick={() => setHistoryOpen(true)} className="py-1.5 max-md:min-h-9 lg:hidden" data-tour="chat-history">
              <History size={14} strokeWidth={2} /> History
            </Button>
            <span className="ml-auto"><Source kind="llm" /></span>
            {messages.length > 0 && <Button variant="ghost" onClick={newChat} disabled={busy} className="py-1.5 max-md:min-h-9">New chat</Button>}
          </header>
          {openError && (
            <p role="alert" className="shrink-0 border-b border-error-line bg-error-bg px-4 py-2 text-xs text-error-fg">
              Couldn't open that conversation: {openError}
            </p>
          )}

          <MessageList messages={messages} empty={<StarterPrompts onPick={submit} disabled={!online} />}
            onSuggest={submit} suggestDisabled={!online || busy} />

          <Composer onSend={submit} disabled={!online} busy={busy}
            placeholder={online ? "Ask about customers, risk or campaigns…" : "LLM offline: the Copilot is paused"}
            voice={{ available: !!health?.voice_available, reason: "the AMD provider doesn't accept audio input right now" }} />
        </div>
      </section>

      <Drawer open={historyOpen} onClose={() => setHistoryOpen(false)} label="Conversations">
        {history}
      </Drawer>
    </>
  );
}
