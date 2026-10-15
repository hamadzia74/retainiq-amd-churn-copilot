import type { ReactNode } from "react";

export type Tone = "red" | "amber" | "green" | "violet" | "sky" | "slate";

const TONES: Record<Tone, string> = {
  red: "bg-[var(--tone-red-bg)] text-[var(--tone-red-fg)] ring-[var(--tone-red-ring)]",
  amber: "bg-[var(--tone-amber-bg)] text-[var(--tone-amber-fg)] ring-[var(--tone-amber-ring)]",
  green: "bg-[var(--tone-green-bg)] text-[var(--tone-green-fg)] ring-[var(--tone-green-ring)]",
  violet: "bg-[var(--tone-violet-bg)] text-[var(--tone-violet-fg)] ring-[var(--tone-violet-ring)]",
  sky: "bg-[var(--tone-sky-bg)] text-[var(--tone-sky-fg)] ring-[var(--tone-sky-ring)]",
  slate: "bg-[var(--tone-slate-bg)] text-[var(--tone-slate-fg)] ring-[var(--tone-slate-ring)]",
};

export function Badge({ tone = "slate", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[tone]}`}>
      {children}
    </span>
  );
}

export type SourceKind = "llm" | "ml" | "template" | "heuristic";

const SOURCES: Record<SourceKind, [Tone, string]> = {
  llm: ["red", "LLM · AMD"],
  ml: ["sky", "ML model"],
  template: ["slate", "Template · LLM offline"],
  heuristic: ["slate", "Keyword fallback"],
};

/** Tag showing where a number came from - the LLM on AMD, or the ML model. */
export function Source({ kind }: { kind: SourceKind }) {
  const [tone, text] = SOURCES[kind];
  return <Badge tone={tone}>{text}</Badge>;
}
