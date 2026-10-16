from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query

from retainiq import serializers as ser
from retainiq.engine import Engine

from .. import usage
from ..auth import UserDep
from ..deps import get_engine
from ..schemas import AtRiskRow, Customer360, Tier, WinBackMessage

router = APIRouter(prefix="/customers", tags=["customers"])
EngineDep = Annotated[Engine, Depends(get_engine)]

SORT = {"prob": "churn_prob", "value": "value_at_risk"}


@router.get("/at-risk", response_model=list[AtRiskRow])
def at_risk(engine: EngineDep,
            limit: Annotated[int, Query(ge=1, le=200)] = 25,
            offset: Annotated[int, Query(ge=0, le=1000)] = 0,
            tier: Tier | None = None,
            sort: Literal["prob", "value"] = "prob"):
    """One page of the at-risk list. `offset` lets "Show more" fetch only the next page."""
    return ser.at_risk(engine.at_risk(offset + limit, tier, SORT[sort]).iloc[offset:])


@router.get("/{customer_id}", response_model=Customer360)
def customer(customer_id: str, engine: EngineDep):
    c = engine.customer(customer_id)
    if not c:
        raise HTTPException(404, f"No active customer {customer_id}")
    return ser.customer(c, full=True)


@router.post("/{customer_id}/message", response_model=WinBackMessage)
def message(customer_id: str, engine: EngineDep, user: UserDep):
    """LLM-written when the AMD endpoint is up; otherwise a template, marked source='template'.
    Counts toward the daily AI limit (429 once it is used up)."""
    if engine.llm.available:
        usage.check_limit(user)
    m = usage.metered(user, "message").run(engine.draft_message, customer_id)
    if not m:
        raise HTTPException(404, f"No active customer {customer_id}")
    return ser.message(m)
