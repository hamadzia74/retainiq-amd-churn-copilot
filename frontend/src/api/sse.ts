// Reads the agent's Server-Sent Events stream. The endpoint is a POST, which
// EventSource can't do, so we parse the stream from fetch() ourselves.

import { ApiError } from "./client";
import type { AgentStep } from "./types";

export interface ChatHandlers {
  /** A progress step started, finished, failed or was cancelled (matched by `id`). */
  onStep: (step: AgentStep) => void;
  /** The next piece of the answer text. */
  onDelta: (text: string) => void;
  /** Drop the text streamed so far: it was a preamble before a tool call, not the answer. */
  onDeltaReset: () => void;
  /** The complete answer (authoritative). */
  onAnswer: (text: string) => void;
  onStatus: (message: string) => void;
  onError: (message: string) => void;
}

export async function streamChat(sessionId: string, message: string, h: ChatHandlers, signal?: AbortSignal) {
  const res = await fetch("/api/agent/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, message }),
    signal,
  });
  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.detail ?? res.statusText);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let cut: number;
    while ((cut = buffer.indexOf("\n\n")) >= 0) {
      const block = buffer.slice(0, cut);
      buffer = buffer.slice(cut + 2);
      const event = block.match(/^event: (.*)$/m)?.[1];
      const data = JSON.parse(block.match(/^data: (.*)$/m)?.[1] ?? "{}");
      if (event === "step") h.onStep(data as AgentStep);
      else if (event === "delta") h.onDelta(data.text);
      else if (event === "delta_reset") h.onDeltaReset();
      else if (event === "answer") h.onAnswer(data.text);
      else if (event === "status") h.onStatus(data.message);
      else if (event === "error") h.onError(data.message);
      else if (event === "done") return;
    }
  }
}
