import { motion } from "motion/react";
import type { TextSignal } from "../../api/types";
import { Badge, EmptyState } from "../../components/ui";
import { label } from "../../lib/format";
import { rowVariants } from "../../motion/variants";

function Mood({ s }: { s: number }) {
  const tone = s < -0.2 ? "red" : s > 0.2 ? "green" : "slate";
  return <Badge tone={tone}>{s > 0 ? "+" : ""}{s.toFixed(1)}</Badge>;
}

const dot = (s: number) => (s < -0.2 ? "bg-risk-high" : s > 0.2 ? "bg-risk-low" : "bg-subtle");

export function MessageTimeline({ items }: { items: TextSignal[] }) {
  if (!items.length) return <EmptyState>No tickets or reviews in the last 180 days.</EmptyState>;
  return (
    <ol className="relative space-y-4 border-l border-line pl-4">
      {[...items].reverse().map((m, i) => (
        <motion.li key={m.id} className="relative" variants={rowVariants} custom={i} initial="hidden" animate="show">
          <span className={`absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-panel ${dot(m.sentiment)}`} />
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
            <span className="tabular-nums">{m.date}</span>
            <Badge tone={m.kind === "ticket" ? "sky" : "violet"}>{m.kind}</Badge>
            <Mood s={m.sentiment} />
            <Badge>{label(m.category)}</Badge>
            {m.threat && <Badge tone="red">⚠ threat to leave</Badge>}
          </div>
          <p className="mt-1 text-sm text-fg">“{m.text}”</p>
          {m.summary && <p className="mt-0.5 text-xs text-subtle">LLM summary: {m.summary}</p>}
        </motion.li>
      ))}
    </ol>
  );
}
