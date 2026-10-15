import { DonutChart, seriesColour } from "../../components/charts";
import { Card } from "../../components/ui";
import { pct } from "../../lib/format";

/** Donut plus a legend list (action, count, share): beside the donut when there is room, below it when not. */
export function ActionMix({ mix }: { mix: Record<string, number> }) {
  const data = Object.entries(mix).map(([label, value]) => ({ label, value }));
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  return (
    <Card title="Action mix" subtitle="Customers per recommended action" tour="action-mix">
      <div className="flex flex-col items-center gap-4 sm:flex-row lg:flex-col">
        <div className="aspect-square w-full max-w-[200px] shrink-0">
          <DonutChart data={data} height={200} />
        </div>
        <ul className="w-full min-w-0 space-y-2 text-sm">
          {data.map((d, i) => (
            <li key={d.label} className="flex items-center gap-2.5">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: seriesColour(i) }} />
              <span className="min-w-0 flex-1 text-soft">{d.label}</span>
              <span className="tabular-nums text-strong">{d.value}</span>
              <span className="w-10 text-right tabular-nums text-subtle">{pct(d.value / total)}</span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
