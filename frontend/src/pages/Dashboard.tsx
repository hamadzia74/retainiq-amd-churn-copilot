import { Link } from "react-router-dom";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { RiskBar, TierBadge } from "../components/badges";
import { KpiCard } from "../components/KpiCard";
import { Card, ErrorBox, Loading, PageHeader, Source } from "../components/ui";
import { useAtRisk, useDashboard } from "../hooks/queries";
import { label, money, pct } from "../lib/format";

function AucBar({ name, value, highlight }: { name: string; value: number; highlight?: boolean }) {
  // AUC 0.5 = coin flip, 1.0 = perfect; scale the bar over that range.
  const width = Math.max(0, (value - 0.5) / 0.5);
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span className="text-slate-300">{name}</span>
        <span className={`font-semibold tabular-nums ${highlight ? "text-emerald-400" : "text-slate-200"}`}>{value.toFixed(3)}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-slate-800">
        <div className={`h-full rounded-full ${highlight ? "bg-emerald-500" : "bg-slate-500"}`} style={{ width: pct(width) }} />
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { data: d, error, isLoading } = useDashboard();
  const top = useAtRisk({ limit: 5, sort: "value" });

  if (isLoading) return <Loading what="Training churn model" />;
  if (error || !d) return <ErrorBox error={error} />;

  const complaints = Object.entries(d.top_complaints).map(([k, v]) => ({ label: label(k), count: v }));
  const lift = d.auc_full - d.auc_orders_only;

  return (
    <>
      <PageHeader title="Retention overview">
        Who is likely to stop buying in the next 90 days, how much revenue that puts at risk,
        and why. Orders, support tickets and reviews are joined into one view.
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Active customers" value={d.active_customers.toLocaleString()} hint="ordered in the last 90 days" />
        <KpiCard label="Revenue (180d)" value={money(d.revenue_180)} />
        <KpiCard label="Revenue at risk (90d)" value={money(d.revenue_at_risk_90)} tone="red" hint="Σ P(churn) × expected 90d revenue" />
        <KpiCard label="High-risk customers" value={d.high_risk} tone="amber" hint={`${d.vip_high_risk} of them VIP`} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3" title="Prediction quality"
          subtitle={`Logistic regression · ${d.n_train.toLocaleString()} customers · base churn rate ${pct(d.base_rate)} · 5-fold CV ROC-AUC`}
          action={<Source kind="ml" />}>
          <div className="space-y-3">
            <AucBar name="Order history only" value={d.auc_orders_only} />
            <AucBar name="+ text signals from tickets & reviews" value={d.auc_full} highlight />
          </div>
          <p className="mt-4 rounded-lg bg-emerald-950/40 p-3 text-sm text-emerald-200">
            Reading customer text improves churn prediction by <b>{lift >= 0 ? "+" : ""}{lift.toFixed(3)} AUC</b>.{" "}
            <span className="text-emerald-300/70">
              {pct(d.llm_share)} of signals currently come from the LLM on AMD
              {d.llm_share < 1 && ", the rest from the keyword fallback"}.
            </span>
          </p>
        </Card>

        <Card className="lg:col-span-2" title="Why high-risk customers are unhappy" subtitle="Negative messages, last 90 days">
          {complaints.length ? (
            <ResponsiveContainer width="100%" height={170}>
              <BarChart data={complaints} layout="vertical" margin={{ left: 0, right: 12 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="label" width={120} tick={{ fill: "#cbd5e1", fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }}
                  contentStyle={{ background: "#13161e", border: "1px solid #232836", borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="count" name="messages" fill="#ed1c24" radius={3} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-sm text-slate-500">No complaints from high-risk customers.</p>}
        </Card>
      </div>

      <Card className="mt-4" title="Most revenue at stake" subtitle="Ranked by P(churn) × expected 90-day revenue"
        action={<Link to="/customers" className="text-sm text-amd hover:underline">All customers →</Link>}>
        {top.data ? (
          <ul className="divide-y divide-line">
            {top.data.map((c) => (
              <li key={c.customer_id}>
                <Link to={`/customers/${c.customer_id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5 hover:bg-white/[0.02]">
                  <span className="w-44 truncate font-medium text-white">{c.name}</span>
                  <TierBadge tier={c.tier} />
                  <RiskBar p={c.churn_prob} />
                  <span className="ml-auto text-sm font-semibold tabular-nums text-red-400">{money(c.value_at_risk)} at risk</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : <Loading />}
      </Card>
    </>
  );
}
