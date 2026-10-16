import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";

const CONTROL = "w-full rounded-lg border border-line bg-field px-3 py-2 text-sm text-strong placeholder:text-subtle " +
  "transition-colors focus:border-amd/60 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 max-md:min-h-11";

/** Labelled text input. `hint` sits under it; `action` sits at the right of the label (e.g. "Generate"). */
export const TextField = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & {
  label: string; hint?: ReactNode; action?: ReactNode;
}>(function TextField({ label, hint, action, className = "", id, ...props }, ref) {
  const auto = useId();
  const inputId = id ?? auto;
  return (
    <div className={className}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <label htmlFor={inputId} className="text-xs font-medium text-soft">{label}</label>
        {action}
      </div>
      <input ref={ref} id={inputId} className={CONTROL} {...props} />
      {hint && <p className="mt-1 text-[11px] text-subtle">{hint}</p>}
    </div>
  );
});

/** Labelled select. */
export function SelectField({ label, children, className = "", id, ...props }: SelectHTMLAttributes<HTMLSelectElement> & {
  label: string; children: ReactNode;
}) {
  const auto = useId();
  const selectId = id ?? auto;
  return (
    <div className={className}>
      <label htmlFor={selectId} className="mb-1 block text-xs font-medium text-soft">{label}</label>
      <select id={selectId} className={CONTROL} {...props}>{children}</select>
    </div>
  );
}
