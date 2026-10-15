import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useIsMobile } from "../../hooks/useMediaQuery";
import { useReducedMotion } from "motion/react";
import { useChartTheme } from "../../theme/useChartTheme";
import { axisLabelWidth, barChartHeight } from "./layout";
import type { ChartDatum } from "./types";
import { WrappedTick } from "./WrappedTick";

/** Diverging bars: red pushes toward churn, green pushes away. Labels wrap on narrow screens. */
export default function ContributionChart({ data, height, unit = "log-odds" }: {
  data: ChartDatum[]; height?: number; unit?: string;
}) {
  const t = useChartTheme();
  const reduced = useReducedMotion();          // bars appear instantly under reduced motion
  const compact = useIsMobile();
  const labelWidth = axisLabelWidth(data.map((d) => d.label), compact);
  return (
    <ResponsiveContainer width="100%" height={height ?? barChartHeight(data.length, compact)}>
      <BarChart data={data} layout="vertical" margin={{ left: 0, right: 12, top: 4, bottom: 4 }}>
        <XAxis type="number" tick={{ fill: t.axis, fontSize: 11 }} axisLine={{ stroke: t.line }} tickLine={false} />
        <YAxis type="category" dataKey="label" width={labelWidth} axisLine={false} tickLine={false} interval={0}
          tick={<WrappedTick width={labelWidth - 8} fill={t.label} />} />
        <ReferenceLine x={0} stroke={t.reference} />
        <Tooltip cursor={{ fill: t.cursor }}
          contentStyle={{ background: t.tooltipBg, border: `1px solid ${t.tooltipBorder}`, borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: t.tooltipText }} itemStyle={{ color: t.tooltipText }}
          formatter={(v: number) => [v.toFixed(2), unit]} />
        <Bar dataKey="value" radius={3} maxBarSize={20} isAnimationActive={!reduced} animationDuration={500}>
          {data.map((d, i) => <Cell key={i} fill={d.value > 0 ? t.up : t.down} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
