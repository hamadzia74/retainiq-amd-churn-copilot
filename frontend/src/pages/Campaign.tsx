import { useState } from "react";
import { Link } from "react-router-dom";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { RiskBar, TierBadge } from "../components/badges";
import { KpiCard } from "../components/KpiCard";
import { Card, ErrorBox, Loading, PageHeader } from "../components/ui";
import { useDebounced } from "../hooks/useDebounced";
import { usePlan } from "../hooks/queries";
import { money, pct } from "../lib/format";

const COLOURS = ["#ed1c24", "#f59e0b", "#38bdf8", "#a78bfa"];

// Mirrors the ACTIONS table in retainiq/optimizer.py (shown so judges see the assumptions).
const ASSUMPTIONS = [
  ["Free shipping (30 days)", "8%", "$6"],
  ["10% off next order", "14% × (0.5 + discount share)", "10% × basket × 50% redeemed"],
  ["20% off next order", "24% × (0.5 + discount share)", "20% × basket × 50% redeemed"],
  ["Personal call + fix", "30% if they complained, else 7.5%", "$15"],
];

export default function Campaign() {
  const [budget, setBudget] = useState(1000);
  const debounced = useDebounced(budget, 250);
  const { data: p, error, isLoading, isFetching } = usePlan(debounced);

  const mix = p ? Object.entries(p.action_mix).map(([name, value]) => ({ name, value })) : [];

  return (
    <>
      <PageHeader title="Retention campaign planner">
        Set a budget. Each at-risk customer gets the action with the highest expected net value,
        then customers are funded by value per dollar until the money runs out.
      </PageHeader>

      <Card>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <label className="text-sm text-slate-300" htmlFor="budget">Marketing budget</label>
          <span className="text-3xl font-semibold tabular-nums text-white">{money(budget)}</span>
        </div>
        <input id="budget" type="range" min={100} max={5000} step={50} value={budget}
          onChange={(e) => setBudget(Number(e.target.value))} className="mt-3 w-full accent-[#ed1c24]" />
        <div className="flex justify-between text-xs text-slate-500"><span>$100</span><span>$5,000</span></div>
      </Card>

      {isLoading ? <Loading what="Optimising" /> : error || !p ? <ErrorBox error={error} /> : (
        <div className={isFetching ? "opacity-70 transition" : "transition"}>
          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard label="Spend" value={money(p.spent)} hint={`${pct(p.spent / p.budget)} of budget`} />
            <KpiCard label="Customers reached" value={p.customers} hint={`of ${p.candidates} with a profitable action`} />
            <KpiCard label="Expected revenue saved" value={money(p.revenue_saved)} tone="green" />
            <KpiCard label="Net margin gain · ROI" value={`${money(p.net_margin_gain)} · ${pct(p.roi)}`} tone="green" />
          </div>
          {p.spent < p.budget * 0.95 && (
            <p className="mt-2 text-xs text-slate-400">
              {money(p.budget - p.spent)} is left unspent on purpose: no remaining customer has an action that pays for itself.
            </p>
          )}

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <Card title="Action mix">
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={mix} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2} stroke="none" isAnimationActive={false}>
                    {mix.map((_, i) => <Cell key={i} fill={COLOURS[i % COLOURS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: "#13161e", border: "1px solid #232836", borderRadius: 8, fontSize: 12 }} itemStyle={{ color: "#e2e8f0" }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </Card>

            <Card className="lg:col-span-2" title="How the value is calculated">
              <pre className="overflow-x-auto rounded-lg bg-black/30 p-3 text-xs text-slate-200">
{`revenue_saved = P(churn) × expected 90d revenue × uplift(action, customer)
net_value     = revenue_saved × margin − cost(action, customer)`}
              </pre>
              <table className="mt-3 w-full text-xs">
                <thead><tr className="text-left text-slate-400"><th className="py-1">Action</th><th>Uplift (assumed)</th><th>Cost</th></tr></thead>
                <tbody className="divide-y divide-line text-slate-300">
                  {ASSUMPTIONS.map(([a, u, c]) => <tr key={a}><td className="py-1.5 pr-2">{a}</td><td className="pr-2">{u}</td><td>{c}</td></tr>)}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-slate-500">These uplift figures are assumptions. Replace them with your own A/B test results.</p>
            </Card>
          </div>

          <Card className="mt-4" title={`Funded customers (${p.rows.length})`} subtitle="Ranked by net value per dollar spent">
            <div className="-mx-4 max-h-[480px] overflow-auto sm:mx-0">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="sticky top-0 bg-panel">
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-4 py-2 font-medium sm:px-2">Customer</th><th className="px-2 font-medium">Tier</th>
                    <th className="px-2 font-medium">Risk</th><th className="px-2 font-medium">Action</th>
                    <th className="px-2 text-right font-medium">Cost</th><th className="px-2 text-right font-medium">Rev. saved</th>
                    <th className="px-2 text-right font-medium">Net</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {p.rows.map((r) => (
                    <tr key={r.customer_id} className="hover:bg-white/[0.03]">
                      <td className="px-4 py-2 sm:px-2"><Link to={`/customers/${r.customer_id}`} className="text-white hover:text-amd">{r.name}</Link></td>
                      <td className="px-2"><TierBadge tier={r.tier} /></td>
                      <td className="px-2"><RiskBar p={r.churn_prob} /></td>
                      <td className="px-2 text-slate-300">{r.label}</td>
                      <td className="px-2 text-right tabular-nums">{money(r.cost)}</td>
                      <td className="px-2 text-right tabular-nums text-emerald-400">{money(r.revenue_saved)}</td>
                      <td className="px-2 text-right tabular-nums">{money(r.net_value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
