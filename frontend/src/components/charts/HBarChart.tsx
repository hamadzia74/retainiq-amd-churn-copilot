import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useChartTheme } from "../../theme/useChartTheme";
import type { ChartDatum } from "./types";

/** Simple horizontal bar chart in the AMD accent (counts per category). */
export default function HBarChart({ data, height = 170, name = "count" }: {
  data: ChartDatum[]; height?: number; name?: string;
}) {
  const t = useChartTheme();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ left: 0, right: 12 }}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="label" width={120} tick={{ fill: t.label, fontSize: 12 }} axisLine={false} tickLine={false} />
        <Tooltip cursor={{ fill: t.cursor }}
          contentStyle={{ background: t.tooltipBg, border: `1px solid ${t.tooltipBorder}`, borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: t.tooltipText }} itemStyle={{ color: t.tooltipText }} />
        <Bar dataKey="value" name={name} fill={t.accent} radius={3} animationDuration={500} />
      </BarChart>
    </ResponsiveContainer>
  );
}
