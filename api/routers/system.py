from typing import Annotated

from fastapi import APIRouter, Depends

from retainiq import config
from retainiq.engine import Engine
from retainiq.voice import voice_available

from ..deps import get_engine
from ..schemas import Health

router = APIRouter(tags=["system"])


@router.get("/health", response_model=Health)
def health(engine: Annotated[Engine, Depends(get_engine)]):
    llm = engine.llm
    return {"status": "ok", "llm_available": llm.available, "llm_problem": llm.problem,
            "llm_provider": config.LLM_PROVIDER, "llm_provider_name": config.LLM_PROVIDER_NAME,
            "llm_model": config.LLM_MODEL, "llm_hardware": config.LLM_HARDWARE, "llm_label": llm.label,
            "llm_share": round(engine.llm_share, 3), "quota": llm.usage() if llm.available else None,
            "voice_available": voice_available(llm),
            "active_customers": len(engine.scored)}
