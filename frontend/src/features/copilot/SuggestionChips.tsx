import { CornerDownRight } from "lucide-react";
import { motion } from "motion/react";
import { Skeleton } from "../../components/ui";
import { rowVariants } from "../../motion/variants";

/** Follow-up questions under the latest answer. Tapping one sends it to the Copilot straight away. */
export function SuggestionChips({ items, loading, disabled, onPick }: {
  items?: string[]; loading?: boolean; disabled: boolean; onPick: (text: string) => void;
}) {
  if (!loading && !items?.length) return null;
  return (
    <div data-tour="copilot-suggestions" className="mt-3" aria-live="polite">
      <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-subtle">Suggested next</p>
      <div className="flex flex-wrap gap-2">
        {loading
          ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-9 w-36 rounded-full sm:w-44" />)
          : items!.map((text, i) => (
            <motion.button key={text} type="button" disabled={disabled} onClick={() => onPick(text)}
              variants={rowVariants} custom={i} initial="hidden" animate="show"
              className="inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-full border border-line bg-panel px-3 py-1.5 text-left text-xs text-soft transition-colors hover:border-amd/60 hover:text-strong disabled:cursor-not-allowed disabled:opacity-50 max-md:min-h-11">
              <CornerDownRight size={13} className="shrink-0 text-amd-fg" aria-hidden />
              <span>{text}</span>
            </motion.button>
          ))}
      </div>
    </div>
  );
}
