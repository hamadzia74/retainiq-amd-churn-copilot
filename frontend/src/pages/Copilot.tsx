import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import { Button, Card, PageHeader, Source } from "../components/ui";
import { useHealth } from "../hooks/queries";
import { useChat } from "../hooks/useChat";

const STARTERS = [
  "Which VIP customers are at risk, and why?",
  "Plan a $500 retention campaign and summarise it.",
  "What are high-risk customers complaining about?",
  "Draft a win-back message for my riskiest VIP.",
];

export default function Copilot() {
  const { data: health } = useHealth();
  const { messages, busy, send, reset } = useChat();
  const [input, setInput] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const online = !!health?.llm_available;

  // Braces matter: newer browsers return a Promise from scrollIntoView, and an effect must
  // return nothing or a cleanup function - returning the Promise crashes React.
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  const submit = (text: string) => {
    if (!text.trim() || busy || !online) return;
    send(text.trim());
    setInput("");
  };

  return (
    <>
      <PageHeader title="Copilot">
        Ask in plain language. The LLM on AMD decides which tools to call. Every number it gives
        comes from the churn model and the optimizer, never from its own guesses.
      </PageHeader>

      <Card className="flex min-h-[60vh] flex-col"
        action={<div className="flex items-center gap-2"><Source kind="llm" />
          {messages.length > 0 && <Button variant="ghost" onClick={reset} disabled={busy}>New chat</Button>}</div>}>
        <div className="flex-1 space-y-4">
          {!messages.length && (
            <div className="grid gap-2 sm:grid-cols-2">
              {STARTERS.map((s) => (
                <button key={s} disabled={!online} onClick={() => submit(s)}
                  className="rounded-lg border border-line p-3 text-left text-sm text-slate-300 hover:border-amd/60 hover:bg-white/[0.03] disabled:opacity-50">
                  {s}
                </button>
              ))}
            </div>
          )}

          {messages.map((m, i) => m.role === "user" ? (
            <div key={i} className="ml-auto max-w-[85%] rounded-xl rounded-br-sm bg-amd/20 px-3.5 py-2 text-sm text-white">{m.text}</div>
          ) : (
            <div key={i} className="max-w-[95%]">
              {m.tools.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {m.tools.map((t, j) => (
                    <span key={j} className="rounded-md bg-slate-800 px-2 py-1 font-mono text-[11px] text-slate-300">
                      ⚙ {t.name}({Object.entries(t.args).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(", ")})
                    </span>
                  ))}
                </div>
              )}
              {m.pending && !m.text ? (
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-600 border-t-amd" />
                  {m.status ? <span className="text-amber-300">Thinking on AMD… ({m.status})</span> : "Thinking on AMD…"}
                </div>
              ) : (
                <div className={`prose-chat rounded-xl rounded-bl-sm px-3.5 py-2 text-sm ${m.error ? "bg-red-950/40 text-red-300" : "bg-black/25 text-slate-200"}`}>
                  <Markdown>{m.text}</Markdown>
                </div>
              )}
            </div>
          ))}
          <div ref={end} />
        </div>

        <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); submit(input); }}>
          <input value={input} onChange={(e) => setInput(e.target.value)} disabled={!online}
            placeholder={online ? "Ask about customers, risk or campaigns…" : "LLM offline: start vLLM on AMD to use the Copilot"}
            className="min-w-0 flex-1 rounded-lg border border-line bg-black/20 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-amd/60 focus:outline-none" />
          <Button type="submit" disabled={!online || busy || !input.trim()}>Send</Button>
        </form>
      </Card>
    </>
  );
}
