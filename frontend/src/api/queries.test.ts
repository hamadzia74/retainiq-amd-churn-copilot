import { InfiniteQueryObserver, QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./client";
import { atRiskQuery, healthQuery, HEALTH_INTERVAL_MS, PAGE_SIZE, planQuery, queryKeys, shouldRetry } from "./queries";

let calls: string[];

beforeEach(() => {
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? "GET"} ${url}${init?.body ? ` ${init.body}` : ""}`);
    const u = new URL(url, "http://x");
    if (u.pathname === "/api/customers/at-risk") {
      const offset = Number(u.searchParams.get("offset") ?? 0);
      const rows = Array.from({ length: PAGE_SIZE }, (_, i) => ({ customer_id: `C${offset + i}` }));
      return new Response(JSON.stringify(rows));
    }
    return new Response(JSON.stringify({ ok: true }));
  }));
});
afterEach(() => vi.unstubAllGlobals());

const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

describe("data layer", () => {
  it("shares one health request between all consumers", async () => {
    const qc = client();
    await Promise.all([qc.fetchQuery(healthQuery()), qc.fetchQuery(healthQuery()), qc.fetchQuery(healthQuery())]);
    await qc.fetchQuery(healthQuery());                               // still fresh: served from cache
    expect(calls).toEqual(["GET /api/health"]);
  });

  it("polls health at most once a minute, and only while the tab is visible", () => {
    const opts = healthQuery();
    expect(opts.refetchInterval).toBe(HEALTH_INTERVAL_MS);
    expect(HEALTH_INTERVAL_MS).toBeGreaterThanOrEqual(60_000);
    expect(opts.refetchIntervalInBackground).toBe(false);
  });

  it("caches plans per budget: revisiting a budget costs nothing", async () => {
    const qc = client();
    await qc.fetchQuery(planQuery(1000));
    await qc.fetchQuery(planQuery(1500));
    await qc.fetchQuery(planQuery(1000));
    expect(calls).toEqual([
      'POST /api/campaigns/plan {"budget":1000}',
      'POST /api/campaigns/plan {"budget":1500}',
    ]);
    expect(planQuery(1).staleTime).toBe(Infinity);                    // only enrichment invalidates model data
  });

  it("'Show more' fetches only the next page, never rows already shown", async () => {
    const qc = client();
    // Same path as the UI: an observer on the query, then fetchNextPage() for "Show more".
    const observer = new InfiniteQueryObserver(qc, atRiskQuery("", "value"));
    const unsubscribe = observer.subscribe(() => {});
    await qc.fetchInfiniteQuery(atRiskQuery("", "value"));
    const more = await observer.fetchNextPage();
    unsubscribe();
    expect(more.data?.pages.flat()).toHaveLength(PAGE_SIZE * 2);
    expect(calls).toEqual([
      "GET /api/customers/at-risk?limit=25&sort=value",
      "GET /api/customers/at-risk?limit=25&sort=value&offset=25",
    ]);
  });

  it("stops paging when a page comes back short", () => {
    const opts = atRiskQuery("VIP", "prob");
    expect(opts.getNextPageParam!([{}] as never, [[{}]] as never, 0, [0])).toBeUndefined();
  });

  it("does not retry client errors, retries a server error once", () => {
    expect(shouldRetry(0, new ApiError(404, "nope"))).toBe(false);
    expect(shouldRetry(0, new ApiError(503, "busy"))).toBe(true);
    expect(shouldRetry(1, new ApiError(503, "busy"))).toBe(false);
  });

  it("customer cache keys ignore id case, so C0139 and c0139 share one request", () => {
    expect(queryKeys.customer("c0139")).toEqual(queryKeys.customer("C0139"));
  });
});
