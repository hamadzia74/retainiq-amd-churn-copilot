// Shared animation vocabulary. Pages use these, never their own timings.
import type { Variants } from "motion/react";

export const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];

/** Route change: fade in with a slight rise. */
export const pageVariants: Variants = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: { duration: 0.18, ease: EASE_OUT } },
};

/** List / table rows. Pass the row index as `custom`; only the first 12 rows are delayed. */
export const rowVariants: Variants = {
  hidden: { opacity: 0, y: 4 },
  show: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.2, ease: EASE_OUT, delay: Math.min(i, 12) * 0.025 },
  }),
};

/** Small pieces that pop in and out (chat messages, floating buttons). */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: { duration: 0.18, ease: EASE_OUT } },
  exit: { opacity: 0, y: 6, transition: { duration: 0.12 } },
};

export const SPRING = { type: "spring", stiffness: 500, damping: 40 } as const;
