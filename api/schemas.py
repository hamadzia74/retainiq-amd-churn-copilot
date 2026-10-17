"""Request/response models. They mirror retainiq/serializers.py and are the
contract the React app's api/types.ts copies."""

from typing import Literal

from pydantic import BaseModel, Field

Tier = Literal["VIP", "Regular", "Occasional"]
Risk = Literal["High", "Medium", "Low"]


class Quota(BaseModel):
    rpm_limit: int | None = None
    daily_cost_limit_usd: float | None = None
    daily_cost_used_usd: float | None = None
    daily_cost_remaining_usd: float | None = None
    daily_reset_at: str | None = None


class Health(BaseModel):
    status: str
    llm_available: bool
    llm_problem: str | None
    llm_provider: Literal["token_factory", "vllm"]
    llm_provider_name: str
    llm_model: str
    llm_hardware: str
    llm_label: str
    llm_share: float
    quota: Quota | None
    voice_available: bool
    enrich_available: bool          # false on serverless hosts: enrichment runs offline (api.manage enrich)
    active_customers: int


class Dashboard(BaseModel):
    active_customers: int
    revenue_180: float
    revenue_at_risk_90: float
    high_risk: int
    vip_high_risk: int
    avg_churn_prob: float
    auc_full: float
    auc_orders_only: float
    n_train: int
    base_rate: float
    llm_share: float
    top_complaints: dict[str, int]


class AtRiskRow(BaseModel):
    customer_id: str
    name: str
    tier: Tier
    risk: Risk
    churn_prob: float
    revenue_180: float
    value_at_risk: float
    days_since_order: int
    drivers: list[str]


class Action(BaseModel):
    action: str
    label: str
    revenue_saved: float
    cost: float
    net_value: float


class TextSignal(BaseModel):
    id: str
    date: str
    kind: Literal["ticket", "review"]
    sentiment: float
    category: str
    threat: bool
    summary: str
    text: str


class Contribution(BaseModel):
    feature: str
    label: str
    effect: float


class Order(BaseModel):
    order_id: str
    date: str
    product: str
    revenue: float
    discount_used: bool
    returned: bool


class Customer360(BaseModel):
    customer_id: str
    name: str
    language: str
    tier: Tier
    risk: Risk
    churn_prob: float
    drivers: list[str]
    revenue_180: float
    value_at_risk: float
    orders_90: int
    days_since_order: int
    discount_share: float
    return_rate: float
    recent_messages: list[TextSignal]
    recommended_action: Action
    contributions: list[Contribution]
    orders: list[Order]


class WinBackMessage(BaseModel):
    customer_id: str
    name: str
    language: str
    offer: str
    message: str
    source: Literal["llm", "template"]


class PlanRequest(BaseModel):
    budget: float = Field(gt=0, le=1_000_000, description="USD")


class PlanRow(BaseModel):
    customer_id: str
    name: str
    tier: Tier
    churn_prob: float
    action: str
    label: str
    cost: float
    revenue_saved: float
    net_value: float


class Plan(BaseModel):
    budget: float
    spent: float
    customers: int
    candidates: int
    revenue_saved: float
    net_margin_gain: float
    roi: float
    action_mix: dict[str, int]
    rows: list[PlanRow]


class Weight(BaseModel):
    feature: str
    label: str
    weight: float


class ModelInfo(BaseModel):
    auc_full: float
    auc_orders_only: float
    n_train: int
    base_rate: float
    weights: list[Weight]


class EnrichStats(BaseModel):
    records: int
    requests: int
    batch_size: int
    skipped: int
    failed: int
    seconds: float
    prompt_tokens: int
    completion_tokens: int
    tokens_per_s: float
    records_per_s: float
    auc_before: float
    auc_after: float
    auc_orders_only: float


class EnrichPlan(BaseModel):
    pending: int
    total: int
    requests: int
    batch_size: int
    rpm: int
    est_minutes: float | None


class EnrichStatus(BaseModel):
    state: Literal["idle", "running", "done", "error"]
    done: int
    total: int
    stats: EnrichStats | None
    error: str | None
    plan: EnrichPlan


class SuggestionsRequest(BaseModel):
    session_id: str = Field(min_length=1, max_length=64)


class Suggestion(BaseModel):
    text: str


class Suggestions(BaseModel):
    suggestions: list[Suggestion]
    source: Literal["llm", "rules"]


class Transcript(BaseModel):
    text: str


class ChatRequest(BaseModel):
    session_id: str = Field(min_length=1, max_length=64)
    message: str = Field(min_length=1, max_length=2000)


# ---------------------------------------------------------------------------- accounts
Role = Literal["admin", "analyst", "demo"]


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=200)


class SignupRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    name: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=8, max_length=200)


class UsageToday(BaseModel):
    day: str
    calls: int
    limit: int
    remaining: int
    tokens_in: int
    tokens_out: int
    by_feature: dict[str, int]


class Me(BaseModel):
    id: int
    email: str
    name: str
    role: Role
    usage: UsageToday


class AuthConfig(BaseModel):
    signup: bool
    demo: bool


class Token(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"


class UserRow(BaseModel):
    id: int
    email: str
    name: str
    role: Role
    is_active: bool
    created_at: str | None
    last_login_at: str | None
    usage: UsageToday


class NewUser(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    name: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=8, max_length=200)
    role: Role = "analyst"


class UserUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=80)
    role: Role | None = None
    is_active: bool | None = None
    password: str | None = Field(None, min_length=8, max_length=200)


class PasswordChange(BaseModel):
    current_password: str = Field(min_length=1, max_length=200)
    new_password: str = Field(min_length=8, max_length=200)


# ---------------------------------------------------------------------------- saved chats
class ChatSummary(BaseModel):
    id: str
    title: str
    questions: int
    created_at: str | None
    updated_at: str | None


class SavedStep(BaseModel):
    id: str
    status: str
    label: str
    summary: str | None = None
    details: list[str] | None = None
    ms: int | None = None


class SavedMessage(BaseModel):
    id: int
    role: Literal["user", "assistant"]
    text: str
    steps: list[SavedStep]
    suggestions: list[str] | None
    duration_ms: int | None
    error: bool
    created_at: str | None


class ChatDetail(BaseModel):
    id: str
    title: str
    created_at: str | None
    updated_at: str | None
    messages: list[SavedMessage]


class ChatRename(BaseModel):
    title: str = Field(min_length=1, max_length=120)


class EnrichRunRow(BaseModel):
    id: int
    user: str | None
    force: bool
    state: str
    rows_done: int
    rows_total: int
    error: str | None
    started_at: str | None
    finished_at: str | None
