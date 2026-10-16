import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, useSyncExternalStore } from "react";
import { api } from "../api/client";
import { queryKeys } from "../api/queries";
import { streamChat } from "../api/sse";
import { createChat } from "../features/copilot/chatController";

export type { ChatMessage } from "../features/copilot/chatController";

// Not crypto.randomUUID(): it only exists on HTTPS/localhost, and the demo may run on plain HTTP.
const newSessionId = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

/** Copilot chat state: progress steps and the answer stream in live, then follow-up suggestions.
 *  Conversations are saved on the server; `open` shows one from the history. */
export function useChat() {
  const qc = useQueryClient();
  const [chat] = useState(() => createChat({
    stream: (sessionId, message, handlers) => streamChat(sessionId, message, handlers),
    suggest: (sessionId, signal) => api.suggestions(sessionId, signal),
    newSessionId,
    onSaved: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.chats });
      void qc.invalidateQueries({ queryKey: queryKeys.me });       // today's AI usage
    },
  }));
  const state = useSyncExternalStore(chat.subscribe, chat.getState);
  useEffect(() => () => chat.dispose(), [chat]);
  return { ...state, send: chat.send, reset: chat.reset, open: chat.open };
}
