import { useState } from "react";
import type { Tier } from "../api/types";
import { Button, Card, ErrorState, Loading, PageHeader, Source, Spinner } from "../components/ui";
import { CustomerList } from "../features/customers/CustomerList";
import { useAtRiskList } from "../hooks/queries";

const TIERS: (Tier | "")[] = ["", "VIP", "Regular", "Occasional"];
const SELECT = "w-full min-w-0 rounded-lg border border-line bg-panel px-2.5 py-1.5 text-sm text-fg max-sm:min-h-11 sm:w-auto";

export default function Customers() {
  const [tier, setTier] = useState<Tier | "">("");
  const [sort, setSort] = useState<"prob" | "value">("value");
  const { rows, error, isLoading, isFetching, hasMore, loadingMore, loadMore } = useAtRiskList(tier, sort);

  return (
    <>
      <PageHeader title="At-risk customers">
        Probability of placing no order in the next 90 days, from the churn model. The reasons are the
        features pushing each customer's score up the most.
      </PageHeader>

      <Card
        title={<span className="flex items-center gap-2">Customers {isFetching && !loadingMore && <Spinner className="h-3 w-3" />}</span>}
        action={<Source kind="ml" />}>
        {/* Filters: their own row - side by side on phones, right-aligned on wider screens. */}
        <div data-tour="customer-filters" className="mb-3 grid grid-cols-2 gap-2 sm:-mt-1 sm:flex sm:justify-end">
          <select aria-label="Tier" className={SELECT} value={tier} onChange={(e) => setTier(e.target.value as Tier | "")}>
            {TIERS.map((t) => <option key={t} value={t}>{t || "All tiers"}</option>)}
          </select>
          <select aria-label="Sort" className={SELECT} value={sort} onChange={(e) => setSort(e.target.value as "prob" | "value")}>
            <option value="value">Sort: $ at risk</option>
            <option value="prob">Sort: probability</option>
          </select>
        </div>

        {isLoading ? <Loading /> : error ? <ErrorState error={error} /> : (
          <>
            <CustomerList rows={rows ?? []} />
            {hasMore && (
              <Button variant="ghost" className="mt-3 w-full sm:w-auto" disabled={loadingMore} onClick={loadMore}>
                {loadingMore ? <><Spinner className="h-3 w-3" /> Loading…</> : "Show more"}
              </Button>
            )}
          </>
        )}
      </Card>
    </>
  );
}
