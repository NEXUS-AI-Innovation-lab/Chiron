"""Routes des extractions (régions de lame avec compte rendu et dessins).

Le workflow d'une extraction a ses propres routes, dans `workflow/router.py`.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

import database
from schemas.extractions import AnalysisPayload
from services import extractions

router = APIRouter(tags=["extractions"])


@router.post("/extract-roi")
def extract_roi(data: AnalysisPayload, db: Session = Depends(database.get_db)):
    """Crée une extraction à partir d'une région de la lame."""
    return extractions.create_from_region(db, data)


@router.post("/annotations/save")
def update_analysis(data: AnalysisPayload, db: Session = Depends(database.get_db)):
    """Enregistre le compte rendu et les dessins de l'extraction `extraction_id`."""
    return extractions.save_annotations(db, data)


@router.get("/patients/{folder_id}/extractions")
def get_extractions(folder_id: str, db: Session = Depends(database.get_db)):
    """`folder_id` est l'identifiant de DOSSIER (texte), pas l'id numérique."""
    return extractions.list_for_folder(db, folder_id)


@router.get("/extractions/{extraction_id}/details")
def get_details(extraction_id: int, db: Session = Depends(database.get_db)):
    return extractions.get_details(db, extraction_id)


@router.delete("/extractions/{extraction_id}")
def delete_extraction(
    extraction_id: int, username: str, db: Session = Depends(database.get_db)
):
    """Réservé au propriétaire (`?username=...`)."""
    return extractions.delete_extraction(db, extraction_id, username)
