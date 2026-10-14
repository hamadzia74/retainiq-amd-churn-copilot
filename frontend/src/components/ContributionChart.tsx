import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

/** Diverging bars: red pushes toward churn, green pushes away. */
export function ContributionChart({ data, height = 300 }: {
  data: { label: string; value: number }[]; height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ left: 0, right: 16, top: 4, bottom: 4 }}>
        <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={{ stroke: "#232836" }} tickLine={false} />
        <YAxis type="category" dataKey="label" width={170} tick={{ fill: "#cbd5e1", fontSize: 11 }} axisLine={false} tickLine={false} />
        <ReferenceLine x={0} stroke="#475569" />
        <Tooltip
          cursor={{ fill: "rgba(255,255,255,0.04)" }}
          contentStyle={{ background: "#13161e", border: "1px solid #232836", borderRadius: 8, fontSize: 12 }}
          formatter={(v: number) => [v.toFixed(2), "log-odds"]}
        />
        <Bar dataKey="value" radius={3} isAnimationActive={false}>
          {data.map((d, i) => <Cell key={i} fill={d.value > 0 ? "#ef4444" : "#10b981"} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
