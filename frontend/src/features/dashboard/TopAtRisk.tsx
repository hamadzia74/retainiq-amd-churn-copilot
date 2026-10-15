import { motion } from "motion/react";
import { Link } from "react-router-dom";
import { Skeleton } from "../../components/ui";
import { useTopAtRisk } from "../../hooks/queries";
import { money } from "../../lib/format";
import { rowVariants } from "../../motion/variants";
import { RiskBar, TierBadge } from "../customers/risk";

/** The five customers with the most revenue at stake. */
export function TopAtRisk() {
  const rows = useTopAtRisk(5);
  if (!rows) return <div className="space-y-2">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-9" />)}</div>;
  return (
    <ul className="divide-y divide-line">
      {rows.map((c, i) => (
        <motion.li key={c.customer_id} variants={rowVariants} custom={i} initial="hidden" animate="show">
          <Link to={`/customers/${c.customer_id}`}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 py-2.5 hover:bg-hover sm:flex">
            <span className="truncate font-medium text-strong sm:w-44">{c.name}</span>
            <span className="text-right text-sm font-semibold tabular-nums text-negative sm:order-last sm:ml-auto">
              {money(c.value_at_risk)} at risk
            </span>
            <span className="flex items-center gap-3 max-sm:col-span-2">
              <TierBadge tier={c.tier} />
              <RiskBar p={c.churn_prob} delay={i * 0.05} />
            </span>
          </Link>
        </motion.li>
      ))}
    </ul>
  );
}
