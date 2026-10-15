// Copilot chat state as a small framework-free controller (unit-tested in chatController.test.ts;
// React reads it through useChat). Owns the rule "one suggestions request per finished answer".
import type { ChatHandlers } from "../../api/sse";
import type { SuggestionList } from "../../api/types";

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}

export interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  text: string;
  tools: ToolCall[];
  error?: boolean;
  pending?: boolean;
  status?: string;                 // e.g. "rate limited by the provider, retrying in 12s"
  suggestions?: string[];          // follow-ups for this answer (only the latest answer shows them)
  suggestionsLoading?: boolean;
}

export interface ChatState {
  messages: ChatMessage[];
  busy: boolean;
}

export interface ChatDeps {
  stream: (sessionId: string, message: string, handlers: ChatHandlers) => Promise<void>;
  suggest: (sessionId: string, signal: AbortSignal) => Promise<SuggestionList>;
  resetSession: (sessionId: string) => Promise<void>;
  newSessionId: () => string;
}

export function createChat(deps: ChatDeps) {
  let state: ChatState = { messages: [], busy: false };
  const listeners = new Set<() => void>();
  let session = deps.newSessionId();
  let nextId = 1;
  let suggesting: AbortController | null = null;

  const set = (patch: Partial<ChatState>) => {
    state = { ...state, ...patch };
    listeners.forEach((l) => l());
  };
  const patch = (id: number, fn: (m: ChatMessage) => ChatMessage) =>
    set({ messages: state.messages.map((m) => (m.id === id ? fn(m) : m)) });

  /** Cancel an in-flight suggestions request and clear any chips (a newer question supersedes them). */
  const dropSuggestions = () => {
    suggesting?.abort();
    suggesting = null;
    if (state.messages.some((m) => m.suggestions || m.suggestionsLoading)) {
      set({ messages: state.messages.map((m) => ({ ...m, suggestions: undefined, suggestionsLoading: false })) });
    }
  };

  async function fetchSuggestions(replyId: number, sessionId: string) {
    const ctl = new AbortController();
    suggesting = ctl;
    patch(replyId, (m) => ({ ...m, suggestionsLoading: true }));
    try {
      const r = await deps.suggest(sessionId, ctl.signal);
      if (!ctl.signal.aborted) patch(replyId, (m) => ({ ...m, suggestionsLoading: false, suggestions: r.suggestions.map((s) => s.text) }));
    } catch {
      if (!ctl.signal.aborted) patch(replyId, (m) => ({ ...m, suggestionsLoading: false }));   // no chips; nothing else breaks
    } finally {
      if (suggesting === ctl) suggesting = null;
    }
  }

  async function send(text: string) {
    const question = text.trim();
    if (state.busy || !question) return;
    dropSuggestions();
    const user: ChatMessage = { id: nextId++, role: "user", text: question, tools: [] };
    const reply: ChatMessage = { id: nextId++, role: "assistant", text: "", tools: [], pending: true };
    const sessionId = session;
    set({ busy: true, messages: [...state.messages, user, reply] });

    try {
      await deps.stream(sessionId, question, {
        onTool: (name, args) => patch(reply.id, (m) => ({ ...m, tools: [...m.tools, { name, args }] })),
        onAnswer: (answer) => patch(reply.id, (m) => ({ ...m, text: answer, status: undefined })),
        onStatus: (status) => patch(reply.id, (m) => ({ ...m, status })),
        onError: (message) => patch(reply.id, (m) => ({ ...m, text: message, error: true })),
      });
    } catch (e) {
      patch(reply.id, (m) => ({ ...m, text: (e as Error).message, error: true }));
    }
    if (session !== sessionId) return;                       // "New chat" happened meanwhile
    patch(reply.id, (m) => ({ ...m, pending: false }));
    set({ busy: false });

    // Exactly one suggestions request per finished answer - never after an error or an empty reply.
    const done = state.messages.find((m) => m.id === reply.id);
    if (done && !done.error && done.text.trim()) await fetchSuggestions(reply.id, sessionId);
  }

  function reset() {
    suggesting?.abort();
    suggesting = null;
    deps.resetSession(session).catch(() => {});
    session = deps.newSessionId();
    set({ messages: [], busy: false });
  }

  return {
    getState: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    send,
    reset,
    /** Stop background work when the Copilot page unmounts. */
    dispose: () => suggesting?.abort(),
  };
}

export type Chat = ReturnType<typeof createChat>;
