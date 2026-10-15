import { useState } from "react";
import { DonutChart } from "../components/charts";
import { Card, CountUp, ErrorState, Loading, PageHeader, Stat, StatGrid } from "../components/ui";
import { Assumptions } from "../features/campaign/Assumptions";
import { BudgetSlider } from "../features/campaign/BudgetSlider";
import { FundedCustomers } from "../features/campaign/FundedCustomers";
import { usePlan } from "../hooks/queries";
import { useDebounced } from "../hooks/useDebounced";
import { useIsMobile } from "../hooks/useMediaQuery";
import { money, pct } from "../lib/format";

export default function Campaign() {
  const [budget, setBudget] = useState(1000);
  const { data: p, error, isLoading, isFetching } = usePlan(useDebounced(budget, 250));
  const isMobile = useIsMobile();

  return (
    <>
      <PageHeader title="Retention campaign planner">
        Set a budget. Each at-risk customer gets the action with the highest expected net value,
        then customers are funded by value per dollar until the money runs out.
      </PageHeader>

      <BudgetSlider value={budget} onChange={setBudget} />

      {isLoading ? <Loading what="Optimising" /> : error || !p ? <div className="mt-4"><ErrorState error={error} /></div> : (
        <div className={`transition-opacity ${isFetching ? "opacity-70" : ""}`}>
          <StatGrid className="mt-4">
            <Stat label="Spend" value={<CountUp value={p.spent} format={money} />} hint={`${pct(p.spent / p.budget)} of budget`} />
            <Stat label="Customers reached" value={<CountUp value={p.customers} />} hint={`of ${p.candidates} with a profitable action`} />
            <Stat label="Expected revenue saved" tone="green" value={<CountUp value={p.revenue_saved} format={money} />} />
            <Stat label="Net margin gain · ROI" tone="green" value={`${money(p.net_margin_gain)} · ${pct(p.roi)}`} />
          </StatGrid>
          {p.spent < p.budget * 0.95 && (
            <p className="mt-2 text-xs text-muted">
              {money(p.budget - p.spent)} is left unspent on purpose: no remaining customer has an action that pays for itself.
            </p>
          )}

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <Card title="Action mix">
              <DonutChart data={Object.entries(p.action_mix).map(([label, value]) => ({ label, value }))} height={isMobile ? 210 : 240} />
            </Card>
            <Assumptions className="lg:col-span-2" />
          </div>

          <FundedCustomers rows={p.rows} />
        </div>
      )}
    </>
  );
}
