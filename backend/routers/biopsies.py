"""Routes des lames de biopsie."""

from fastapi import APIRouter, BackgroundTasks, Depends, File, UploadFile
from sqlalchemy.orm import Session

import database
from schemas.biopsies import BiopsySchema
from services import biopsies, tile_cleanup

router = APIRouter(tags=["biopsies"])


@router.post(
    "/patients/{patient_id}/upload-biopsy", response_model=BiopsySchema, status_code=201
)
async def upload_biopsy(
    patient_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(database.get_db),
):
    """Importe une lame .svs/.tif/.tiff : stockage S3 puis tuilage DZI."""
    return await biopsies.import_biopsy(db, patient_id, file)


@router.delete("/biopsies/{biopsy_id}")
def delete_biopsy(
    biopsy_id: int,
    taches: BackgroundTasks,
    db: Session = Depends(database.get_db),
):
    """Supprime une lame (les extractions déjà faites sont conservées)."""
    rapport, differes = biopsies.delete_biopsy(db, biopsy_id)
    if differes:
        taches.add_task(tile_cleanup.effacer_en_arriere_plan, differes)
    return rapport
