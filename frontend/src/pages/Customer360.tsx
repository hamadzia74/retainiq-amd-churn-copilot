import { Link, useParams } from "react-router-dom";
import { ContributionChart } from "../components/charts";
import { Card, ErrorState, Loading, Source } from "../components/ui";
import { ActionCard } from "../features/customers/ActionCard";
import { MessageTimeline } from "../features/customers/MessageTimeline";
import { RiskBadge, RiskBar, TierBadge } from "../features/customers/risk";
import { WinBackCard } from "../features/customers/WinBackCard";
import { useCustomer, useHealth } from "../hooks/queries";
import { useIsMobile } from "../hooks/useMediaQuery";
import { LANGUAGE, money, pct } from "../lib/format";

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-subtle">{k}</p>
      <p className="text-sm font-medium tabular-nums text-strong">{v}</p>
    </div>
  );
}

export default function Customer360() {
  const { id = "" } = useParams();
  const { data: c, error, isLoading } = useCustomer(id);
  const { data: health } = useHealth();
  const isMobile = useIsMobile();

  if (isLoading) return <Loading what="Loading customer" />;
  if (error || !c) return <ErrorState error={error ?? "Not found"} />;

  // Strongest pushes either way, so the chart stays readable.
  const contribs = [...c.contributions].sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect)).slice(0, 8)
    .sort((a, b) => b.effect - a.effect).map((x) => ({ label: x.label, value: x.effect }));

  return (
    <>
      <Link to="/customers" className="text-sm text-muted hover:text-strong">← At-risk customers</Link>

      <Card className="mt-3">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-strong">{c.name}</h1>
              <TierBadge tier={c.tier} />
              <RiskBadge risk={c.risk} />
            </div>
            <p className="mt-0.5 text-sm text-muted">{c.customer_id} · speaks {LANGUAGE[c.language] ?? c.language}</p>
          </div>
          <div className="sm:text-right">
            <p className="text-xs text-muted">Revenue at risk (90d)</p>
            <p className="text-2xl font-semibold tabular-nums text-negative">{money(c.value_at_risk)}</p>
          </div>
        </div>
        <div className="mt-4">
          <div className="mb-1 flex items-center justify-between text-xs text-muted">
            <span>P(no order in next 90 days)</span><Source kind="ml" />
          </div>
          <RiskBar p={c.churn_prob} wide />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Fact k="Spend 180d" v={money(c.revenue_180)} />
          <Fact k="Orders 90d" v={String(c.orders_90)} />
          <Fact k="Last order" v={`${c.days_since_order} days ago`} />
          <Fact k="Bought on discount" v={pct(c.discount_share)} />
          <Fact k="Return rate" v={pct(c.return_rate)} />
        </div>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Why the model says so" subtitle="Effect on log-odds of churn = coefficient × standardised value. Red pushes toward churn.">
          <ContributionChart data={contribs} height={isMobile ? 240 : 280} />
        </Card>
        <div className="space-y-4">
          <ActionCard action={c.recommended_action} />
          <WinBackCard customer={c} />
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3" title="Tickets & reviews (180 days)" subtitle="Sentiment, category and threat extracted from each message"
          action={<Source kind={(health?.llm_share ?? 0) > 0 ? "llm" : "heuristic"} />}>
          <MessageTimeline items={c.recent_messages} />
        </Card>
        <Card className="lg:col-span-2" title="Recent orders">
          <ul className="divide-y divide-line text-sm">
            {[...c.orders].reverse().map((o) => (
              <li key={o.order_id} className="flex items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <p className="truncate text-strong">{o.product}</p>
                  <p className="text-xs text-subtle">
                    {o.date}{o.discount_used && " · discount"}{o.returned && <span className="text-negative"> · returned</span>}
                  </p>
                </div>
                <span className="tabular-nums">{money(o.revenue)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
