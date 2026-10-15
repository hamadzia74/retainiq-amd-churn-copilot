import type { Action } from "../../api/types";
import { money } from "../../lib/format";

export function ActionCard({ action }: { action: Action }) {
  const profitable = action.net_value > 0;
  const cells: [string, string, string][] = [
    ["Revenue saved", money(action.revenue_saved), "text-positive"],
    ["Cost", money(action.cost), "text-fg"],
    ["Net margin", money(action.net_value), profitable ? "text-positive" : "text-negative"],
  ];
  return (
    <div className={`rounded-xl border p-4 ${profitable ? "border-[var(--tone-green-ring)] bg-good-bg" : "border-line bg-panel"}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-muted">Recommended action</p>
      <p className="mt-1 text-lg font-semibold text-strong">{action.label}</p>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        {cells.map(([k, v, c]) => (
          <div key={k} className="rounded-lg bg-sunken p-2">
            <dt className="text-[11px] text-muted">{k}</dt>
            <dd className={`text-sm font-semibold tabular-nums ${c}`}>{v}</dd>
          </div>
        ))}
      </dl>
      {!profitable && <p className="mt-2 text-xs text-muted">No action pays for itself here, so the campaign planner skips this customer.</p>}
    </div>
  );
}
