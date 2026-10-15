import { AnimatePresence, motion } from "motion/react";
import type { Customer360 } from "../../api/types";
import { Button, Card, ErrorState, Source } from "../../components/ui";
import { useHealth, useMessage } from "../../hooks/queries";
import { LANGUAGE } from "../../lib/format";
import { fadeUp } from "../../motion/variants";

/** Drafts the personal win-back message (LLM on AMD, or a labelled template when offline). */
export function WinBackCard({ customer }: { customer: Customer360 }) {
  const { data: health } = useHealth();
  const draft = useMessage();
  const msg = draft.data?.customer_id === customer.customer_id ? draft.data : undefined;
  const lang = LANGUAGE[customer.language] ?? customer.language;

  return (
    <Card title="Win-back message" subtitle={`Written in ${lang}, with the offer above`}
      action={msg && <Source kind={msg.source} />}>
      <AnimatePresence mode="wait" initial={false}>
        {msg ? (
          <motion.p key={msg.message} variants={fadeUp} initial="hidden" animate="show" exit="exit"
            className="whitespace-pre-line rounded-lg bg-sunken p-3 text-sm leading-relaxed text-fg">
            {msg.message}
          </motion.p>
        ) : draft.error ? <ErrorState error={draft.error} /> : (
          <p className="text-sm text-muted">
            {health?.llm_available
              ? "The LLM on AMD writes a personal message that names their complaint."
              : "LLM offline: you'll get a plain template, clearly labelled as one."}
          </p>
        )}
      </AnimatePresence>
      <Button className="mt-3" disabled={draft.isPending} onClick={() => draft.mutate(customer.customer_id)}>
        {draft.isPending ? "Writing…" : msg ? "Rewrite" : health?.llm_available ? "Draft message on AMD" : "Draft from template"}
      </Button>
    </Card>
  );
}
