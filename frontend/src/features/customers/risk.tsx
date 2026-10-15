import type { Risk, Tier } from "../../api/types";
import { Badge, ProgressBar } from "../../components/ui";
import { pct } from "../../lib/format";

type Level = "high" | "mid" | "low";
const level = (p: number): Level => (p >= 0.4 ? "high" : p >= 0.2 ? "mid" : "low");

export function TierBadge({ tier }: { tier: Tier }) {
  return <Badge tone={tier === "VIP" ? "violet" : tier === "Regular" ? "sky" : "slate"}>{tier}</Badge>;
}

export function RiskBadge({ risk }: { risk: Risk }) {
  return <Badge tone={risk === "High" ? "red" : risk === "Medium" ? "amber" : "green"}>{risk} risk</Badge>;
}

/** Churn probability as a coloured bar plus the percentage. */
export function RiskBar({ p, wide = false, delay = 0 }: { p: number; wide?: boolean; delay?: number }) {
  const l = level(p);
  return (
    <div className={`flex items-center gap-2 ${wide ? "w-full" : ""}`}>
      <ProgressBar value={p} color={`var(--risk-${l})`} delay={delay} className={wide ? "flex-1" : "w-20"} />
      <span className="w-9 text-right text-xs tabular-nums" style={{ color: `var(--risk-${l}-fg)` }}>{pct(p)}</span>
    </div>
  );
}

export function DriverChips({ drivers }: { drivers: string[] }) {
  if (!drivers.length) return <span className="text-xs text-subtle">-</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {drivers.map((d) => (
        <span key={d} className={`rounded px-1.5 py-0.5 text-[11px] ${
          d.includes("threat") ? "bg-[var(--tone-red-bg)] text-[var(--tone-red-fg)]" : "bg-[var(--tone-slate-bg)] text-soft"}`}>
          {d}
        </span>
      ))}
    </div>
  );
}
