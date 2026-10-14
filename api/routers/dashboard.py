from typing import Annotated

from fastapi import APIRouter, Depends

from retainiq import serializers as ser
from retainiq.engine import Engine

from ..deps import get_engine
from ..schemas import Dashboard

router = APIRouter(tags=["dashboard"])


@router.get("/dashboard", response_model=Dashboard)
def dashboard(engine: Annotated[Engine, Depends(get_engine)]):
    return ser.dashboard(engine)
