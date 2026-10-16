import { describe, expect, it, vi } from "vitest";
import type { ChatHandlers } from "../../api/sse";
import type { SavedMessage, SuggestionList } from "../../api/types";
import { createChat, fromSaved, type ChatDeps } from "./chatController";

type Script = (h: ChatHandlers) => void | Promise<void>;

function setup(script: Script, suggestions: SuggestionList = { suggestions: [{ text: "Why is James Patel at risk?" }], source: "llm" },
               now?: () => number) {
  const signals: AbortSignal[] = [];
  const deps: ChatDeps = {
    stream: vi.fn(async (_s: string, _m: string, h: ChatHandlers) => { await script(h); }),
    suggest: vi.fn(async (_s: string, signal: AbortSignal) => { signals.push(signal); return suggestions; }),
    onSaved: vi.fn(),
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

  it("New chat clears the screen, cancels suggestions and starts a fresh session (the old one stays saved)", async () => {
    const { chat, deps, signals } = setup(answer);
    deps.suggest = vi.fn((_s: string, signal: AbortSignal) => { signals.push(signal); return new Promise<SuggestionList>(() => {}); });
    void chat.send("Which VIPs are at risk?");
    await vi.waitFor(() => expect(deps.suggest).toHaveBeenCalledTimes(1));
    chat.reset();
    expect(signals[0].aborted).toBe(true);
    expect(chat.getState()).toEqual({ messages: [], busy: false, sessionId: "s2" });
    deps.suggest = vi.fn(async () => ({ suggestions: [], source: "rules" as const }));
    await chat.send("hello again");
    expect((deps.stream as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0]).toBe("s2");
  });

  it("tells the app when the server saved something, so history and usage refresh", async () => {
    const { chat, deps } = setup(answer);
    await chat.send("Which VIPs are at risk?");
    expect(deps.onSaved).toHaveBeenCalledTimes(2);                 // the answer, then its follow-ups
  });
});

describe("chat controller: saved conversations", () => {
  const saved: SavedMessage[] = [
    { id: 7, role: "user", text: "Which VIPs are at risk?", steps: [], suggestions: null, duration_ms: null, error: false, created_at: null },
    { id: 8, role: "assistant", text: "James Patel.", steps: [{ id: "tool-1", status: "done", label: "Looked up" }],
      suggestions: ["Why is James at risk?"], duration_ms: 4200, error: false, created_at: null },
  ];

  it("opens a saved conversation as it was shown, and continues it in the same session", async () => {
    const { chat, deps } = setup(answer);
    chat.open("saved-1", saved);
    const state = chat.getState();
    expect(state.sessionId).toBe("saved-1");
    expect(state.messages.map((m) => [m.role, m.text])).toEqual([["user", "Which VIPs are at risk?"], ["assistant", "James Patel."]]);
    expect(state.messages[1]).toMatchObject({ durationMs: 4200, suggestions: ["Why is James at risk?"], steps: saved[1].steps });
    await chat.send("And Mia?");
    expect((deps.stream as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0]).toBe("saved-1");
    const ids = chat.getState().messages.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);                    // ids stay unique after opening
  });

  it("won't switch conversations while an answer is still arriving", async () => {
    let finish!: () => void;
    const { chat } = setup((h) => new Promise<void>((r) => { finish = () => { h.onAnswer("done"); r(); }; }));
    const pending = chat.send("one");
    chat.open("saved-1", saved);
    expect(chat.getState().sessionId).toBe("s1");
    finish();
    await pending;
  });

  it("maps saved errors and missing values", () => {
    expect(fromSaved([{ ...saved[1], error: true, duration_ms: null, suggestions: null }], 5)[0])
      .toMatchObject({ id: 5, error: true, durationMs: undefined, suggestions: undefined });
  });
});
