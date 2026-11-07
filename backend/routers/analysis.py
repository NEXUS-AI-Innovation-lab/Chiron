"""Route de l'analyse IA (InstanSeg)."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

import database
from schemas.extractions import AnalysisPayload
from services import analysis

router = APIRouter(tags=["analysis"])


@router.post("/analyze-ai")
async def analyze_image_with_ai(data: AnalysisPayload, db: Session = Depends(database.get_db)):
    """Segmente les noyaux de la région demandée (max 1500 × 1500 px)."""
    return await analysis.analyze_region(db, data)
