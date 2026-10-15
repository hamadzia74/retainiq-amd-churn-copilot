import type { ReactNode } from "react";
import { useCountUp } from "../../hooks/useCountUp";

const TONES = { default: "text-strong", red: "text-negative", amber: "text-warning", green: "text-positive" };
export type StatTone = keyof typeof TONES;

/** A number that counts up once when it first appears. */
export function CountUp({ value, format = (n) => Math.round(n).toLocaleString() }: {
  value: number; format?: (n: number) => string;
}) {
  return <>{format(useCountUp(value))}</>;
}

/** KPI tile. `value` can be a <CountUp/> or any node. */
export function Stat({ label, value, hint, tone = "default" }: {
  label: string; value: ReactNode; hint?: ReactNode; tone?: StatTone;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-line bg-panel p-4">
      <p className="truncate text-xs font-medium uppercase tracking-wide text-muted" title={label}>{label}</p>
      {/* Values wrap rather than truncate, so long ones (model names, hardware) stay readable. */}
      <p className={`mt-1.5 text-2xl font-semibold tabular-nums [overflow-wrap:anywhere] ${TONES[tone]}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-subtle">{hint}</p>}
    </div>
  );
}

/** Responsive KPI grid: 1 column on very small phones, 2 on phones, 4 on desktop. */
export function StatGrid({ children, className = "", tour }: { children: ReactNode; className?: string; tour?: string }) {
  return <div data-tour={tour} className={`grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 lg:grid-cols-4 ${className}`}>{children}</div>;
}
