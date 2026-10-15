import { Card } from "../../components/ui";

// Mirrors the ACTIONS table in retainiq/optimizer.py (shown so judges see the assumptions).
const ASSUMPTIONS = [
  { action: "Free shipping (30 days)", uplift: "8%", cost: "$6" },
  { action: "10% off next order", uplift: "14% × (0.5 + discount share)", cost: "10% × basket × 50% redeemed" },
  { action: "20% off next order", uplift: "24% × (0.5 + discount share)", cost: "20% × basket × 50% redeemed" },
  { action: "Personal call + fix", uplift: "30% if they complained, else 7.5%", cost: "$15" },
];

const FORMULAS: [string, string[]][] = [
  ["revenue_saved", ["P(churn)", "expected 90d revenue", "uplift(action, customer)"]],
  ["net_value", ["revenue_saved × margin", "− cost(action, customer)"]],
];

/** Each term is unbreakable, so on narrow screens the formula wraps between terms, never inside one. */
function Formula({ name, terms }: { name: string; terms: string[] }) {
  return (
    <p className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1">
      <span className="font-semibold text-strong">{name}</span>
      <span className="text-muted">=</span>
      {terms.map((t, i) => (
        <span key={t} className="whitespace-nowrap">
          {i > 0 && !t.startsWith("−") && <span className="mr-1.5 text-muted">×</span>}{t}
        </span>
      ))}
    </p>
  );
}

export function Assumptions({ className = "" }: { className?: string }) {
  return (
    <Card className={className} title="How the value is calculated" tour="value-calc">
      <div className="space-y-2 rounded-lg bg-sunken p-3 font-mono text-xs text-fg">
        {FORMULAS.map(([name, terms]) => <Formula key={name} name={name} terms={terms} />)}
      </div>

      {/* Phones: one stacked block per action. */}
      <dl className="mt-3 divide-y divide-line text-xs sm:hidden">
        {ASSUMPTIONS.map((a) => (
          <div key={a.action} className="py-2">
            <dt className="font-medium text-strong">{a.action}</dt>
            <dd className="mt-0.5 text-soft"><span className="text-muted">Uplift: </span>{a.uplift}</dd>
            <dd className="text-soft"><span className="text-muted">Cost: </span>{a.cost}</dd>
          </div>
        ))}
      </dl>

      {/* Wider screens: a table. */}
      <table className="mt-3 hidden w-full text-xs sm:table">
        <thead><tr className="text-left text-muted"><th className="py-1 pr-2 font-medium">Action</th><th className="pr-2 font-medium">Uplift (assumed)</th><th className="font-medium">Cost</th></tr></thead>
        <tbody className="divide-y divide-line text-soft">
          {ASSUMPTIONS.map((a) => (
            <tr key={a.action}><td className="py-1.5 pr-2">{a.action}</td><td className="pr-2">{a.uplift}</td><td>{a.cost}</td></tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-subtle">These uplift figures are assumptions. Replace them with your own A/B test results.</p>
    </Card>
  );
}
