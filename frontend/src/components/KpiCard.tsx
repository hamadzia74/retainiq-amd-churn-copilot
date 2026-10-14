import type { ReactNode } from "react";

const TONE = { white: "text-white", red: "text-red-400", amber: "text-amber-300", green: "text-emerald-400" };

export function KpiCard({ label, value, hint, tone = "white" }: {
  label: string; value: ReactNode; hint?: ReactNode; tone?: keyof typeof TONE;
}) {
  return (
    <div className="rounded-xl border border-line bg-panel p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-1.5 text-2xl font-semibold tabular-nums ${TONE[tone]}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
