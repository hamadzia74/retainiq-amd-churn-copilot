import { ProgressBar } from "../../components/ui";
import { pct } from "../../lib/format";

function AucBar({ name, value, highlight, delay }: { name: string; value: number; highlight?: boolean; delay: number }) {
  // AUC 0.5 = coin flip, 1.0 = perfect: scale the bar over that range.
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span className="text-soft">{name}</span>
        <span className={`font-semibold tabular-nums ${highlight ? "text-positive" : "text-fg"}`}>{value.toFixed(3)}</span>
      </div>
      <ProgressBar value={(value - 0.5) / 0.5} height="h-2.5" delay={delay}
        color={highlight ? "var(--risk-low)" : "var(--subtle)"} />
    </div>
  );
}

/** Order-history-only vs with LLM text signals: the measured value of reading customer text. */
export function AccuracyCompare({ aucOrdersOnly, aucFull, llmShare }: { aucOrdersOnly: number; aucFull: number; llmShare: number }) {
  const lift = aucFull - aucOrdersOnly;
  return (
    <>
      <div className="space-y-3">
        <AucBar name="Order history only" value={aucOrdersOnly} delay={0} />
        <AucBar name="+ text signals from tickets & reviews" value={aucFull} highlight delay={0.1} />
      </div>
      <p className="mt-4 rounded-lg bg-good-bg p-3 text-sm text-good-fg">
        Reading customer text improves churn prediction by <b>{lift >= 0 ? "+" : ""}{lift.toFixed(3)} AUC</b>.{" "}
        <span className="text-good-fg-soft">
          {pct(llmShare)} of signals currently come from the LLM on AMD{llmShare < 1 && ", the rest from the keyword fallback"}.
        </span>
      </p>
    </>
  );
}
