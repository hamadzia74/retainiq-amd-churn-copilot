import { motion } from "motion/react";
import { Link } from "react-router-dom";
import type { PlanRow } from "../../api/types";
import { Card } from "../../components/ui";
import { money } from "../../lib/format";
import { rowVariants } from "../../motion/variants";
import { RiskBar, TierBadge } from "../customers/risk";

/** Who the plan funds: a table once every column fits (lg+), cards below that. */
export function FundedCustomers({ rows }: { rows: PlanRow[] }) {
  return (
    <Card className="mt-4" tour="funded-customers" title={`Funded customers (${rows.length})`} subtitle="Ranked by net value per dollar spent">
      <div className="max-h-[480px] overflow-auto">
        <table className="hidden w-full text-sm lg:table">
          <thead className="sticky top-0 bg-panel">
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-2 py-2 font-medium">Customer</th><th className="px-2 font-medium">Tier</th>
              <th className="px-2 font-medium">Risk</th><th className="px-2 font-medium">Action</th>
              <th className="px-2 text-right font-medium">Cost</th><th className="px-2 text-right font-medium">Rev. saved</th>
              <th className="px-2 text-right font-medium">Net</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r, i) => (
              <motion.tr key={r.customer_id} variants={rowVariants} custom={i} initial="hidden" animate="show" className="hover:bg-hover">
                <td className="px-2 py-2"><Link to={`/customers/${r.customer_id}`} className="text-strong hover:text-amd-fg">{r.name}</Link></td>
                <td className="px-2"><TierBadge tier={r.tier} /></td>
                <td className="px-2"><RiskBar p={r.churn_prob} /></td>
                <td className="px-2 text-soft">{r.label}</td>
                <td className="px-2 text-right tabular-nums">{money(r.cost)}</td>
                <td className="px-2 text-right tabular-nums text-positive">{money(r.revenue_saved)}</td>
                <td className="px-2 text-right tabular-nums">{money(r.net_value)}</td>
              </motion.tr>
            ))}
          </tbody>
        </table>

        <ul className="divide-y divide-line lg:hidden">
          {rows.map((r) => (
            <li key={r.customer_id}>
              <Link to={`/customers/${r.customer_id}`} className="block py-3 active:bg-hover">
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate font-medium text-strong">{r.name}</span>
                  <span className="shrink-0 text-sm tabular-nums text-positive">+{money(r.net_value)}</span>
                </div>
                <p className="mt-0.5 text-xs text-muted">{r.label} · cost {money(r.cost)} · saves {money(r.revenue_saved)}</p>
                <div className="mt-2"><RiskBar p={r.churn_prob} wide /></div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
