"""Routes des dossiers patients."""

from typing import List

from fastapi import APIRouter, BackgroundTasks, Depends
from sqlalchemy.orm import Session

import database
from schemas.patients import PatientCreate, PatientSchema
from services import patients, tile_cleanup

router = APIRouter(tags=["patients"])


@router.get("/patients", response_model=List[PatientSchema])
def get_patients(db: Session = Depends(database.get_db)):
    return patients.list_patients(db)


@router.post("/patients", response_model=PatientSchema, status_code=201)
def create_patient(payload: PatientCreate, db: Session = Depends(database.get_db)):
    return patients.create_patient(db, payload)


@router.delete("/patients/{patient_id}")
def delete_patient(
    patient_id: int,
    taches: BackgroundTasks,
    db: Session = Depends(database.get_db),
):
    """Supprime le patient, ses fichiers MinIO et ses tuiles (pas ses études Orthanc)."""
    report, differes = patients.delete_patient(db, patient_id)
    if differes:
        taches.add_task(tile_cleanup.effacer_en_arriere_plan, differes)
    return report
