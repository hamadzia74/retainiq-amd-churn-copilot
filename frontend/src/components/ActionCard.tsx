import type { Action } from "../api/types";
import { money } from "../lib/format";

export function ActionCard({ action }: { action: Action }) {
  const profitable = action.net_value > 0;
  return (
    <div className={`rounded-xl border p-4 ${profitable ? "border-emerald-800 bg-emerald-950/30" : "border-line bg-panel"}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Recommended action</p>
      <p className="mt-1 text-lg font-semibold text-white">{action.label}</p>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        {[
          ["Revenue saved", money(action.revenue_saved), "text-emerald-400"],
          ["Cost", money(action.cost), "text-slate-200"],
          ["Net margin", money(action.net_value), profitable ? "text-emerald-400" : "text-red-400"],
        ].map(([k, v, c]) => (
          <div key={k} className="rounded-lg bg-black/20 p-2">
            <dt className="text-[11px] text-slate-400">{k}</dt>
            <dd className={`text-sm font-semibold tabular-nums ${c}`}>{v}</dd>
          </div>
        ))}
      </dl>
      {!profitable && <p className="mt-2 text-xs text-slate-400">No action pays for itself here, so the campaign planner skips this customer.</p>}
    </div>
  );
}
