import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";
import type { AtRiskParams } from "../api/client";
import { api } from "../api/client";
import {
  atRiskQuery, customerQuery, dashboardQuery, healthQuery, modelQuery, planQuery,
} from "../api/queries";

export const useHealth = () => useQuery(healthQuery());
export const useDashboard = () => useQuery(dashboardQuery());
export const useCustomer = (id: string) => useQuery(customerQuery(id));
export const usePlan = (budget: number) => useQuery(planQuery(budget));
export const useModel = () => useQuery(modelQuery());
export const useMessage = () => useMutation({ mutationFn: api.message });

/** The paged at-risk list, flattened. `loadMore` fetches only the next page. */
export function useAtRiskList(tier: AtRiskParams["tier"] = "", sort: AtRiskParams["sort"] = "value") {
  const q = useInfiniteQuery(atRiskQuery(tier, sort));
  return {
    rows: q.data?.pages.flat(),
    error: q.error,
    isLoading: q.isLoading,
    isFetching: q.isFetching,
    hasMore: q.hasNextPage,
    loadingMore: q.isFetchingNextPage,
    loadMore: () => q.fetchNextPage(),
  };
}

/**
 * The dashboard's top 5 by $ at risk. It reads the first page of the Customers list
 * (same sort), so opening Customers afterwards costs no extra request.
 */
export function useTopAtRisk(n = 5) {
  const { rows } = useAtRiskList("", "value");
  return rows?.slice(0, n);
}
