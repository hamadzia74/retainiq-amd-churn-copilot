from typing import Annotated

from fastapi import APIRouter, Depends

from retainiq import serializers as ser
from retainiq.engine import Engine

from ..deps import get_engine
from ..schemas import ModelInfo

router = APIRouter(tags=["model"])


@router.get("/model", response_model=ModelInfo)
def model(engine: Annotated[Engine, Depends(get_engine)]):
    return ser.model(engine)
