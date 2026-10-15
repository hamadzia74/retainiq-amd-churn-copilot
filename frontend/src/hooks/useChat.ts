import { useEffect, useState, useSyncExternalStore } from "react";
import { api } from "../api/client";
import { streamChat } from "../api/sse";
import { createChat } from "../features/copilot/chatController";

export type { ChatMessage, ToolCall } from "../features/copilot/chatController";

// Not crypto.randomUUID(): it only exists on HTTPS/localhost, and the demo may run on plain HTTP.
const newSessionId = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

/** Copilot chat state: tool calls stream in live, then the answer, then follow-up suggestions. */
export function useChat() {
  const [chat] = useState(() => createChat({
    stream: (sessionId, message, handlers) => streamChat(sessionId, message, handlers),
    suggest: (sessionId, signal) => api.suggestions(sessionId, signal),
    resetSession: api.resetChat,
    newSessionId,
  }));
  const state = useSyncExternalStore(chat.subscribe, chat.getState);
  useEffect(() => () => chat.dispose(), [chat]);
  return { messages: state.messages, busy: state.busy, send: chat.send, reset: chat.reset };
}
