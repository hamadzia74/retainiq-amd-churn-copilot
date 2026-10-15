import { AnimatePresence, motion } from "motion/react";
import { useEffect, type ReactNode } from "react";
import { EASE_OUT } from "../../motion/variants";

/** Slide-in panel over a dimmed backdrop. Esc or backdrop tap closes it. */
export function Drawer({ open, onClose, label, side = "left", children }: {
  open: boolean; onClose: () => void; label: string; side?: "left" | "right"; children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  const offscreen = side === "left" ? "-100%" : "100%";
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50">
          <motion.div className="absolute inset-0 bg-black/50" onClick={onClose}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} />
          <motion.aside role="dialog" aria-modal="true" aria-label={label}
            className={`absolute inset-y-0 flex w-[min(340px,88vw)] flex-col border-line bg-panel pb-[env(safe-area-inset-bottom)] ${
              side === "left" ? "left-0 border-r" : "right-0 border-l"}`}
            initial={{ x: offscreen }} animate={{ x: 0 }} exit={{ x: offscreen }} transition={{ duration: 0.24, ease: EASE_OUT }}>
            {children}
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
