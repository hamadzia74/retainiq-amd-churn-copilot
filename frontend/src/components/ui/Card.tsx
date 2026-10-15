import type { ReactNode } from "react";

export interface CardHeaderProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}

export function CardHeader({ title, subtitle, action }: CardHeaderProps) {
  if (!title && !action) return null;
  return (
    <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        {title && <h2 className="text-sm font-semibold text-strong">{title}</h2>}
        {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

/** Panel surface. Pass title/subtitle/action for the standard header; `tour` anchors a guided-tour step. */
export function Card({ title, subtitle, action, children, className = "", padded = true, tour }: CardHeaderProps & {
  children: ReactNode; className?: string; padded?: boolean; tour?: string;
}) {
  return (
    <section data-tour={tour} className={`min-w-0 rounded-xl border border-line bg-panel ${padded ? "p-4 sm:p-5" : ""} ${className}`}>
      <CardHeader title={title} subtitle={subtitle} action={action} />
      {children}
    </section>
  );
}

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-5">
      <h1 className="text-xl font-semibold text-strong sm:text-2xl">{title}</h1>
      {children && <p className="mt-1 max-w-3xl text-sm text-muted">{children}</p>}
    </div>
  );
}
