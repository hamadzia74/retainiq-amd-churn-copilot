// Small building blocks used by every page.

import type { ReactNode } from "react";

export function Card({ title, subtitle, action, children, className = "" }: {
  title?: ReactNode; subtitle?: ReactNode; action?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <section className={`rounded-xl border border-line bg-panel p-4 sm:p-5 ${className}`}>
      {(title || action) && (
        <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            {title && <h2 className="text-sm font-semibold text-white">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-5">
      <h1 className="text-xl font-semibold text-white sm:text-2xl">{title}</h1>
      {children && <p className="mt-1 max-w-3xl text-sm text-slate-400">{children}</p>}
    </div>
  );
}

export function Loading({ what = "Loading" }: { what?: string }) {
  return (
    <div className="flex items-center gap-2 py-10 text-sm text-slate-400">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-600 border-t-amd" />
      {what}…
    </div>
  );
}

export function ErrorBox({ error }: { error: unknown }) {
  return (
    <div className="rounded-lg border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">
      {error instanceof Error ? error.message : String(error)}
    </div>
  );
}

const BADGE = {
  red: "bg-red-500/15 text-red-300 ring-red-500/30",
  amber: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  green: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  violet: "bg-violet-500/15 text-violet-300 ring-violet-500/30",
  sky: "bg-sky-500/15 text-sky-300 ring-sky-500/30",
  slate: "bg-slate-500/15 text-slate-300 ring-slate-500/30",
};

export function Badge({ tone = "slate", children }: { tone?: keyof typeof BADGE; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ${BADGE[tone]}`}>
      {children}
    </span>
  );
}

export function Button({ children, variant = "primary", className = "", ...props }:
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" }) {
  const look = variant === "primary"
    ? "bg-amd text-white hover:bg-amd-dark disabled:bg-slate-700 disabled:text-slate-400"
    : "border border-line text-slate-200 hover:bg-white/5 disabled:text-slate-500";
  return (
    <button {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition disabled:cursor-not-allowed ${look} ${className}`}>
      {children}
    </button>
  );
}

/** Tag showing where a number came from - the LLM on AMD, or the ML model. */
export function Source({ kind }: { kind: "llm" | "ml" | "template" | "heuristic" }) {
  const map = {
    llm: ["red", "LLM · AMD"],
    ml: ["sky", "ML model"],
    template: ["slate", "Template · LLM offline"],
    heuristic: ["slate", "Keyword fallback"],
  } as const;
  const [tone, text] = map[kind];
  return <Badge tone={tone}>{text}</Badge>;
}
