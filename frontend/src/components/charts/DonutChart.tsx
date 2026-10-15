import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { useChartTheme } from "../../theme/useChartTheme";
import type { ChartDatum } from "./types";

const COLOURS = ["#ed1c24", "#f59e0b", "#38bdf8", "#a78bfa"];

export default function DonutChart({ data, height = 240 }: { data: ChartDatum[]; height?: number }) {
  const t = useChartTheme();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="label" innerRadius={55} outerRadius={85} paddingAngle={2} stroke="none" animationDuration={500}>
          {data.map((_, i) => <Cell key={i} fill={COLOURS[i % COLOURS.length]} />)}
        </Pie>
        <Tooltip contentStyle={{ background: t.tooltipBg, border: `1px solid ${t.tooltipBorder}`, borderRadius: 8, fontSize: 12 }}
          itemStyle={{ color: t.tooltipText }} />
        <Legend wrapperStyle={{ fontSize: 12, color: t.label }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
