import type {
  AtRiskRow, Customer360, Dashboard, EnrichStatus, Health, ModelInfo, Plan, Tier, WinBackMessage,
} from "./types";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
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
  limit?: number;
  tier?: Tier | "";
  sort?: "prob" | "value";
}

export const api = {
  health: () => request<Health>("/health"),
  dashboard: () => request<Dashboard>("/dashboard"),
  atRisk: ({ limit = 25, tier, sort = "prob" }: AtRiskParams = {}) => {
    const q = new URLSearchParams({ limit: String(limit), sort });
    if (tier) q.set("tier", tier);
    return request<AtRiskRow[]>(`/customers/at-risk?${q}`);
  },
  customer: (id: string) => request<Customer360>(`/customers/${encodeURIComponent(id)}`),
  message: (id: string) => request<WinBackMessage>(`/customers/${encodeURIComponent(id)}/message`, { method: "POST" }),
  plan: (budget: number) => request<Plan>("/campaigns/plan", { method: "POST", body: JSON.stringify({ budget }) }),
  model: () => request<ModelInfo>("/model"),
  startEnrich: (force = false) => request<EnrichStatus>(`/enrich?force=${force}`, { method: "POST" }),
  enrichStatus: () => request<EnrichStatus>("/enrich/status"),
  resetChat: (sessionId: string) => request<void>(`/agent/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" }),
};
