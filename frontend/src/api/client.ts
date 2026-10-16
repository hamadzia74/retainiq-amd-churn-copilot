import type {
  AtRiskRow, AuthConfig, ChatDetail, ChatSummary, Customer360, Dashboard, EnrichStatus, Health, Me, ModelInfo, NewUser, Plan,
  SuggestionList, Tier, Transcript, UserRow, UserUpdate, WinBackMessage,
} from "./types";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/**
 * Sent with every request. The session cookie rides along automatically, so the server only accepts
 * state-changing requests that also carry this header - which a cross-site form can't add (CSRF).
 */
export const APP_HEADER = { "X-RetainIQ": "1" } as const;

// Told when the server says the session is gone (expired, signed out elsewhere, deactivated).
let onSignedOut: () => void = () => {};
export function setSignedOutHandler(fn: () => void) {
  onSignedOut = fn;
}

/** Turn a failed response into an ApiError (and report a lost session). */
export async function failure(res: Response, path: string): Promise<ApiError> {
  let detail = res.statusText;
  try {
    const body = await res.json();
    detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
  } catch {
    /* not JSON */
  }
  if (res.status === 401 && !path.startsWith("/auth/")) onSignedOut();
  return new ApiError(res.status, detail);
}

/** Every request takes an optional AbortSignal, so superseded requests are cancelled. */
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: "same-origin",
    ...init,
    headers: { "Content-Type": "application/json", ...APP_HEADER, ...init.headers },
  });
  if (!res.ok) throw await failure(res, path);
  return res.status === 204 ? (undefined as T) : res.json();
}

const post = <T>(path: string, body?: unknown, signal?: Signal) =>
  request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body), signal });

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
  message: (id: string) => post<WinBackMessage>(`/customers/${encodeURIComponent(id)}/message`),
  plan: (budget: number, signal?: Signal) => post<Plan>("/campaigns/plan", { budget }, signal),
  model: (signal?: Signal) => request<ModelInfo>("/model", { signal }),
  startEnrich: (force = false) => post<EnrichStatus>(`/enrich?force=${force}`),
  enrichStatus: (signal?: Signal) => request<EnrichStatus>("/enrich/status", { signal }),
  /** Follow-up questions for the session's latest exchange (one call per finished answer). */
  suggestions: (sessionId: string, signal?: Signal) => post<SuggestionList>("/agent/suggestions", { session_id: sessionId }, signal),
  /** Voice input: a 16 kHz mono WAV recording in, its transcript out (transcribed on AMD). */
  transcribe: (wav: Blob, signal?: Signal) =>
    request<Transcript>("/agent/transcribe", { method: "POST", body: wav, headers: { "Content-Type": "audio/wav" }, signal }),

  // Saved conversations
  chats: (signal?: Signal) => request<ChatSummary[]>("/agent/sessions", { signal }),
  chat: (id: string, signal?: Signal) => request<ChatDetail>(`/agent/sessions/${encodeURIComponent(id)}`, { signal }),
  renameChat: (id: string, title: string) =>
    request<ChatSummary>(`/agent/sessions/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ title }) }),
  deleteChat: (id: string) => request<void>(`/agent/sessions/${encodeURIComponent(id)}`, { method: "DELETE" }),

  // Accounts
  authConfig: (signal?: Signal) => request<AuthConfig>("/auth/config", { signal }),
  me: (signal?: Signal) => request<Me>("/auth/me", { signal }),
  login: (email: string, password: string) => post<Me>("/auth/login", { email, password }),
  demoLogin: () => post<Me>("/auth/demo"),
  signup: (email: string, name: string, password: string) => post<Me>("/auth/signup", { email, name, password }),
  logout: () => post<void>("/auth/logout"),
  changePassword: (current_password: string, new_password: string) =>
    post<void>("/auth/password", { current_password, new_password }),
  users: (signal?: Signal) => request<UserRow[]>("/users", { signal }),
  createUser: (user: NewUser) => post<UserRow>("/users", user),
  updateUser: (id: number, update: UserUpdate) =>
    request<UserRow>(`/users/${id}`, { method: "PATCH", body: JSON.stringify(update) }),
};
