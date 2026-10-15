import { describe, expect, it, vi } from "vitest";
import type { ChatHandlers } from "../../api/sse";
import type { SuggestionList } from "../../api/types";
import { createChat, type ChatDeps } from "./chatController";

type Script = (h: ChatHandlers) => void | Promise<void>;

function setup(script: Script, suggestions: SuggestionList = { suggestions: [{ text: "Why is James Patel at risk?" }], source: "llm" }) {
  const signals: AbortSignal[] = [];
  const deps: ChatDeps = {
    stream: vi.fn(async (_s: string, _m: string, h: ChatHandlers) => { await script(h); }),
    suggest: vi.fn(async (_s: string, signal: AbortSignal) => { signals.push(signal); return suggestions; }),
    resetSession: vi.fn(async () => {}),
    newSessionId: (() => { let n = 0; return () => `s${++n}`; })(),
  };
  return { chat: createChat(deps), deps, signals };
}

const answer: Script = (h) => { h.onTool("list_at_risk", { tier: "VIP" }); h.onAnswer("Your riskiest VIPs are James Patel and Mia Schneider."); };

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
