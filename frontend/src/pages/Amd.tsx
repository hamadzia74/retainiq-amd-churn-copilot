import { ContributionChart } from "../components/ContributionChart";
import { KpiCard } from "../components/KpiCard";
import { Button, Card, ErrorBox, PageHeader } from "../components/ui";
import { useHealth, useModel } from "../hooks/queries";
import { useEnrichJob } from "../hooks/useEnrichJob";
import { pct } from "../lib/format";

const pipeline = (llm: string) => [
  [`LLM · ${llm}`, "Reads every ticket & review (en/es/de) → sentiment, complaint category, threat to leave", "border-amd/60"],
  ["Features", "Joins text signals with order history: recency, frequency trend, spend, discounts, returns", "border-line"],
  ["ML model", "Logistic regression → P(no order in next 90 days), explained per customer", "border-sky-700"],
  ["Optimizer", "Expected value per action → best offer per customer within the budget", "border-emerald-800"],
  [`LLM · ${llm}`, "Writes the win-back message in the customer's language and powers the Copilot", "border-amd/60"],
];

export default function Amd() {
  const { data: h } = useHealth();
  const { data: model } = useModel();
  const { status, start } = useEnrichJob();
  const running = status?.state === "running";
  const s = status?.stats;
  const plan = status?.plan;
  const provider = h?.llm_provider_name ?? "AMD";
  const q = h?.quota;

  return (
    <>
      <PageHeader title="Powered by AMD">
        The language model runs on AMD GPUs via {provider}
        {h?.llm_provider === "vllm" ? " (AMD Instinct MI300X, ROCm, vLLM)" : ""}. It turns unstructured customer
        text into model features and writes the outreach. The churn prediction itself comes from a classical ML
        model, never from the LLM.
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Status" value={h?.llm_available ? "Online" : "Offline"} tone={h?.llm_available ? "green" : "amber"}
          hint={h?.llm_available ? provider : h?.llm_problem ?? undefined} />
        <KpiCard label="Model" value={<span className="text-base">{h?.llm_model ?? "-"}</span>} />
        <KpiCard label="Hardware" value={<span className="text-base text-amd">{h?.llm_hardware ?? "-"}</span>}
          hint={q?.daily_cost_remaining_usd != null
            ? `quota left $${q.daily_cost_remaining_usd.toFixed(2)} of $${q.daily_cost_limit_usd?.toFixed(2)} today · ${q.rpm_limit} req/min`
            : undefined} />
        <KpiCard label="Signals from LLM" value={h ? pct(h.llm_share) : "-"} hint="rest: keyword fallback" />
      </div>

      <Card className="mt-4" title="Pipeline">
        <ol className="grid gap-2 md:grid-cols-5">
          {pipeline(provider).map(([t, d, border], i) => (
            <li key={i} className={`rounded-lg border bg-black/20 p-3 ${border}`}>
              <p className="text-xs font-semibold text-white">{i + 1}. {t}</p>
              <p className="mt-1 text-xs text-slate-400">{d}</p>
            </li>
          ))}
        </ol>
      </Card>

      <Card className="mt-4" title={`Read tickets & reviews on ${provider}`}
        subtitle="Packs many messages into each request, stays under the provider's rate limits, then retrains the churn model. Progress is saved after every batch, so a stopped run resumes."
        action={
          <div className="flex flex-wrap gap-2">
            {plan && plan.pending === 0 && (
              <Button variant="ghost" disabled={!h?.llm_available || running || start.isPending} onClick={() => start.mutate(true)}>
                Re-read all
              </Button>
            )}
            <Button disabled={!h?.llm_available || running || start.isPending || plan?.pending === 0} onClick={() => start.mutate(false)}>
              {running ? "Running…" : plan && plan.pending < plan.total && plan.pending > 0 ? "Resume enrichment" : "Run enrichment"}
            </Button>
          </div>
        }>
        {!h?.llm_available && <p className="text-sm text-amber-300">The LLM is unavailable, so enrichment is disabled.</p>}
        {plan && !running && (
          <p className="text-sm text-slate-300">
            {plan.pending === 0
              ? `All ${plan.total.toLocaleString()} messages have been read by the LLM.`
              : <>
                  <b>{plan.pending.toLocaleString()}</b> of {plan.total.toLocaleString()} messages to read:{" "}
                  <b>{plan.requests}</b> requests × {plan.batch_size} messages
                  {plan.est_minutes != null && <> ≈ <b>{plan.est_minutes} min</b> at {plan.rpm} requests/min</>}.
                </>}
          </p>
        )}
        {start.error && <ErrorBox error={start.error} />}
        {status?.state === "error" && <ErrorBox error={status.error} />}
        {status && status.state !== "idle" && (
          <div className="mt-3">
            <div className="mb-1 flex justify-between text-xs text-slate-400">
              <span>{status.done.toLocaleString()} / {status.total.toLocaleString()} messages</span>
              <span>{pct(status.total ? status.done / status.total : 0)}</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-slate-800">
              <div className="h-full rounded-full bg-amd transition-all" style={{ width: pct(status.total ? status.done / status.total : 0) }} />
            </div>
          </div>
        )}
        {s && (
          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard label="Messages read" value={s.records.toLocaleString()}
              hint={`${s.requests} requests × up to ${s.batch_size} · ${s.seconds.toFixed(0)}s · ${s.failed} fell back`} />
            <KpiCard label="Throughput" value={`${Math.round(s.tokens_per_s).toLocaleString()} tok/s`} hint={`${s.records_per_s.toFixed(1)} messages/s`} tone="green" />
            <KpiCard label="Tokens" value={(s.prompt_tokens + s.completion_tokens).toLocaleString()} hint={`${s.prompt_tokens.toLocaleString()} in / ${s.completion_tokens.toLocaleString()} out`} />
            <KpiCard label="Model ROC-AUC" value={`${s.auc_before.toFixed(3)} → ${s.auc_after.toFixed(3)}`} hint={`orders-only baseline ${s.auc_orders_only.toFixed(3)}`} tone="green" />
          </div>
        )}
      </Card>

      {model && (
        <Card className="mt-4" title="How churn is predicted"
          subtitle={`Logistic regression · trained on ${model.n_train.toLocaleString()} customers · CV ROC-AUC ${model.auc_full.toFixed(3)} (orders only ${model.auc_orders_only.toFixed(3)})`}>
          <div className="grid gap-4 lg:grid-cols-2">
            <ol className="list-decimal space-y-1.5 pl-5 text-sm text-slate-300">
              <li>Rebuild every customer's features <b>as they were 90 days ago</b>, so nothing later leaks in.</li>
              <li>Label = 1 if they then placed <b>no order in the next 90 days</b>.</li>
              <li>Fit a logistic regression on order features plus the LLM's text features. Score it with 5-fold cross-validation.</li>
              <li>Apply the model to today's features to get P(churn in the next 90 days).</li>
              <li>Explain each customer with coefficient × standardised value.</li>
            </ol>
            <ContributionChart data={model.weights.map((w) => ({ label: w.label, value: w.weight }))} height={340} />
          </div>
        </Card>
      )}
    </>
  );
}
