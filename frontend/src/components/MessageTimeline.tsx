import type { TextSignal } from "../api/types";
import { label } from "../lib/format";
import { Badge } from "./ui";

function Mood({ s }: { s: number }) {
  const tone = s < -0.2 ? "red" : s > 0.2 ? "green" : "slate";
  return <Badge tone={tone}>{s > 0 ? "+" : ""}{s.toFixed(1)}</Badge>;
}

export function MessageTimeline({ items }: { items: TextSignal[] }) {
  if (!items.length) return <p className="text-sm text-slate-500">No tickets or reviews in the last 180 days.</p>;
  return (
    <ol className="relative space-y-4 border-l border-line pl-4">
      {[...items].reverse().map((m) => (
        <li key={m.id} className="relative">
          <span className={`absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-panel ${
            m.sentiment < -0.2 ? "bg-red-500" : m.sentiment > 0.2 ? "bg-emerald-500" : "bg-slate-500"}`} />
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
            <span className="tabular-nums">{m.date}</span>
            <Badge tone={m.kind === "ticket" ? "sky" : "violet"}>{m.kind}</Badge>
            <Mood s={m.sentiment} />
            <Badge>{label(m.category)}</Badge>
            {m.threat && <Badge tone="red">⚠ threat to leave</Badge>}
          </div>
          <p className="mt-1 text-sm text-slate-200">“{m.text}”</p>
          {m.summary && <p className="mt-0.5 text-xs text-slate-500">LLM summary: {m.summary}</p>}
        </li>
      ))}
    </ol>
  );
}
