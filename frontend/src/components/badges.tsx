import type { Risk, Tier } from "../api/types";
import { pct, riskColour } from "../lib/format";
import { Badge } from "./ui";

export function TierBadge({ tier }: { tier: Tier }) {
  return <Badge tone={tier === "VIP" ? "violet" : tier === "Regular" ? "sky" : "slate"}>{tier}</Badge>;
}

export function RiskBadge({ risk }: { risk: Risk }) {
  return <Badge tone={risk === "High" ? "red" : risk === "Medium" ? "amber" : "green"}>{risk} risk</Badge>;
}

export function RiskBar({ p, wide = false }: { p: number; wide?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`h-1.5 overflow-hidden rounded-full bg-slate-800 ${wide ? "w-full" : "w-20"}`}>
        <div className="h-full rounded-full" style={{ width: pct(p), background: riskColour(p) }} />
      </div>
      <span className="w-9 text-right text-xs tabular-nums" style={{ color: riskColour(p) }}>{pct(p)}</span>
    </div>
  );
}

export function DriverChips({ drivers }: { drivers: string[] }) {
  if (!drivers.length) return <span className="text-xs text-slate-500">-</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {drivers.map((d) => (
        <span key={d} className={`rounded px-1.5 py-0.5 text-[11px] ${
          d.includes("threat") ? "bg-red-500/15 text-red-300" : "bg-slate-700/50 text-slate-300"}`}>
          {d}
        </span>
      ))}
    </div>
  );
}
