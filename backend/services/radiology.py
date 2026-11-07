"""Examens radiologiques : import DICOM dans Orthanc, compte-rendu, détachement."""

from pathlib import Path
from typing import Any, Dict

import requests
from fastapi import UploadFile
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

import models
from clients import orthanc
from schemas.radiology import ReportPayload
from services.errors import Conflict, InvalidInput, NotFound, ServiceError, UpstreamError
from services.patients import get_patient


async def import_dicom(db: Session, patient_id: int, file: UploadFile) -> models.RadiologyStudy:
    """Envoie un fichier .dcm à Orthanc puis rattache l'étude au dossier patient."""
    patient = get_patient(db, patient_id)
    # Même règle que pour la lame : le dossier porte une étude radiologique.
    if patient.radiology_studies:
        raise Conflict(
            "Ce dossier contient deja un examen radiologique. "
            "Supprimez-le avant d'en importer un autre."
        )

    if Path(file.filename or "").suffix.lower() != ".dcm":
        raise InvalidInput("Format accepté : .dcm")

    try:
        orthanc_response = await run_in_threadpool(orthanc.upload_instance, file.file)
        if orthanc_response.status_code not in {200, 202}:
            raise UpstreamError("Orthanc a refusé le fichier DICOM")

        instance = orthanc_response.json()
        instance_id = instance.get("ID")
        if not instance_id:
            raise UpstreamError("Orthanc n'a pas retourné d'identifiant")

        # `ParentStudy` figure dans la réponse du POST, pas dans le détail de
        # l'instance (qui n'expose que `ParentSeries`) : le relire par GET
        # renvoyait toujours None, donc un 502 systématique.
        study_id = instance.get("ParentStudy")
        if not study_id:
            raise UpstreamError("Étude Orthanc introuvable")

        # Les tags d'étude (date, description) et la modalité vivent aux
        # niveaux étude et série, jamais sur l'instance.
        study_tags: Dict[str, Any] = {}
        try:
            study_tags = (await run_in_threadpool(orthanc.get_study, study_id)).get(
                "MainDicomTags", {}
            )
        except Exception as error:
            print(f"Orthanc : tags d'etude illisibles ({error})")

        modality = "Inconnue"
        series_id = instance.get("ParentSeries")
        if series_id:
            try:
                modality = (
                    (await run_in_threadpool(orthanc.get_series, series_id))
                    .get("MainDicomTags", {})
                    .get("Modality", "Inconnue")
                )
            except Exception as error:
                print(f"Orthanc : modalite illisible ({error})")

        existing = (
            db.query(models.RadiologyStudy)
            .filter(models.RadiologyStudy.orthanc_study_id == study_id)
            .first()
        )
        if existing:
            # Orthanc dédoublonne par UID DICOM : re-téléverser le même fichier
            # renvoie l'étude déjà indexée, qui appartient peut-être à un AUTRE
            # dossier. On refuse plutôt que de simuler un import réussi.
            proprietaire = (
                db.query(models.Patient)
                .filter(models.Patient.id == existing.patient_id)
                .first()
            )
            nom = proprietaire.name if proprietaire else "un autre dossier"
            raise Conflict(
                f"Cet examen DICOM est deja rattache au dossier de {nom}. "
                "Un meme examen ne peut pas appartenir a deux patients."
            )

        study = models.RadiologyStudy(
            patient_id=patient.id,
            orthanc_study_id=study_id,
            modality=modality,
            description=study_tags.get("StudyDescription")
            or (file.filename or "Examen radiologique"),
            date=study_tags.get("StudyDate", ""),
        )
        db.add(study)
        db.commit()
        db.refresh(study)
        return study
    except ServiceError:
        db.rollback()
        raise
    except requests.RequestException as error:
        db.rollback()
        raise UpstreamError(f"Orthanc indisponible : {error}")
    finally:
        await file.close()


def _get_by_orthanc_id(db: Session, study_id: str) -> models.RadiologyStudy:
    radio = (
        db.query(models.RadiologyStudy)
        .filter(models.RadiologyStudy.orthanc_study_id == study_id)
        .first()
    )
    if not radio:
        raise NotFound("Radio introuvable")
    return radio


def get_report(db: Session, study_id: str) -> dict:
    """Compte-rendu d'une étude, désignée par son identifiant ORTHANC."""
    radio = _get_by_orthanc_id(db, study_id)
    return {"report": radio.report or "", "annotations": radio.annotations or ""}


def save_report(db: Session, study_id: str, payload: ReportPayload) -> dict:
    radio = _get_by_orthanc_id(db, study_id)
    radio.report = payload.report
    radio.annotations = payload.annotations
    db.commit()
    return {"message": "Compte-rendu et annotations sauvegardés !"}


def detach_study(db: Session, study_id: int) -> dict:
    """Détache un examen du dossier patient (identifiant en BASE, pas Orthanc).

    L'étude reste dans Orthanc : purger un PACS est une opération distincte.
    Le même fichier pourra donc être réimporté ensuite, y compris sur un
    autre dossier.
    """
    study = (
        db.query(models.RadiologyStudy)
        .filter(models.RadiologyStudy.id == study_id)
        .first()
    )
    if not study:
        raise NotFound("Examen radiologique introuvable")

    orthanc_id = study.orthanc_study_id
    db.delete(study)
    db.commit()

    return {
        "message": "Examen radiologique detache du dossier.",
        "orthanc_study_id": orthanc_id,
        "orthanc_conserve": True,
    }
