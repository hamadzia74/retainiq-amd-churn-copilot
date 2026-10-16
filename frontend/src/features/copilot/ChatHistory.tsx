import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, MessageSquare, Pencil, Plus, Trash2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState, type FormEvent } from "react";
import { api } from "../../api/client";
import { queryKeys } from "../../api/queries";
import type { ChatSummary } from "../../api/types";
import { Button, EmptyState, ErrorState, Skeleton, Spinner } from "../../components/ui";
import { useChats } from "../../hooks/queries";
import { ago } from "../../lib/format";
import { fadeUp } from "../../motion/variants";

/**
 * Your saved conversations, most recent first: open one to continue it, rename or delete it.
 * `opening` is the id being loaded; while an answer is arriving (`busy`) switching is disabled.
 */
export function ChatHistory({ activeId, busy, opening, onOpen, onNew, onDeleted }: {
  activeId: string; busy: boolean; opening: string | null;
  onOpen: (id: string) => void; onNew: () => void; onDeleted: (id: string) => void;
}) {
  const { data: chats, error, isLoading } = useChats();
  return (
    <div data-tour="chat-history" className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 px-3 py-2.5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Conversations</h2>
        <Button variant="ghost" onClick={onNew} disabled={busy} className="px-2.5 py-1 text-xs max-md:min-h-9">
          <Plus size={13} strokeWidth={2} /> New
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {isLoading && <div className="space-y-2 px-1">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12" />)}</div>}
        {error && <div className="px-1"><ErrorState error={error} /></div>}
        {chats?.length === 0 && <div className="px-2 py-3"><EmptyState>Your conversations will appear here.</EmptyState></div>}
        <ul className="space-y-0.5">
          <AnimatePresence initial={false}>
            {chats?.map((c) => (
              <motion.li key={c.id} layout variants={fadeUp} initial="hidden" animate="show" exit="exit">
                <HistoryItem chat={c} active={c.id === activeId} disabled={busy} loading={opening === c.id}
                  onOpen={() => onOpen(c.id)} onDeleted={() => onDeleted(c.id)} />
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      </div>
    </div>
  );
}

function HistoryItem({ chat, active, disabled, loading, onOpen, onDeleted }: {
  chat: ChatSummary; active: boolean; disabled: boolean; loading: boolean; onOpen: () => void; onDeleted: () => void;
}) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<"view" | "rename" | "confirm">("view");
  const [title, setTitle] = useState(chat.title);

  const rename = useMutation({
    mutationFn: () => api.renameChat(chat.id, title.trim()),
    onSuccess: (row) => {
      qc.setQueryData<ChatSummary[]>(queryKeys.chats, (rows) => rows?.map((r) => (r.id === row.id ? row : r)));
      setMode("view");
    },
  });
  const remove = useMutation({
    mutationFn: () => api.deleteChat(chat.id),
    onSuccess: () => {
      qc.setQueryData<ChatSummary[]>(queryKeys.chats, (rows) => rows?.filter((r) => r.id !== chat.id));
      qc.removeQueries({ queryKey: queryKeys.chat(chat.id) });
      onDeleted();
    },
  });

  const submitRename = (e: FormEvent) => {
    e.preventDefault();
    if (title.trim() && title.trim() !== chat.title) rename.mutate();
    else setMode("view");
  };

  if (mode === "rename") {
    return (
      <form onSubmit={submitRename} className="flex items-center gap-1 rounded-lg bg-hover p-1.5">
        <input autoFocus aria-label="Conversation title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && setMode("view")}
          className="min-w-0 flex-1 rounded-md border border-line bg-field px-2 py-1 text-sm text-strong focus:border-amd/60 focus:outline-none" />
        <IconButton label="Save title" type="submit" disabled={rename.isPending}><Check size={14} strokeWidth={2} /></IconButton>
        <IconButton label="Cancel" onClick={() => { setTitle(chat.title); setMode("view"); }}><X size={14} strokeWidth={2} /></IconButton>
      </form>
    );
  }

  if (mode === "confirm") {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-error-bg px-2.5 py-2 text-xs text-error-fg">
        <span className="min-w-0 flex-1">Delete this conversation?</span>
        <button type="button" disabled={remove.isPending} onClick={() => remove.mutate()} className="font-semibold hover:underline">
          {remove.isPending ? "Deleting…" : "Delete"}
        </button>
        <button type="button" onClick={() => setMode("view")} className="hover:underline">Keep</button>
      </div>
    );
  }

  return (
    <div className={`group relative flex items-center rounded-lg transition-colors ${active ? "bg-amd/12" : "hover:bg-hover"}`}>
      <button type="button" onClick={onOpen} disabled={disabled || active} aria-current={active ? "true" : undefined}
        className="flex min-w-0 flex-1 items-start gap-2.5 px-2.5 py-2 text-left disabled:cursor-default max-md:min-h-11">
        {loading ? <Spinner className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          : <MessageSquare size={14} strokeWidth={2} className={`mt-0.5 shrink-0 ${active ? "text-amd-fg" : "text-subtle"}`} />}
        <span className="min-w-0">
          <span className={`block truncate text-sm ${active ? "font-medium text-strong" : "text-fg"}`}>{chat.title}</span>
          <span className="block text-[11px] text-subtle">
            {ago(chat.updated_at)} · {chat.questions} question{chat.questions === 1 ? "" : "s"}
          </span>
        </span>
      </button>
      {/* Always visible on touch screens; on hover elsewhere. */}
      <div className="flex shrink-0 gap-0.5 pr-1 opacity-100 transition-opacity md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100">
        <IconButton label="Rename" onClick={() => setMode("rename")}><Pencil size={13} strokeWidth={2} /></IconButton>
        <IconButton label="Delete" onClick={() => setMode("confirm")} disabled={disabled && active}><Trash2 size={13} strokeWidth={2} /></IconButton>
      </div>
      {(rename.error || remove.error) && (
        <p role="alert" className="absolute left-2 top-full z-10 text-[11px] text-error-fg">{(rename.error ?? remove.error)!.message}</p>
      )}
    </div>
  );
}

function IconButton({ label, children, type = "button", ...props }: {
  label: string; children: React.ReactNode; type?: "button" | "submit"; onClick?: () => void; disabled?: boolean;
}) {
  return (
    <button type={type} aria-label={label} title={label} {...props}
      className="grid h-7 w-7 place-items-center rounded-md text-muted transition-colors hover:bg-hover hover:text-strong disabled:opacity-40 max-md:h-9 max-md:w-9">
      {children}
    </button>
  );
}
