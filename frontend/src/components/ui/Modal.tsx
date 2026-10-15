import { AnimatePresence, motion } from "motion/react";
import { useEffect, type ReactNode } from "react";
import { EASE_OUT } from "../../motion/variants";

/** Centred dialog on wider screens, bottom sheet on phones. Esc or backdrop tap closes it. */
export function Modal({ open, onClose, label, children, className = "" }: {
  open: boolean; onClose: () => void; label: string; children: ReactNode; className?: string;
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

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
          <motion.div className="absolute inset-0 bg-black/50" onClick={onClose}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} />
          <motion.div role="dialog" aria-modal="true" aria-label={label}
            className={`relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-line bg-panel shadow-2xl sm:max-h-[85vh] sm:rounded-2xl ${className}`}
            initial={{ opacity: 0, y: 24, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.22, ease: EASE_OUT }}>
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
