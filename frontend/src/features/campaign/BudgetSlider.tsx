import { Card } from "../../components/ui";
import { money } from "../../lib/format";

export const BUDGET_MIN = 100;
export const BUDGET_MAX = 5000;

export function BudgetSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <Card>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="text-sm text-soft" htmlFor="budget">Marketing budget</label>
        <span className="text-3xl font-semibold tabular-nums text-strong">{money(value)}</span>
      </div>
      <input id="budget" type="range" min={BUDGET_MIN} max={BUDGET_MAX} step={50} value={value}
        onChange={(e) => onChange(Number(e.target.value))} className="mt-3 h-6 w-full cursor-pointer accent-[#ed1c24]" />
      <div className="flex justify-between text-xs text-subtle"><span>{money(BUDGET_MIN)}</span><span>{money(BUDGET_MAX)}</span></div>
    </Card>
  );
}
