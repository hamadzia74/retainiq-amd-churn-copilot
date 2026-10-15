import { motion } from "motion/react";
import { Card } from "../../components/ui";
import { rowVariants } from "../../motion/variants";

const steps = (llm: string): [string, string, string][] => [
  [`LLM · ${llm}`, "Reads every ticket & review (en/es/de) → sentiment, complaint category, threat to leave", "border-amd/60"],
  ["Features", "Joins text signals with order history: recency, frequency trend, spend, discounts, returns", "border-line"],
  ["ML model", "Logistic regression → P(no order in next 90 days), explained per customer", "border-[var(--tone-sky-ring)]"],
  ["Optimizer", "Expected value per action → best offer per customer within the budget", "border-[var(--tone-green-ring)]"],
  [`LLM · ${llm}`, "Writes the win-back message in the customer's language and powers the Copilot", "border-amd/60"],
];

export function PipelineSteps({ provider }: { provider: string }) {
  return (
    <Card className="mt-4" title="Pipeline">
      <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {steps(provider).map(([title, text, border], i) => (
          <motion.li key={i} variants={rowVariants} custom={i} initial="hidden" animate="show"
            className={`rounded-lg border bg-sunken p-3 ${border}`}>
            <p className="text-xs font-semibold text-strong">{i + 1}. {title}</p>
            <p className="mt-1 text-xs text-muted">{text}</p>
          </motion.li>
        ))}
      </ol>
    </Card>
  );
}
