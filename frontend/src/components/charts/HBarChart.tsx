import { Bar, BarChart, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useIsMobile } from "../../hooks/useMediaQuery";
import { useReducedMotion } from "motion/react";
import { useChartTheme } from "../../theme/useChartTheme";
import { axisLabelWidth, barChartHeight } from "./layout";
import type { ChartDatum } from "./types";
import { WrappedTick } from "./WrappedTick";

/** Horizontal bars in the AMD accent with the count printed at each bar's end. Adapts to screen width. */
export default function HBarChart({ data, height, name = "count" }: { data: ChartDatum[]; height?: number; name?: string }) {
  const t = useChartTheme();
  const reduced = useReducedMotion();          // bars appear instantly under reduced motion
  const compact = useIsMobile();
  const labelWidth = axisLabelWidth(data.map((d) => d.label), compact);
  return (
    <ResponsiveContainer width="100%" height={height ?? barChartHeight(data.length, compact)}>
      <BarChart data={data} layout="vertical" margin={{ left: 0, right: 36, top: 4, bottom: 4 }}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="label" width={labelWidth} axisLine={false} tickLine={false} interval={0}
          tick={<WrappedTick width={labelWidth - 8} fill={t.label} fontSize={12} />} />
        <Tooltip cursor={{ fill: t.cursor }}
          contentStyle={{ background: t.tooltipBg, border: `1px solid ${t.tooltipBorder}`, borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: t.tooltipText }} itemStyle={{ color: t.tooltipText }} />
        <Bar dataKey="value" name={name} fill={t.accent} radius={3} maxBarSize={22} isAnimationActive={!reduced} animationDuration={500}>
          <LabelList dataKey="value" position="right" fill={t.label} fontSize={12} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
