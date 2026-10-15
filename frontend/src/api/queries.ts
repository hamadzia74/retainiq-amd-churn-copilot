// The data layer's single source of truth: cache keys and query options.
// Components never build keys or fetchers themselves, so identical data needs
// always share one cached request.
import { infiniteQueryOptions, keepPreviousData, queryOptions } from "@tanstack/react-query";
import { api, ApiError, type AtRiskParams } from "./client";

export const PAGE_SIZE = 25;
export const MAX_ROWS = 200;
export const HEALTH_INTERVAL_MS = 60_000;

/**
 * Everything derived from the churn model (dashboard, customers, plans, weights) only
 * changes when an enrichment run retrains it - and that run invalidates the cache once
 * when it finishes. So this data never goes stale on a timer.
 */
const MODEL_DATA = { staleTime: Infinity, gcTime: 30 * 60_000 } as const;

export const queryKeys = {
  health: ["health"] as const,
  dashboard: ["dashboard"] as const,
  atRisk: (tier: AtRiskParams["tier"] = "", sort: AtRiskParams["sort"] = "value") => ["at-risk", { tier, sort }] as const,
  customer: (id: string) => ["customer", id.toUpperCase()] as const,
  plan: (budget: number) => ["plan", budget] as const,
  model: ["model"] as const,
  enrichStatus: ["enrich-status"] as const,
};

/** 4xx means the request itself is wrong (e.g. unknown customer): retrying can't help. */
export const shouldRetry = (failureCount: number, error: unknown) =>
  !(error instanceof ApiError && error.status < 500) && failureCount < 1;

export const healthQuery = () => queryOptions({
  queryKey: queryKeys.health,
  queryFn: ({ signal }) => api.health(signal),
  staleTime: HEALTH_INTERVAL_MS / 2,
  refetchInterval: HEALTH_INTERVAL_MS,        // at most once a minute ...
  refetchIntervalInBackground: false,          // ... and only while the tab is visible
});

export const dashboardQuery = () => queryOptions({
  queryKey: queryKeys.dashboard,
  queryFn: ({ signal }) => api.dashboard(signal),
  ...MODEL_DATA,
});

/** The at-risk list, paged: "Show more" fetches only the next page, never the rows already shown. */
export const atRiskQuery = (tier: AtRiskParams["tier"] = "", sort: AtRiskParams["sort"] = "value") => infiniteQueryOptions({
  queryKey: queryKeys.atRisk(tier, sort),
  queryFn: ({ pageParam, signal }) => api.atRisk({ tier, sort, limit: PAGE_SIZE, offset: pageParam }, signal),
  initialPageParam: 0,
  getNextPageParam: (last, pages) => {
    const loaded = pages.reduce((n, p) => n + p.length, 0);
    return last.length === PAGE_SIZE && loaded < MAX_ROWS ? loaded : undefined;
  },
  placeholderData: keepPreviousData,
  ...MODEL_DATA,
});

export const customerQuery = (id: string) => queryOptions({
  queryKey: queryKeys.customer(id),
  queryFn: ({ signal }) => api.customer(id, signal),
  enabled: !!id,
  ...MODEL_DATA,
});

export const planQuery = (budget: number) => queryOptions({
  queryKey: queryKeys.plan(budget),
  queryFn: ({ signal }) => api.plan(budget, signal),
  placeholderData: keepPreviousData,
  ...MODEL_DATA,
});

export const modelQuery = () => queryOptions({
  queryKey: queryKeys.model,
  queryFn: ({ signal }) => api.model(signal),
  ...MODEL_DATA,
});
