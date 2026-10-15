// Loading, empty, error and notice states - one look for each, everywhere.
import type { CSSProperties, ReactNode } from "react";

export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return <span className={`inline-block animate-spin rounded-full border-2 border-spinner border-t-amd ${className}`} />;
}

export function Loading({ what = "Loading" }: { what?: string }) {
  return (
    <div className="flex items-center gap-2 py-10 text-sm text-muted">
      <Spinner />
      {what}…
    </div>
  );
}

export function Skeleton({ className = "", style }: { className?: string; style?: CSSProperties }) {
  return <div className={`animate-pulse rounded-lg bg-sunken ${className}`} style={style} />;
}

export function ErrorState({ error }: { error: unknown }) {
  return (
    <div role="alert" className="rounded-lg border border-error-line bg-error-bg p-3 text-sm text-error-fg">
      {error instanceof Error ? error.message : String(error)}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="text-sm text-subtle">{children}</p>;
}

/** Inline warning, e.g. "LLM unavailable". */
export function Notice({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-notice-line bg-notice-bg px-3 py-2 text-xs text-notice-fg ${className}`}>
      {children}
    </div>
  );
}
