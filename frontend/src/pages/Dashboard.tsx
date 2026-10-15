import { Link } from "react-router-dom";
import { HBarChart } from "../components/charts";
import { Card, CountUp, EmptyState, ErrorState, Loading, PageHeader, Source, Stat, StatGrid } from "../components/ui";
import { AccuracyCompare } from "../features/dashboard/AccuracyCompare";
import { TopAtRisk } from "../features/dashboard/TopAtRisk";
import { useDashboard } from "../hooks/queries";
import { useIsMobile } from "../hooks/useMediaQuery";
import { label, money, pct } from "../lib/format";

export default function Dashboard() {
  const { data: d, error, isLoading } = useDashboard();
  const isMobile = useIsMobile();

  if (isLoading) return <Loading what="Training churn model" />;
  if (error || !d) return <ErrorState error={error} />;

  const complaints = Object.entries(d.top_complaints).map(([k, v]) => ({ label: label(k), value: v }));

  return (
    <>
      <PageHeader title="Retention overview">
        Who is likely to stop buying in the next 90 days, how much revenue that puts at risk,
        and why. Orders, support tickets and reviews are joined into one view.
      </PageHeader>

      <StatGrid>
        <Stat label="Active customers" value={<CountUp value={d.active_customers} />} hint="ordered in the last 90 days" />
        <Stat label="Revenue (180d)" value={<CountUp value={d.revenue_180} format={money} />} />
        <Stat label="Revenue at risk (90d)" tone="red" value={<CountUp value={d.revenue_at_risk_90} format={money} />}
          hint="Σ P(churn) × expected 90d revenue" />
        <Stat label="High-risk customers" tone="amber" value={<CountUp value={d.high_risk} />} hint={`${d.vip_high_risk} of them VIP`} />
      </StatGrid>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3" title="Prediction quality"
          subtitle={`Logistic regression · ${d.n_train.toLocaleString()} customers · base churn rate ${pct(d.base_rate)} · 5-fold CV ROC-AUC`}
          action={<Source kind="ml" />}>
          <AccuracyCompare aucOrdersOnly={d.auc_orders_only} aucFull={d.auc_full} llmShare={d.llm_share} />
        </Card>

        <Card className="lg:col-span-2" title="Why high-risk customers are unhappy" subtitle="Negative messages, last 90 days">
          {complaints.length
            ? <HBarChart data={complaints} name="messages" height={isMobile ? 150 : 170} />
            : <EmptyState>No complaints from high-risk customers.</EmptyState>}
        </Card>
      </div>

      <Card className="mt-4" title="Most revenue at stake" subtitle="Ranked by P(churn) × expected 90-day revenue"
        action={<Link to="/customers" className="text-sm text-amd-fg hover:underline">All customers →</Link>}>
        <TopAtRisk />
      </Card>
    </>
  );
}
