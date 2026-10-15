export const STARTERS = [
  "Which VIP customers are at risk, and why?",
  "Plan a $500 retention campaign and summarise it.",
  "What are high-risk customers complaining about?",
  "Draft a win-back message for my riskiest VIP.",
];

export function StarterPrompts({ onPick, disabled }: { onPick: (text: string) => void; disabled: boolean }) {
  return (
    <div data-tour="starter-prompts" className="grid gap-2 sm:grid-cols-2">
      {STARTERS.map((s) => (
        <button key={s} type="button" disabled={disabled} onClick={() => onPick(s)}
          className="rounded-lg border border-line p-3 text-left text-sm text-soft transition-colors hover:border-amd/60 hover:bg-hover disabled:opacity-50">
          {s}
        </button>
      ))}
    </div>
  );
}
