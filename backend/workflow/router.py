"""Routes HTTP du moteur de workflow.

Le routeur ne contient aucune règle métier : il résout l'extraction,
délègue au service et traduit les erreurs en codes HTTP.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import database
import models

from . import service
from .constants import STEP_IDS
from .schemas import StepSavePayload, TransitionPayload, WorkflowStateSchema

router = APIRouter(prefix="/extractions", tags=["workflow"])

#: Codes métier -> statut HTTP.
_STATUS_BY_CODE = {
    "unknown_step": 404,
    "invalid_payload": 422,
    "missing_fields": 422,
    "step_locked": 409,
}


def _get_extraction(extraction_id: int, db: Session) -> models.Extraction:
    extraction = (
        db.query(models.Extraction).filter(models.Extraction.id == extraction_id).first()
    )
    if extraction is None:
        raise HTTPException(status_code=404, detail="Extraction introuvable.")
    return extraction


def _handle(error: service.WorkflowError) -> HTTPException:
    return HTTPException(
        status_code=_STATUS_BY_CODE.get(error.code, 400),
        detail={"code": error.code, "message": error.message, "details": error.details},
    )


@router.get("/{extraction_id}/workflow", response_model=WorkflowStateSchema)
def get_workflow(extraction_id: int, db: Session = Depends(database.get_db)):
    """Avancement du workflow, reconstruit au premier appel si nécessaire."""
    extraction = _get_extraction(extraction_id, db)
    state = service.get_or_create_state(db, extraction)
    return service.to_schema(state)


@router.put("/{extraction_id}/workflow/steps/{step}", response_model=WorkflowStateSchema)
def save_workflow_step(
    extraction_id: int,
    step: str,
    payload: StepSavePayload,
    db: Session = Depends(database.get_db),
):
    """Enregistre une étape.

    `validate_step=false` conserve un brouillon sans franchir l'étape ;
    `true` valide et fait avancer le parcours d'un cran.
    """
    extraction = _get_extraction(extraction_id, db)
    try:
        state = service.save_step(
            db,
            extraction,
            step,
            payload.data,
            payload.validated_by,
            payload.validate_step,
        )
    except service.WorkflowError as error:
        raise _handle(error) from error
    return service.to_schema(state)


@router.post("/{extraction_id}/workflow/goto", response_model=WorkflowStateSchema)
def goto_workflow_step(
    extraction_id: int,
    payload: TransitionPayload,
    db: Session = Depends(database.get_db),
):
    """Revient sur une étape déjà accessible (navigation « Retour »)."""
    extraction = _get_extraction(extraction_id, db)
    try:
        state = service.goto_step(db, extraction, payload.step)
    except service.WorkflowError as error:
        raise _handle(error) from error
    return service.to_schema(state)


@router.get("/workflow/steps", tags=["workflow"])
def list_workflow_steps():
    """Ordre de référence des étapes, pour aligner tout client."""
    return {"steps": STEP_IDS}
