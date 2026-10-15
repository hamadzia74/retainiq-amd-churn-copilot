import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { useReducedMotion } from "motion/react";
import { useChartTheme } from "../../theme/useChartTheme";
import { seriesColour } from "./palette";
import type { ChartDatum } from "./types";

/** Donut only - the legend is rendered by the page (see features/campaign/ActionMix), so it can lay out responsively. */
export default function DonutChart({ data, height = 200 }: { data: ChartDatum[]; height?: number }) {
  const t = useChartTheme();
  const reduced = useReducedMotion();          // bars appear instantly under reduced motion
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="label" innerRadius="58%" outerRadius="90%" paddingAngle={2} stroke="none" isAnimationActive={!reduced} animationDuration={500}>
          {data.map((_, i) => <Cell key={i} fill={seriesColour(i)} />)}
        </Pie>
        <Tooltip contentStyle={{ background: t.tooltipBg, border: `1px solid ${t.tooltipBorder}`, borderRadius: 8, fontSize: 12 }}
          itemStyle={{ color: t.tooltipText }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
