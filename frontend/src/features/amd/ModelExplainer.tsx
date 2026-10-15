import type { ModelInfo } from "../../api/types";
import { ContributionChart } from "../../components/charts";
import { Card } from "../../components/ui";
import { useIsMobile } from "../../hooks/useMediaQuery";

export function ModelExplainer({ model }: { model: ModelInfo }) {
  const isMobile = useIsMobile();
  return (
    <Card className="mt-4" title="How churn is predicted"
      subtitle={`Logistic regression · trained on ${model.n_train.toLocaleString()} customers · CV ROC-AUC ${model.auc_full.toFixed(3)} (orders only ${model.auc_orders_only.toFixed(3)})`}>
      <div className="grid gap-4 lg:grid-cols-2">
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-soft">
          <li>Rebuild every customer's features <b className="text-strong">as they were 90 days ago</b>, so nothing later leaks in.</li>
          <li>Label = 1 if they then placed <b className="text-strong">no order in the next 90 days</b>.</li>
          <li>Fit a logistic regression on order features plus the LLM's text features. Score it with 5-fold cross-validation.</li>
          <li>Apply the model to today's features to get P(churn in the next 90 days).</li>
          <li>Explain each customer with coefficient × standardised value.</li>
        </ol>
        <ContributionChart data={model.weights.map((w) => ({ label: w.label, value: w.weight }))}
          height={isMobile ? 280 : 340} unit="weight" />
      </div>
    </Card>
  );
}
