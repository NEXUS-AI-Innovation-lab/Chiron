"""Route de supervision."""

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from services import health

router = APIRouter(tags=["health"])


@router.get("/health")
async def health_check():
    """200 si la base et InstanSeg répondent, 503 sinon (avec le détail)."""
    healthy, payload = await health.check()
    return payload if healthy else JSONResponse(status_code=503, content=payload)
