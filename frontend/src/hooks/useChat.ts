import { useCallback, useRef, useState } from "react";
import { api } from "../api/client";
import { streamChat } from "../api/sse";

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  tools: ToolCall[];
  error?: boolean;
  pending?: boolean;
  status?: string;       // e.g. "rate limited by the provider, retrying in 12s"
}

// Not crypto.randomUUID(): it only exists on HTTPS/localhost, and the demo may run on plain HTTP.
const newSession = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

/** Chat state for the copilot: tool calls stream in live, then the answer. */
export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const session = useRef(newSession());

  const patchLast = (fn: (m: ChatMessage) => ChatMessage) =>
    setMessages((ms) => [...ms.slice(0, -1), fn(ms[ms.length - 1])]);

  const send = useCallback(async (text: string) => {
    setBusy(true);
    setMessages((ms) => [...ms,
      { role: "user", text, tools: [] },
      { role: "assistant", text: "", tools: [], pending: true }]);
    try {
      await streamChat(session.current, text, {
        onTool: (name, args) => patchLast((m) => ({ ...m, tools: [...m.tools, { name, args }] })),
        onAnswer: (answer) => patchLast((m) => ({ ...m, text: answer, status: undefined })),
        onStatus: (status) => patchLast((m) => ({ ...m, status })),
        onError: (message) => patchLast((m) => ({ ...m, text: message, error: true })),
      });
    } catch (e) {
      patchLast((m) => ({ ...m, text: (e as Error).message, error: true }));
    } finally {
      patchLast((m) => ({ ...m, pending: false }));
      setBusy(false);
    }
  }, []);

  const reset = useCallback(() => {
    api.resetChat(session.current).catch(() => {});
    session.current = newSession();
    setMessages([]);
  }, []);

  return { messages, busy, send, reset };
}
