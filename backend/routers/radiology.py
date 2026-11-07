"""Routes des examens radiologiques (DICOM / Orthanc)."""

from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy.orm import Session

import database
from schemas.radiology import RadiologySchema, ReportPayload
from services import radiology

router = APIRouter(tags=["radiology"])


@router.post(
    "/patients/{patient_id}/upload-radiology",
    response_model=RadiologySchema,
    status_code=201,
)
async def upload_radiology(
    patient_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(database.get_db),
):
    """Importe un fichier .dcm dans Orthanc et le rattache au dossier."""
    return await radiology.import_dicom(db, patient_id, file)


@router.get("/radiology/{study_id}/report")
def get_radiology_report(study_id: str, db: Session = Depends(database.get_db)):
    """`study_id` est l'identifiant ORTHANC de l'étude."""
    return radiology.get_report(db, study_id)


@router.post("/radiology/{study_id}/report")
def save_radiology_report(
    study_id: str, payload: ReportPayload, db: Session = Depends(database.get_db)
):
    return radiology.save_report(db, study_id, payload)


@router.delete("/radiology-studies/{study_id}")
def delete_radiology_study(study_id: int, db: Session = Depends(database.get_db)):
    """`study_id` est l'identifiant en BASE. L'étude reste dans Orthanc."""
    return radiology.detach_study(db, study_id)
