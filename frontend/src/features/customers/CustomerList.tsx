import { ChevronRight } from "lucide-react";
import { motion } from "motion/react";
import { Link, useNavigate } from "react-router-dom";
import type { AtRiskRow } from "../../api/types";
import { money } from "../../lib/format";
import { rowVariants } from "../../motion/variants";
import { DriverChips, RiskBar, TierBadge } from "./risk";

/** At-risk customers: a full table on desktop, stacked cards on phones. */
export function CustomerList({ rows }: { rows: AtRiskRow[] }) {
  const navigate = useNavigate();
  return (
    <>
      <div className="hidden md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-2 py-2 font-medium">Customer</th>
              <th className="px-2 py-2 font-medium">Tier</th>
              <th className="px-2 py-2 font-medium">Churn risk</th>
              <th className="px-2 py-2 text-right font-medium">Spend 180d</th>
              <th className="px-2 py-2 text-right font-medium">$ at risk</th>
              <th className="px-2 py-2 text-right font-medium">Last order</th>
              <th className="px-2 py-2 font-medium">Why</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((c, i) => (
              <motion.tr key={c.customer_id} variants={rowVariants} custom={i} initial="hidden" animate="show"
                onClick={() => navigate(`/customers/${c.customer_id}`)} className="cursor-pointer hover:bg-hover">
                <td className="px-2 py-2.5">
                  <p className="font-medium text-strong">{c.name}</p>
                  <p className="text-xs text-subtle">{c.customer_id}</p>
                </td>
                <td className="px-2"><TierBadge tier={c.tier} /></td>
                <td className="px-2"><RiskBar p={c.churn_prob} delay={Math.min(i, 12) * 0.025} /></td>
                <td className="px-2 text-right tabular-nums">{money(c.revenue_180)}</td>
                <td className="px-2 text-right font-medium tabular-nums text-negative">{money(c.value_at_risk)}</td>
                <td className="px-2 text-right tabular-nums text-muted">{c.days_since_order}d ago</td>
                <td className="max-w-xs px-2 py-2"><DriverChips drivers={c.drivers} /></td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="-mx-4 divide-y divide-line md:hidden">
        {rows.map((c, i) => (
          <motion.li key={c.customer_id} variants={rowVariants} custom={i} initial="hidden" animate="show">
            <Link to={`/customers/${c.customer_id}`} className="flex items-center gap-3 px-4 py-3 active:bg-hover">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium text-strong">{c.name}</span>
                  <TierBadge tier={c.tier} />
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <RiskBar p={c.churn_prob} wide />
                  <span className="shrink-0 text-sm font-medium tabular-nums text-negative">{money(c.value_at_risk)}</span>
                </div>
              </div>
              <ChevronRight size={16} className="shrink-0 text-subtle" />
            </Link>
          </motion.li>
        ))}
      </ul>
    </>
  );
}
