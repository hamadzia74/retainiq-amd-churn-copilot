from typing import Annotated

from fastapi import APIRouter, Depends

from retainiq import serializers as ser
from retainiq.engine import Engine

from ..deps import get_engine
from ..schemas import Plan, PlanRequest

router = APIRouter(prefix="/campaigns", tags=["campaigns"])


@router.post("/plan", response_model=Plan)
def plan(req: PlanRequest, engine: Annotated[Engine, Depends(get_engine)]):
    return ser.plan(engine.plan(req.budget))
