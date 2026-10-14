import { Link, useParams } from "react-router-dom";
import { ActionCard } from "../components/ActionCard";
import { RiskBadge, RiskBar, TierBadge } from "../components/badges";
import { ContributionChart } from "../components/ContributionChart";
import { MessageTimeline } from "../components/MessageTimeline";
import { Button, Card, ErrorBox, Loading, Source } from "../components/ui";
import { useCustomer, useHealth, useMessage } from "../hooks/queries";
import { LANGUAGE, money, pct } from "../lib/format";

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{k}</p>
      <p className="text-sm font-medium tabular-nums text-slate-100">{v}</p>
    </div>
  );
}

export default function Customer360() {
  const { id = "" } = useParams();
  const { data: c, error, isLoading } = useCustomer(id);
  const { data: health } = useHealth();
  const draft = useMessage();

  if (isLoading) return <Loading what="Loading customer" />;
  if (error || !c) return <ErrorBox error={error ?? "Not found"} />;

  // Strongest pushes either way, so the chart stays readable.
  const contribs = [...c.contributions].sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect)).slice(0, 8)
    .sort((a, b) => b.effect - a.effect);
  const msg = draft.data?.customer_id === c.customer_id ? draft.data : undefined;

  return (
    <>
      <Link to="/customers" className="text-sm text-slate-400 hover:text-white">← At-risk customers</Link>

      <Card className="mt-3">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-white">{c.name}</h1>
              <TierBadge tier={c.tier} />
              <RiskBadge risk={c.risk} />
            </div>
            <p className="mt-0.5 text-sm text-slate-400">{c.customer_id} · speaks {LANGUAGE[c.language] ?? c.language}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-400">Revenue at risk (90d)</p>
            <p className="text-2xl font-semibold tabular-nums text-red-400">{money(c.value_at_risk)}</p>
          </div>
        </div>
        <div className="mt-4">
          <div className="mb-1 flex items-center justify-between text-xs text-slate-400">
            <span>P(no order in next 90 days)</span><Source kind="ml" />
          </div>
          <RiskBar p={c.churn_prob} wide />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Stat k="Spend 180d" v={money(c.revenue_180)} />
          <Stat k="Orders 90d" v={String(c.orders_90)} />
          <Stat k="Last order" v={`${c.days_since_order} days ago`} />
          <Stat k="Bought on discount" v={pct(c.discount_share)} />
          <Stat k="Return rate" v={pct(c.return_rate)} />
        </div>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Why the model says so" subtitle="Effect on log-odds of churn = coefficient × standardised value. Red pushes toward churn.">
          <ContributionChart data={contribs.map((c) => ({ label: c.label, value: c.effect }))} height={280} />
        </Card>

        <div className="space-y-4">
          <ActionCard action={c.recommended_action} />
          <Card title="Win-back message" subtitle={`Written in ${LANGUAGE[c.language] ?? c.language}, with the offer above`}
            action={msg && <Source kind={msg.source} />}>
            {msg ? (
              <p className="whitespace-pre-line rounded-lg bg-black/25 p-3 text-sm leading-relaxed text-slate-100">{msg.message}</p>
            ) : draft.error ? <ErrorBox error={draft.error} /> : (
              <p className="text-sm text-slate-400">
                {health?.llm_available
                  ? "The LLM on AMD writes a personal message that names their complaint."
                  : "LLM offline: you'll get a plain template, clearly labelled as one."}
              </p>
            )}
            <Button className="mt-3" disabled={draft.isPending} onClick={() => draft.mutate(c.customer_id)}>
              {draft.isPending ? "Writing…" : msg ? "Rewrite" : health?.llm_available ? "Draft message on AMD" : "Draft from template"}
            </Button>
          </Card>
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
                <div>
                  <p className="text-slate-100">{o.product}</p>
                  <p className="text-xs text-slate-500">
                    {o.date}{o.discount_used && " · discount"}{o.returned && <span className="text-red-400"> · returned</span>}
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
