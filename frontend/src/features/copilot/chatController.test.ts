import { describe, expect, it, vi } from "vitest";
import type { ChatHandlers } from "../../api/sse";
import type { SuggestionList } from "../../api/types";
import { createChat, type ChatDeps } from "./chatController";

type Script = (h: ChatHandlers) => void | Promise<void>;

function setup(script: Script, suggestions: SuggestionList = { suggestions: [{ text: "Why is James Patel at risk?" }], source: "llm" },
               now?: () => number) {
  const signals: AbortSignal[] = [];
  const deps: ChatDeps = {
    stream: vi.fn(async (_s: string, _m: string, h: ChatHandlers) => { await script(h); }),
    suggest: vi.fn(async (_s: string, signal: AbortSignal) => { signals.push(signal); return suggestions; }),
    resetSession: vi.fn(async () => {}),
    newSessionId: (() => { let n = 0; return () => `s${++n}`; })(),
    now,
  };
  return { chat: createChat(deps), deps, signals };
}

const answer: Script = (h) => {
  h.onStep({ id: "tool-1", status: "done", label: "Looked up at-risk VIP customers", summary: "2 found" });
  h.onAnswer("Your riskiest VIPs are James Patel and Mia Schneider.");
};

describe("chat controller: streaming and progress steps", () => {
  it("joins streamed pieces into the answer, then takes the final answer as authoritative", async () => {
    const seen: string[] = [];
    const { chat } = setup((h) => {
      h.onDelta("Your riskiest ");
      seen.push(chat.getState().messages.at(-1)!.text);
      h.onDelta("VIPs are…");
      seen.push(chat.getState().messages.at(-1)!.text);
      h.onAnswer("Your riskiest VIPs are James Patel and Mia Schneider.");
    });
    await chat.send("Which VIPs are at risk?");
    expect(seen).toEqual(["Your riskiest ", "Your riskiest VIPs are…"]);
    expect(chat.getState().messages.at(-1)!.text).toBe("Your riskiest VIPs are James Patel and Mia Schneider.");
  });

  it("drops a streamed preamble when the stream says so", async () => {
    const { chat } = setup((h) => { h.onDelta("Let me check… "); h.onDeltaReset(); h.onDelta("Done."); h.onAnswer("Done."); });
    await chat.send("hi");
    expect(chat.getState().messages.at(-1)!.text).toBe("Done.");
  });

  it("keeps steps in order, updates them by id, and removes cancelled ones", async () => {
    let at = 0;
    const { chat } = setup((h) => {
      h.onStep({ id: "think", status: "running", label: "Understanding your question" });
      h.onStep({ id: "think", status: "done", label: "Understood your question", ms: 400 });
      h.onStep({ id: "write", status: "running", label: "Writing the answer" });
      h.onStep({ id: "write", status: "cancelled", label: "Writing the answer" });
      h.onStep({ id: "tool-1", status: "running", label: "Checking your dashboard" });
      h.onStep({ id: "tool-1", status: "done", label: "Checked your dashboard", summary: "$27,468 at risk", ms: 800 });
      at = 4200;
      h.onAnswer("Done.");
    }, undefined, () => at);
    await chat.send("How are we doing?");
    const reply = chat.getState().messages.at(-1)!;
    expect(reply.steps.map((s) => [s.id, s.status, s.label])).toEqual([
      ["think", "done", "Understood your question"], ["tool-1", "done", "Checked your dashboard"]]);
    expect(reply.durationMs).toBe(4200);
  });

  it("never leaves a step spinning once the answer has ended", async () => {
    const { chat } = setup((h) => { h.onStep({ id: "tool-1", status: "running", label: "Checking your dashboard" }); h.onError("boom"); });
    await chat.send("hi");
    expect(chat.getState().messages.at(-1)!.steps[0].status).toBe("failed");
  });
});

describe("chat controller: follow-up suggestions", () => {
  it("requests suggestions exactly once after a finished answer, for this session", async () => {
    const { chat, deps } = setup(answer);
    await chat.send("Which VIPs are at risk?");
    expect(deps.suggest).toHaveBeenCalledTimes(1);
    expect((deps.suggest as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe("s1");
    const reply = chat.getState().messages.at(-1)!;
    expect(reply).toMatchObject({ role: "assistant", pending: false, suggestionsLoading: false, suggestions: ["Why is James Patel at risk?"] });
    expect(chat.getState().busy).toBe(false);
  });

  it("does not request suggestions after an error event", async () => {
    const { chat, deps } = setup((h) => h.onError("LLM unavailable"));
    await chat.send("hi");
    expect(deps.suggest).not.toHaveBeenCalled();
    expect(chat.getState().messages.at(-1)).toMatchObject({ error: true, text: "LLM unavailable" });
  });

  it("does not request suggestions when the stream fails or the answer is empty", async () => {
    const failing = setup(() => { throw new Error("network down"); });
    await failing.chat.send("hi");
    expect(failing.deps.suggest).not.toHaveBeenCalled();

    const empty = setup((h) => h.onAnswer("   "));
    await empty.chat.send("hi");
    expect(empty.deps.suggest).not.toHaveBeenCalled();
  });

  it("a new question cancels pending suggestions and clears the old chips", async () => {
    let release!: (v: SuggestionList) => void;
    const { chat, deps, signals } = setup(answer);
    deps.suggest = vi.fn((_s: string, signal: AbortSignal) => { signals.push(signal); return new Promise<SuggestionList>((r) => { release = r; }); });
    const first = chat.send("Which VIPs are at risk?");
    await vi.waitFor(() => expect(deps.suggest).toHaveBeenCalledTimes(1));
    expect(chat.getState().messages.at(-1)!.suggestionsLoading).toBe(true);

    const second = chat.send("Why is James Patel at risk?");       // user taps a chip / asks again
    expect(signals[0].aborted).toBe(true);
    release({ suggestions: [{ text: "stale" }], source: "llm" });
    await first;
    expect(chat.getState().messages.some((m) => m.suggestions?.includes("stale"))).toBe(false);
    release({ suggestions: [{ text: "fresh" }], source: "llm" });
    await second;
    expect(deps.suggest).toHaveBeenCalledTimes(2);
  });

  it("ignores new questions while an answer is in progress", async () => {
    let finish!: () => void;
    const { chat, deps } = setup((h) => new Promise<void>((r) => { finish = () => { h.onAnswer("done"); r(); }; }));
    const first = chat.send("one");
    await chat.send("two");                                        // busy: ignored
    finish();
    await first;
    expect(deps.stream).toHaveBeenCalledTimes(1);
    expect(chat.getState().messages.filter((m) => m.role === "user").map((m) => m.text)).toEqual(["one"]);
  });

  it("New chat clears everything, cancels suggestions and starts a fresh session", async () => {
    const { chat, deps, signals } = setup(answer);
    deps.suggest = vi.fn((_s: string, signal: AbortSignal) => { signals.push(signal); return new Promise<SuggestionList>(() => {}); });
    void chat.send("Which VIPs are at risk?");
    await vi.waitFor(() => expect(deps.suggest).toHaveBeenCalledTimes(1));
    chat.reset();
    expect(signals[0].aborted).toBe(true);
    expect(deps.resetSession).toHaveBeenCalledWith("s1");
    expect(chat.getState()).toEqual({ messages: [], busy: false });
    deps.suggest = vi.fn(async () => ({ suggestions: [], source: "rules" as const }));
    await chat.send("hello again");
    expect((deps.stream as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0]).toBe("s2");
  });
});
