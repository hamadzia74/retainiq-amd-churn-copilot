import { Card } from "../../components/ui";

// Mirrors the ACTIONS table in retainiq/optimizer.py (shown so judges see the assumptions).
const ASSUMPTIONS = [
  ["Free shipping (30 days)", "8%", "$6"],
  ["10% off next order", "14% × (0.5 + discount share)", "10% × basket × 50% redeemed"],
  ["20% off next order", "24% × (0.5 + discount share)", "20% × basket × 50% redeemed"],
  ["Personal call + fix", "30% if they complained, else 7.5%", "$15"],
];

export function Assumptions({ className = "" }: { className?: string }) {
  return (
    <Card className={className} title="How the value is calculated">
      <pre className="overflow-x-auto rounded-lg bg-sunken p-3 text-xs text-fg">
{`revenue_saved = P(churn) × expected 90d revenue × uplift(action, customer)
net_value     = revenue_saved × margin − cost(action, customer)`}
      </pre>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[480px] text-xs">
          <thead><tr className="text-left text-muted"><th className="py-1">Action</th><th>Uplift (assumed)</th><th>Cost</th></tr></thead>
          <tbody className="divide-y divide-line text-soft">
            {ASSUMPTIONS.map(([a, u, c]) => <tr key={a}><td className="py-1.5 pr-2">{a}</td><td className="pr-2">{u}</td><td>{c}</td></tr>)}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-subtle">These uplift figures are assumptions. Replace them with your own A/B test results.</p>
    </Card>
  );
}
