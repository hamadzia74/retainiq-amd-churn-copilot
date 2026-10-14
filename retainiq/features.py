"""Join the four sources into one row per customer, as seen on a given date.

`as_of` matters: to train honestly we rebuild the table as it looked 90
days ago, then check who actually bought in the 90 days after. Nothing
after `as_of` is allowed to leak into a feature.
"""

from datetime import timedelta

import pandas as pd

from .data import Dataset

ORDER_FEATURES = ["recency_days", "orders_90", "order_trend", "revenue_180", "aov",
                  "discount_share", "return_rate", "tenure_days"]
TEXT_FEATURES = ["tickets_90", "complaints_90", "neg_sentiment_180", "churn_threat_90", "low_reviews_180"]
FEATURES = ORDER_FEATURES + TEXT_FEATURES

# Neutral names, for charts where a feature can push either way.
FEATURE_NAMES = {
    "recency_days": "days since last order",
    "orders_90": "orders in last 90 days",
    "order_trend": "order trend vs previous 90 days",
    "revenue_180": "spend in last 180 days",
    "aov": "average basket size",
    "discount_share": "share bought on discount",
    "return_rate": "return rate",
    "tenure_days": "time as a customer",
    "tickets_90": "support tickets (90d)",
    "complaints_90": "complaints (90d)",
    "neg_sentiment_180": "negative tone (180d)",
    "churn_threat_90": "threatened to leave (90d)",
    "low_reviews_180": "1-2 star reviews (180d)",
}

# How each feature reads when it pushes a customer toward churn.
DRIVER_LABELS = {
    "recency_days": "long gap since last order",
    "orders_90": "few recent orders",
    "order_trend": "ordering less than before",
    "revenue_180": "low recent spend",
    "aov": "small basket size",
    "discount_share": "buys mainly on discount",
    "return_rate": "high return rate",
    "tenure_days": "new customer",
    "tickets_90": "many support tickets",
    "complaints_90": "recent complaints",
    "neg_sentiment_180": "negative tone in tickets/reviews",
    "churn_threat_90": "threatened to leave",
    "low_reviews_180": "left 1-2 star reviews",
}


def build(ds: Dataset, signals: dict, as_of) -> pd.DataFrame:
    """Feature table for customers still active (ordered in the 90 days before `as_of`)."""
    as_of = pd.Timestamp(as_of)
    d90, d180 = as_of - timedelta(days=90), as_of - timedelta(days=180)

    o = ds.orders[ds.orders["date"] <= as_of]
    recent = o[o["date"] > d180]
    g_all, g_180 = o.groupby("customer_id"), recent.groupby("customer_id")

    f = pd.DataFrame(index=recent.loc[recent["date"] > d90, "customer_id"].unique())
    f["recency_days"] = (as_of - g_all["date"].max()).dt.days
    f["orders_90"] = recent[recent["date"] > d90].groupby("customer_id").size()
    f["orders_prev_90"] = recent[recent["date"] <= d90].groupby("customer_id").size()
    f = f.fillna({"orders_90": 0, "orders_prev_90": 0})
    f["order_trend"] = f["orders_90"] - f["orders_prev_90"]
    f["revenue_180"] = g_180["revenue"].sum()
    f["margin_180"] = g_180["margin"].sum()
    f["aov"] = g_all["revenue"].mean()
    f["discount_share"] = g_180["discount_used"].mean()
    f["return_rate"] = g_180["returned"].mean()

    signup = ds.customers.set_index("customer_id")["signup_date"]
    f["tenure_days"] = (as_of - signup.reindex(f.index)).dt.days

    # Text signals: tickets and reviews share one timeline.
    text = pd.concat([
        ds.tickets[["ticket_id", "customer_id", "date"]].rename(columns={"ticket_id": "id"}).assign(kind="ticket"),
        ds.reviews[["review_id", "customer_id", "date", "rating"]].rename(columns={"review_id": "id"}).assign(kind="review"),
    ])
    text = text[(text["date"] <= as_of) & (text["date"] > d180)].copy()
    sig = text["id"].map(lambda i: signals.get(i, {}))
    text["sentiment"] = sig.map(lambda s: s.get("sentiment", 0.0))
    text["threat"] = sig.map(lambda s: bool(s.get("churn_threat", False)))
    text["neg"] = (-text["sentiment"]).clip(lower=0)
    t90 = text[text["date"] > d90]

    f["tickets_90"] = t90[t90["kind"] == "ticket"].groupby("customer_id").size()
    f["complaints_90"] = t90[t90["sentiment"] < -0.2].groupby("customer_id").size()
    f["neg_sentiment_180"] = text.groupby("customer_id")["neg"].mean()
    f["churn_threat_90"] = t90.groupby("customer_id")["threat"].any().astype(int)
    f["low_reviews_180"] = text[(text["kind"] == "review") & (text["rating"] <= 2)].groupby("customer_id").size()
    f = f.fillna(0)

    f["margin_rate"] = (f["margin_180"] / f["revenue_180"]).clip(0.2, 0.7)
    return f.drop(columns="orders_prev_90")


def churn_labels(ds: Dataset, as_of, horizon_days: int) -> pd.Series:
    """1 if the customer placed NO order in (as_of, as_of + horizon]."""
    as_of = pd.Timestamp(as_of)
    window = ds.orders[(ds.orders["date"] > as_of) & (ds.orders["date"] <= as_of + timedelta(days=horizon_days))]
    ids = ds.customers["customer_id"]
    return pd.Series((~ids.isin(window["customer_id"])).astype(int).values, index=ids)
