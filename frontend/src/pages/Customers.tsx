import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Tier } from "../api/types";
import { DriverChips, RiskBar, TierBadge } from "../components/badges";
import { Card, ErrorBox, Loading, PageHeader, Source } from "../components/ui";
import { useAtRisk } from "../hooks/queries";
import { money } from "../lib/format";

const TIERS: (Tier | "")[] = ["", "VIP", "Regular", "Occasional"];

export default function Customers() {
  const [tier, setTier] = useState<Tier | "">("");
  const [sort, setSort] = useState<"prob" | "value">("value");
  const [limit, setLimit] = useState(25);
  const { data, error, isLoading, isFetching } = useAtRisk({ tier, sort, limit });
  const navigate = useNavigate();

  const select = "rounded-lg border border-line bg-panel px-2.5 py-1.5 text-sm text-slate-200";

  return (
    <>
      <PageHeader title="At-risk customers">
        Probability of placing no order in the next 90 days, from the churn model. The reasons are the
        features pushing each customer's score up the most.
      </PageHeader>

      <Card
        title={<span className="flex items-center gap-2">Customers {isFetching && <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-600 border-t-amd" />}</span>}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Source kind="ml" />
            <select className={select} value={tier} onChange={(e) => setTier(e.target.value as Tier | "")}>
              {TIERS.map((t) => <option key={t} value={t}>{t || "All tiers"}</option>)}
            </select>
            <select className={select} value={sort} onChange={(e) => setSort(e.target.value as "prob" | "value")}>
              <option value="value">Sort: $ at risk</option>
              <option value="prob">Sort: probability</option>
            </select>
          </div>
        }>
        {isLoading ? <Loading /> : error ? <ErrorBox error={error} /> : (
          <>
            <div className="-mx-4 overflow-x-auto sm:mx-0">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-4 py-2 font-medium sm:px-2">Customer</th>
                    <th className="px-2 py-2 font-medium">Tier</th>
                    <th className="px-2 py-2 font-medium">Churn risk</th>
                    <th className="px-2 py-2 text-right font-medium">Spend 180d</th>
                    <th className="px-2 py-2 text-right font-medium">$ at risk</th>
                    <th className="px-2 py-2 text-right font-medium">Last order</th>
                    <th className="px-2 py-2 font-medium">Why</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data!.map((c) => (
                    <tr key={c.customer_id} onClick={() => navigate(`/customers/${c.customer_id}`)}
                      className="cursor-pointer hover:bg-white/[0.03]">
                      <td className="px-4 py-2.5 sm:px-2">
                        <p className="font-medium text-white">{c.name}</p>
                        <p className="text-xs text-slate-500">{c.customer_id}</p>
                      </td>
                      <td className="px-2"><TierBadge tier={c.tier} /></td>
                      <td className="px-2"><RiskBar p={c.churn_prob} /></td>
                      <td className="px-2 text-right tabular-nums">{money(c.revenue_180)}</td>
                      <td className="px-2 text-right font-medium tabular-nums text-red-400">{money(c.value_at_risk)}</td>
                      <td className="px-2 text-right tabular-nums text-slate-400">{c.days_since_order}d ago</td>
                      <td className="max-w-xs px-2 py-2"><DriverChips drivers={c.drivers} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data!.length === limit && limit < 200 && (
              <button onClick={() => setLimit((l) => Math.min(l + 25, 200))} className="mt-3 text-sm text-amd hover:underline">
                Show more
              </button>
            )}
          </>
        )}
      </Card>
    </>
  );
}
