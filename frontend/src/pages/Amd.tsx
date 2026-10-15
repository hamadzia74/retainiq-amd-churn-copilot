import { PageHeader, Stat, StatGrid } from "../components/ui";
import { EnrichmentPanel } from "../features/amd/EnrichmentPanel";
import { ModelExplainer } from "../features/amd/ModelExplainer";
import { PipelineSteps } from "../features/amd/PipelineSteps";
import { useHealth, useModel } from "../hooks/queries";
import { pct } from "../lib/format";

/** The one place that shows the LLM provider, model and quota. */
export default function Amd() {
  const { data: h } = useHealth();
  const { data: model } = useModel();
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

      <StatGrid tour="amd-status">
        <Stat label="Status" value={h?.llm_available ? "Online" : "Offline"} tone={h?.llm_available ? "green" : "amber"}
          hint={h?.llm_available ? provider : h?.llm_problem ?? undefined} />
        <Stat label="Model" value={<span className="text-base">{h?.llm_model ?? "-"}</span>} />
        <Stat label="Hardware" value={<span className="text-base text-amd-fg">{h?.llm_hardware ?? "-"}</span>}
          hint={q?.daily_cost_remaining_usd != null
            ? `quota left $${q.daily_cost_remaining_usd.toFixed(2)} of $${q.daily_cost_limit_usd?.toFixed(2)} today · ${q.rpm_limit} req/min`
            : undefined} />
        <Stat label="Signals from LLM" value={h ? pct(h.llm_share) : "-"} hint="rest: keyword fallback" />
      </StatGrid>

      <PipelineSteps provider={provider} />
      <EnrichmentPanel health={h} />
      {model && <ModelExplainer model={model} />}
    </>
  );
}
