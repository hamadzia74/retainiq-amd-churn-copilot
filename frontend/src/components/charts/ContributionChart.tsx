import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useChartTheme } from "../../theme/useChartTheme";
import type { ChartDatum } from "./types";

/** Diverging bars: red pushes toward churn, green pushes away. */
export default function ContributionChart({ data, height = 300, unit = "log-odds" }: {
  data: ChartDatum[]; height?: number; unit?: string;
}) {
  const t = useChartTheme();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ left: 0, right: 16, top: 4, bottom: 4 }}>
        <XAxis type="number" tick={{ fill: t.axis, fontSize: 11 }} axisLine={{ stroke: t.line }} tickLine={false} />
        <YAxis type="category" dataKey="label" width={150} tick={{ fill: t.label, fontSize: 11 }} axisLine={false} tickLine={false} />
        <ReferenceLine x={0} stroke={t.reference} />
        <Tooltip cursor={{ fill: t.cursor }}
          contentStyle={{ background: t.tooltipBg, border: `1px solid ${t.tooltipBorder}`, borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: t.tooltipText }} itemStyle={{ color: t.tooltipText }}
          formatter={(v: number) => [v.toFixed(2), unit]} />
        <Bar dataKey="value" radius={3} animationDuration={500}>
          {data.map((d, i) => <Cell key={i} fill={d.value > 0 ? t.up : t.down} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
