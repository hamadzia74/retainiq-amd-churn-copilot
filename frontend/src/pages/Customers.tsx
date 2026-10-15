import { useState } from "react";
import type { Tier } from "../api/types";
import { Card, ErrorState, Loading, PageHeader, Source, Spinner } from "../components/ui";
import { CustomerList } from "../features/customers/CustomerList";
import { useAtRisk } from "../hooks/queries";

const TIERS: (Tier | "")[] = ["", "VIP", "Regular", "Occasional"];
const SELECT = "rounded-lg border border-line bg-panel px-2.5 py-1.5 text-sm text-fg max-md:min-h-11";

export default function Customers() {
  const [tier, setTier] = useState<Tier | "">("");
  const [sort, setSort] = useState<"prob" | "value">("value");
  const [limit, setLimit] = useState(25);
  const { data, error, isLoading, isFetching } = useAtRisk({ tier, sort, limit });

  return (
    <>
      <PageHeader title="At-risk customers">
        Probability of placing no order in the next 90 days, from the churn model. The reasons are the
        features pushing each customer's score up the most.
      </PageHeader>

      <Card
        title={<span className="flex items-center gap-2">Customers {isFetching && <Spinner className="h-3 w-3" />}</span>}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Source kind="ml" />
            <select aria-label="Tier" className={SELECT} value={tier} onChange={(e) => setTier(e.target.value as Tier | "")}>
              {TIERS.map((t) => <option key={t} value={t}>{t || "All tiers"}</option>)}
            </select>
            <select aria-label="Sort" className={SELECT} value={sort} onChange={(e) => setSort(e.target.value as "prob" | "value")}>
              <option value="value">Sort: $ at risk</option>
              <option value="prob">Sort: probability</option>
            </select>
          </div>
        }>
        {isLoading ? <Loading /> : error ? <ErrorState error={error} /> : (
          <>
            <CustomerList rows={data!} />
            {data!.length === limit && limit < 200 && (
              <button type="button" onClick={() => setLimit((l) => Math.min(l + 25, 200))}
                className="mt-3 text-sm text-amd-fg hover:underline max-md:min-h-11">
                Show more
              </button>
            )}
          </>
        )}
      </Card>
    </>
  );
}
