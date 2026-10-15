import type { Health } from "../../api/types";
import { Button, Card, ErrorState, Notice, ProgressBar, Stat, StatGrid } from "../../components/ui";
import { useEnrichJob } from "../../hooks/useEnrichJob";
import { pct } from "../../lib/format";

/** Start/resume the LLM enrichment job on AMD, watch progress, see the results. */
export function EnrichmentPanel({ health }: { health?: Health }) {
  const { status, start } = useEnrichJob();
  const running = status?.state === "running";
  const plan = status?.plan;
  const s = status?.stats;
  const provider = health?.llm_provider_name ?? "AMD";
  const canRun = !!health?.llm_available && !running && !start.isPending;
  const progress = status?.total ? status.done / status.total : 0;

  return (
    <Card className="mt-4" tour="amd-enrichment" title={`Read tickets & reviews on ${provider}`}
      subtitle="Packs many messages into each request, stays under the provider's rate limits, then retrains the churn model. Progress is saved after every batch, so a stopped run resumes."
      action={
        <div className="flex flex-wrap gap-2">
          {plan?.pending === 0 && (
            <Button variant="ghost" disabled={!canRun} onClick={() => start.mutate(true)}>Re-read all</Button>
          )}
          <Button disabled={!canRun || plan?.pending === 0} onClick={() => start.mutate(false)}>
            {running ? "Running…" : plan && plan.pending > 0 && plan.pending < plan.total ? "Resume enrichment" : "Run enrichment"}
          </Button>
        </div>
      }>
      {!health?.llm_available && <Notice className="mb-3">The LLM is unavailable, so enrichment is disabled.</Notice>}

      {plan && !running && (
        <p className="text-sm text-soft">
          {plan.pending === 0
            ? `All ${plan.total.toLocaleString()} messages have been read by the LLM.`
            : <>
                <b className="text-strong">{plan.pending.toLocaleString()}</b> of {plan.total.toLocaleString()} messages to read:{" "}
                <b className="text-strong">{plan.requests}</b> requests × {plan.batch_size} messages
                {plan.est_minutes != null && <> ≈ <b className="text-strong">{plan.est_minutes} min</b> at {plan.rpm} requests/min</>}.
              </>}
        </p>
      )}

      {start.error && <div className="mt-3"><ErrorState error={start.error} /></div>}
      {status?.state === "error" && <div className="mt-3"><ErrorState error={status.error} /></div>}

      {status && status.state !== "idle" && (
        <div className="mt-3">
          <div className="mb-1 flex justify-between text-xs text-muted">
            <span className="tabular-nums">{status.done.toLocaleString()} / {status.total.toLocaleString()} messages</span>
            <span className="tabular-nums">{pct(progress)}</span>
          </div>
          <ProgressBar value={progress} height="h-2.5" />
        </div>
      )}

      {s && (
        <StatGrid className="mt-4">
          <Stat label="Messages read" value={s.records.toLocaleString()}
            hint={`${s.requests} requests × up to ${s.batch_size} · ${s.seconds.toFixed(0)}s · ${s.failed} fell back`} />
          <Stat label="Throughput" tone="green" value={`${Math.round(s.tokens_per_s).toLocaleString()} tok/s`} hint={`${s.records_per_s.toFixed(1)} messages/s`} />
          <Stat label="Tokens" value={(s.prompt_tokens + s.completion_tokens).toLocaleString()}
            hint={`${s.prompt_tokens.toLocaleString()} in / ${s.completion_tokens.toLocaleString()} out`} />
          <Stat label="Model ROC-AUC" tone="green" value={`${s.auc_before.toFixed(3)} → ${s.auc_after.toFixed(3)}`}
            hint={`orders-only baseline ${s.auc_orders_only.toFixed(3)}`} />
        </StatGrid>
      )}
    </Card>
  );
}
