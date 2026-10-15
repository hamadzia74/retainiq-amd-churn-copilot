// Mirrors api/schemas.py. Keep the two in sync.

export type Tier = "VIP" | "Regular" | "Occasional";
export type Risk = "High" | "Medium" | "Low";

export interface Quota {
  rpm_limit: number | null;
  daily_cost_limit_usd: number | null;
  daily_cost_used_usd: number | null;
  daily_cost_remaining_usd: number | null;
  daily_reset_at: string | null;
}

export interface Health {
  status: string;
  llm_available: boolean;
  llm_problem: string | null;
  llm_provider: "token_factory" | "vllm";
  llm_provider_name: string;
  llm_model: string;
  llm_hardware: string;
  llm_label: string;
  llm_share: number;
  quota: Quota | null;
  voice_available: boolean;
  active_customers: number;
}

export interface Dashboard {
  active_customers: number;
  revenue_180: number;
  revenue_at_risk_90: number;
  high_risk: number;
  vip_high_risk: number;
  avg_churn_prob: number;
  auc_full: number;
  auc_orders_only: number;
  n_train: number;
  base_rate: number;
  llm_share: number;
  top_complaints: Record<string, number>;
}

export interface AtRiskRow {
  customer_id: string;
  name: string;
  tier: Tier;
  risk: Risk;
  churn_prob: number;
  revenue_180: number;
  value_at_risk: number;
  days_since_order: number;
  drivers: string[];
}

export interface Action {
  action: string;
  label: string;
  revenue_saved: number;
  cost: number;
  net_value: number;
}

export interface TextSignal {
  id: string;
  date: string;
  kind: "ticket" | "review";
  sentiment: number;
  category: string;
  threat: boolean;
  summary: string;
  text: string;
}

export interface Contribution {
  feature: string;
  label: string;
  effect: number;
}

export interface Order {
  order_id: string;
  date: string;
  product: string;
  revenue: number;
  discount_used: boolean;
  returned: boolean;
}

export interface Customer360 {
  customer_id: string;
  name: string;
  language: string;
  tier: Tier;
  risk: Risk;
  churn_prob: number;
  drivers: string[];
  revenue_180: number;
  value_at_risk: number;
  orders_90: number;
  days_since_order: number;
  discount_share: number;
  return_rate: number;
  recent_messages: TextSignal[];
  recommended_action: Action;
  contributions: Contribution[];
  orders: Order[];
}

export interface WinBackMessage {
  customer_id: string;
  name: string;
  language: string;
  offer: string;
  message: string;
  source: "llm" | "template";
}

export interface PlanRow {
  customer_id: string;
  name: string;
  tier: Tier;
  churn_prob: number;
  action: string;
  label: string;
  cost: number;
  revenue_saved: number;
  net_value: number;
}

export interface Plan {
  budget: number;
  spent: number;
  customers: number;
  candidates: number;
  revenue_saved: number;
  net_margin_gain: number;
  roi: number;
  action_mix: Record<string, number>;
  rows: PlanRow[];
}

export interface Weight {
  feature: string;
  label: string;
  weight: number;
}

export interface ModelInfo {
  auc_full: number;
  auc_orders_only: number;
  n_train: number;
  base_rate: number;
  weights: Weight[];
}

/** One plain-English progress step of a Copilot answer (see retainiq/steps.py). */
export interface AgentStep {
  id: string;
  status: "running" | "done" | "failed" | "cancelled";
  label: string;
  summary?: string;
  details?: string[];
  ms?: number;
}

export interface Transcript {
  text: string;
}

export interface SuggestionList {
  suggestions: { text: string }[];
  source: "llm" | "rules";
}

export interface EnrichStats {
  records: number;
  requests: number;
  batch_size: number;
  skipped: number;
  failed: number;
  seconds: number;
  prompt_tokens: number;
  completion_tokens: number;
  tokens_per_s: number;
  records_per_s: number;
  auc_before: number;
  auc_after: number;
  auc_orders_only: number;
}

export interface EnrichPlan {
  pending: number;
  total: number;
  requests: number;
  batch_size: number;
  rpm: number;
  est_minutes: number | null;
}

export interface EnrichStatus {
  state: "idle" | "running" | "done" | "error";
  done: number;
  total: number;
  stats: EnrichStats | null;
  error: string | null;
  plan: EnrichPlan;
}
