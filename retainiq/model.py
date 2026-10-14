"""The churn prediction: a logistic regression, not an LLM.

Why logistic regression? Every score can be explained exactly:
    contribution(feature) = coefficient x standardised value
so the manager sees *why* a customer is at risk, not just a number.

We score two versions with the same 5-fold cross-validation - order data only,
and order data plus the LLM text signals - and report both ROC-AUCs. The gap is the
measured value of reading tickets and reviews on the AMD GPU.
"""

from dataclasses import dataclass

import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedKFold, cross_val_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from .config import SEED
from .features import DRIVER_LABELS, FEATURES, ORDER_FEATURES


def _pipe():
    return make_pipeline(StandardScaler(), LogisticRegression(max_iter=2000, C=0.5))


@dataclass
class ChurnModel:
    pipeline: object
    auc_full: float
    auc_orders_only: float
    n_train: int
    base_rate: float

    def predict(self, f: pd.DataFrame) -> pd.Series:
        return pd.Series(self.pipeline.predict_proba(f[FEATURES])[:, 1], index=f.index)

    def contributions(self, f: pd.DataFrame) -> pd.DataFrame:
        """Per-customer, per-feature push on the log-odds of churning."""
        scaler, lr = self.pipeline[0], self.pipeline[-1]
        z = scaler.transform(f[FEATURES])
        return pd.DataFrame(z * lr.coef_[0], index=f.index, columns=FEATURES)

    def drivers(self, f: pd.DataFrame, top: int = 3) -> pd.Series:
        """The top reasons (in words) pushing each customer toward churn."""
        contrib = self.contributions(f)
        return contrib.apply(
            lambda row: [DRIVER_LABELS[k] for k, v in row.sort_values(ascending=False).head(top).items() if v > 0.15],
            axis=1)

    def weights(self) -> pd.Series:
        return pd.Series(self.pipeline[-1].coef_[0], index=FEATURES).sort_values(key=abs, ascending=False)


def train(f: pd.DataFrame, y: pd.Series) -> ChurnModel:
    y = y.reindex(f.index).astype(int)
    folds = StratifiedKFold(n_splits=5, shuffle=True, random_state=SEED)

    def cv_auc(cols: list[str]) -> float:
        return float(cross_val_score(_pipe(), f[cols], y, cv=folds, scoring="roc_auc").mean())

    # Cross-validated scores are for reporting; the model we use sees all the history.
    return ChurnModel(_pipe().fit(f[FEATURES], y), cv_auc(FEATURES), cv_auc(ORDER_FEATURES), len(f), float(y.mean()))
