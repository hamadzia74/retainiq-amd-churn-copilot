"""The store's four disconnected data sources: catalogue, orders, tickets, reviews.

There is no public dataset that links orders to the support tickets and
reviews of the same customers, so we generate one. It is seeded (same data
every run) and built with real cause and effect, so the model has something
honest to learn:

    bad experience (late / damaged / refund trouble)
        -> angry tickets and 1-star reviews, sometimes "I'll cancel"
        -> fewer orders for a few weeks
        -> often, the customer stops buying

Some customers also churn silently (no complaint at all), and some complain
but stay - so text is a strong signal, not a perfect one.

Real data drops in by replacing the CSVs in data/ with the same columns.
"""

from dataclasses import dataclass
from datetime import timedelta

import numpy as np
import pandas as pd

from .config import DATA_DIR, SEED, TODAY

HISTORY_DAYS = 540
N_CUSTOMERS = 1200
START = TODAY - timedelta(days=HISTORY_DAYS)
NEVER = 10_000

# (sku, name, category, list price, gross margin)
PRODUCTS = [
    ("SKU01", "Merino Wool Sweater", "Apparel", 89.0, 0.48),
    ("SKU02", "Organic Cotton Tee", "Apparel", 29.0, 0.55),
    ("SKU03", "Trail Running Shoes", "Footwear", 129.0, 0.38),
    ("SKU04", "Leather Chelsea Boots", "Footwear", 159.0, 0.42),
    ("SKU05", "Insulated Water Bottle", "Accessories", 34.0, 0.60),
    ("SKU06", "Canvas Backpack", "Accessories", 69.0, 0.50),
    ("SKU07", "Rain Shell Jacket", "Outerwear", 149.0, 0.40),
    ("SKU08", "Down Puffer Vest", "Outerwear", 119.0, 0.44),
    ("SKU09", "Yoga Leggings", "Activewear", 59.0, 0.57),
    ("SKU10", "Running Socks 3-pack", "Activewear", 19.0, 0.62),
    ("SKU11", "Wool Beanie", "Accessories", 25.0, 0.58),
    ("SKU12", "Linen Shirt", "Apparel", 65.0, 0.52),
]

LANGS = ["en", "es", "de"]
LANG_P = [0.70, 0.15, 0.15]
NAMES = {
    "en": (["Emma", "Liam", "Olivia", "Noah", "Ava", "James", "Mia", "Lucas", "Amelia", "Ethan", "Sara", "Omar"],
           ["Smith", "Johnson", "Brown", "Taylor", "Wilson", "Clarke", "Khan", "Patel", "Walker", "Hughes"]),
    "es": (["Lucía", "Mateo", "Sofía", "Diego", "Valeria", "Javier", "Camila", "Andrés"],
           ["García", "Martínez", "López", "Sánchez", "Romero", "Torres", "Ruiz"]),
    "de": (["Lena", "Jonas", "Hannah", "Felix", "Mia", "Lukas", "Anna", "Paul"],
           ["Müller", "Schmidt", "Schneider", "Fischer", "Weber", "Wagner", "Becker"]),
}

# Complaints written the way customers write them. {p} = product, {o} = order id.
NEG_TICKETS = {
    "en": [
        "My order {o} arrived {n} days late again. This is not acceptable.",
        "The {p} I received was damaged and nobody has replied to my emails.",
        "Still waiting on my refund for the {p} after three weeks.",
        "I was charged twice for order {o}. Please fix this immediately.",
        "The quality of the {p} is terrible compared to what I bought last year.",
        "Your support agent closed my ticket without solving anything. Very frustrating.",
    ],
    "es": [
        "Mi pedido {o} llegó con {n} días de retraso otra vez. Es inaceptable.",
        "El {p} llegó dañado y nadie responde mis correos.",
        "Sigo esperando el reembolso del {p} después de tres semanas.",
        "Me cobraron dos veces el pedido {o}. Por favor, solucionadlo ya.",
    ],
    "de": [
        "Meine Bestellung {o} kam schon wieder {n} Tage zu spät. Das ist inakzeptabel.",
        "Der {p} ist beschädigt angekommen und niemand antwortet auf meine E-Mails.",
        "Ich warte seit drei Wochen auf meine Rückerstattung für den {p}.",
        "Bestellung {o} wurde mir doppelt abgebucht. Bitte sofort korrigieren.",
    ],
}
THREATS = {
    "en": [" Honestly I'm about to close my account.", " I'll be shopping elsewhere from now on."],
    "es": [" Sinceramente estoy pensando en darme de baja.", " Voy a comprar en otra tienda."],
    "de": [" Ehrlich gesagt überlege ich, mein Konto zu kündigen.", " Ich kaufe ab jetzt woanders."],
}
NEUTRAL_TICKETS = {
    "en": ["Does the {p} come in a larger size?", "How do I change the delivery address for order {o}?",
           "Thanks for the quick delivery, everything was perfect!", "Can I combine two discount codes on one order?"],
    "es": ["¿El {p} está disponible en otra talla?", "¡Gracias por la entrega tan rápida, todo perfecto!"],
    "de": ["Gibt es den {p} auch in einer anderen Farbe?", "Danke für die schnelle Lieferung, alles bestens!"],
}
POS_REVIEWS = {
    "en": ["Love the {p}, great fit and quality.", "Exactly as described. Would buy again.",
           "Good value, arrived fast.", "Solid product, does the job."],
    "es": ["Me encanta el {p}, muy buena calidad.", "Tal como se describe, volvería a comprar."],
    "de": ["Super {p}, tolle Qualität.", "Wie beschrieben, gerne wieder."],
}
NEG_REVIEWS = {
    "en": ["The {p} fell apart after two weeks. Disappointed.", "Arrived late and the box was crushed.",
           "Not worth the price anymore, quality has dropped."],
    "es": ["El {p} se rompió a las dos semanas. Muy decepcionado.", "Llegó tarde y la caja estaba aplastada."],
    "de": ["Der {p} ist nach zwei Wochen kaputt gegangen. Enttäuscht.", "Kam zu spät und die Verpackung war zerdrückt."],
}


@dataclass
class Dataset:
    customers: pd.DataFrame
    products: pd.DataFrame
    orders: pd.DataFrame
    tickets: pd.DataFrame
    reviews: pd.DataFrame


def _day(offset: float):
    return START + timedelta(days=int(offset))


def _generate(rng: np.random.Generator) -> Dataset:
    customers, orders, tickets, reviews = [], [], [], []
    n_products = len(PRODUCTS)

    def fill(template: str, last_order: str) -> str:
        return template.format(p=PRODUCTS[rng.integers(n_products)][1], o=last_order, n=int(rng.integers(4, 12)))

    for i in range(N_CUSTOMERS):
        cid = f"C{i + 1:04d}"
        lang = str(rng.choice(LANGS, p=LANG_P))
        first, last = NAMES[lang]
        signup = int(rng.integers(0, 420))
        rate = rng.lognormal(np.log(1.3), 0.5) / 30          # orders per day
        discount_aff = rng.beta(2, 5)                          # how deal-driven they are
        favourites = rng.choice(n_products, size=3, replace=False)

        # The hidden story of this customer.
        bad_day, churn_day = None, NEVER
        if rng.random() < 0.32:
            bad_day = int(rng.integers(signup + 15, HISTORY_DAYS - 3))
            if rng.random() < 0.7:
                churn_day = bad_day + int(rng.integers(20, 80))
        if churn_day == NEVER and rng.random() < 0.10:      # silent churn, no complaint
            churn_day = int(rng.integers(signup + 30, HISTORY_DAYS + 200))

        customers.append({"customer_id": cid, "name": f"{rng.choice(first)} {rng.choice(last)}",
                          "language": lang, "signup_date": _day(signup)})

        # Orders: a Poisson process that thins out in the weeks before churning.
        stop = min(churn_day, HISTORY_DAYS)
        t, last_order = float(signup), "O000000"
        while t < stop:
            fading = churn_day - t < 45
            if t == signup or not (fading and rng.random() < 0.4):
                idx = favourites[rng.integers(3)] if rng.random() < 0.7 else rng.integers(n_products)
                sku, _, _, price, margin = PRODUCTS[idx]
                discount = bool(rng.random() < discount_aff)
                paid = price * (0.8 if discount else 1.0)
                after_bad = bad_day is not None and 0 <= t - bad_day <= 30
                last_order = f"O{len(orders) + 1:06d}"
                orders.append({"order_id": last_order, "customer_id": cid, "date": _day(t), "sku": sku,
                               "revenue": round(paid, 2), "margin": round(paid - price * (1 - margin), 2),
                               "discount_used": discount,
                               "returned": bool(rng.random() < (0.3 if after_bad else 0.05))})
                if rng.random() < (0.6 if after_bad else 0.22):
                    bad_review = after_bad or rng.random() < 0.04
                    pool = NEG_REVIEWS if bad_review else POS_REVIEWS
                    reviews.append({"review_id": f"R{len(reviews) + 1:05d}", "customer_id": cid,
                                    "date": _day(t + rng.integers(3, 10)), "sku": sku,
                                    "rating": int(rng.integers(1, 3)) if bad_review else int(rng.integers(4, 6)),
                                    "text": fill(str(rng.choice(pool[lang])), last_order)})
            t += rng.exponential(1 / rate)

        # Everyday tickets: questions and thank-yous.
        for _ in range(rng.poisson((stop - signup) / 200)):
            day = rng.integers(signup, max(signup + 1, stop))
            tickets.append({"customer_id": cid, "date": _day(day),
                            "text": fill(str(rng.choice(NEUTRAL_TICKETS[lang])), last_order)})

        # The bad experience: 1-3 angry tickets, sometimes with a threat to leave.
        if bad_day is not None:
            threat_p = 0.55 if churn_day != NEVER else 0.2
            for _ in range(rng.integers(1, 4)):
                day = min(bad_day + int(rng.integers(0, 14)), HISTORY_DAYS)
                text = fill(str(rng.choice(NEG_TICKETS[lang])), last_order)
                if rng.random() < threat_p:
                    text += str(rng.choice(THREATS[lang]))
                tickets.append({"customer_id": cid, "date": _day(day), "text": text})

    tickets_df = pd.DataFrame(tickets).sort_values("date").reset_index(drop=True)
    tickets_df.insert(0, "ticket_id", [f"T{i + 1:05d}" for i in range(len(tickets_df))])
    reviews_df = pd.DataFrame(reviews)
    reviews_df = reviews_df[reviews_df["date"] <= TODAY].reset_index(drop=True)

    return Dataset(
        customers=pd.DataFrame(customers),
        products=pd.DataFrame(PRODUCTS, columns=["sku", "name", "category", "price", "margin_pct"]),
        orders=pd.DataFrame(orders),
        tickets=tickets_df,
        reviews=reviews_df,
    )


TABLES = {"customers": ["signup_date"], "products": [], "orders": ["date"], "tickets": ["date"], "reviews": ["date"]}


def load(regenerate: bool = False) -> Dataset:
    """Load the CSVs from data/, generating them on the first run."""
    if regenerate or not all((DATA_DIR / f"{t}.csv").exists() for t in TABLES):
        DATA_DIR.mkdir(exist_ok=True)
        ds = _generate(np.random.default_rng(SEED))
        for table in TABLES:
            getattr(ds, table).to_csv(DATA_DIR / f"{table}.csv", index=False)
    return Dataset(**{t: pd.read_csv(DATA_DIR / f"{t}.csv", parse_dates=cols) for t, cols in TABLES.items()})


def texts(ds: Dataset) -> list[tuple[str, str]]:
    """Every free-text record (tickets + reviews) as (id, text) pairs."""
    return list(zip(ds.tickets["ticket_id"], ds.tickets["text"])) + \
        list(zip(ds.reviews["review_id"], ds.reviews["text"]))
