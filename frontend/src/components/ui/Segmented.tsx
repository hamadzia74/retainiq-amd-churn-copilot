import { motion } from "motion/react";
import { useId, type ReactNode } from "react";
import { SPRING } from "../../motion/variants";

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  title?: string;
}

/** Segmented control; the selected pill slides between options. */
export function Segmented<T extends string>({ options, value, onChange, ariaLabel, className = "" }: {
  options: SegmentOption<T>[]; value: T; onChange: (value: T) => void; ariaLabel: string; className?: string;
}) {
  const id = useId();
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={`flex rounded-lg border border-line bg-sunken p-0.5 ${className}`}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button key={o.value} type="button" role="radio" aria-checked={active} title={o.title} aria-label={o.title}
            onClick={() => onChange(o.value)}
            className={`relative flex h-8 flex-1 items-center justify-center rounded-md text-xs font-medium transition-colors max-md:h-10 ${
              active ? "text-strong" : "text-muted hover:text-fg"}`}>
            {active && <motion.span layoutId={`segment-${id}`} transition={SPRING}
              className="absolute inset-0 rounded-md border border-line bg-panel" />}
            <span className="relative z-10 inline-flex items-center gap-1.5">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
