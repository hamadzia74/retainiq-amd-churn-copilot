import { motion } from "motion/react";
import { EASE_OUT } from "../../motion/variants";

/** A horizontal bar (0..1) that grows in once and animates when the value changes. */
export function ProgressBar({ value, color = "var(--amd)", height = "h-1.5", className = "", delay = 0 }: {
  value: number; color?: string; height?: string; className?: string; delay?: number;
}) {
  const pct = `${Math.max(0, Math.min(1, value)) * 100}%`;
  return (
    <div className={`overflow-hidden rounded-full bg-track ${height} ${className}`}>
      <motion.div className="h-full rounded-full" style={{ background: color }}
        initial={{ width: 0 }} animate={{ width: pct }} transition={{ duration: 0.4, ease: EASE_OUT, delay }} />
    </div>
  );
}
