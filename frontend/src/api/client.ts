import type {
  AtRiskRow, Customer360, Dashboard, EnrichStatus, Health, ModelInfo, Plan, SuggestionList, Tier, WinBackMessage,
} from "./types";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Every request takes an optional AbortSignal, so superseded requests are cancelled. */
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers },
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch {
      /* not JSON */
    }
    throw new ApiError(res.status, detail);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

export interface AtRiskParams {
  tier?: Tier | "";
  sort?: "prob" | "value";
  limit?: number;
  offset?: number;
}

type Signal = AbortSignal | undefined;

export const api = {
  health: (signal?: Signal) => request<Health>("/health", { signal }),
  dashboard: (signal?: Signal) => request<Dashboard>("/dashboard", { signal }),
  atRisk: ({ tier, sort = "prob", limit = 25, offset = 0 }: AtRiskParams = {}, signal?: Signal) => {
    const q = new URLSearchParams({ limit: String(limit), sort });
    if (offset) q.set("offset", String(offset));
    if (tier) q.set("tier", tier);
    return request<AtRiskRow[]>(`/customers/at-risk?${q}`, { signal });
  },
  customer: (id: string, signal?: Signal) => request<Customer360>(`/customers/${encodeURIComponent(id)}`, { signal }),
  message: (id: string) => request<WinBackMessage>(`/customers/${encodeURIComponent(id)}/message`, { method: "POST" }),
  plan: (budget: number, signal?: Signal) =>
    request<Plan>("/campaigns/plan", { method: "POST", body: JSON.stringify({ budget }), signal }),
  model: (signal?: Signal) => request<ModelInfo>("/model", { signal }),
  startEnrich: (force = false) => request<EnrichStatus>(`/enrich?force=${force}`, { method: "POST" }),
  enrichStatus: (signal?: Signal) => request<EnrichStatus>("/enrich/status", { signal }),
  /** Follow-up questions for the session's latest exchange (one call per finished answer). */
  suggestions: (sessionId: string, signal?: Signal) =>
    request<SuggestionList>("/agent/suggestions", { method: "POST", body: JSON.stringify({ session_id: sessionId }), signal }),
  resetChat: (sessionId: string) => request<void>(`/agent/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" }),
};
