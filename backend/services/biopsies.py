"""Lames de biopsie : import (MinIO + tuilage DZI), récupération, suppression."""

import tempfile
import uuid
from pathlib import Path
from typing import List, Optional, Tuple

from fastapi import UploadFile
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

import config
import models
import storage
from clients.object_storage import BUCKET_NAME, ensure_bucket, minio_client
from services import slide_processing, tile_cleanup
from services.errors import Conflict, InvalidInput, NotFound, ServiceError
from services.patients import get_patient, safe_folder_name

SLIDE_EXTENSIONS = {".svs", ".tif", ".tiff"}


async def import_biopsy(db: Session, patient_id: int, file: UploadFile) -> models.Biopsy:
    """Importe une lame : copie temporaire, envoi dans MinIO, tuilage DZI, ligne en base.

    Un dossier ne porte qu'une lame : tout le reste de l'application
    travaille sur `patient.biopsies[0]`. Accepter la seconde donnait
    l'illusion d'un import réussi alors qu'elle restait invisible.
    """
    patient = get_patient(db, patient_id)
    if patient.biopsies:
        raise Conflict(
            f"Ce dossier contient deja une lame ({patient.biopsies[0].image_url}). "
            "Supprimez-la avant d'en importer une autre."
        )

    extension = Path(file.filename or "").suffix.lower()
    if extension not in SLIDE_EXTENSIONS:
        raise InvalidInput("Format accepté : .svs, .tif ou .tiff")

    folder_id = safe_folder_name(patient.folder_id)
    patient_dir = Path(config.DZI_FOLDER) / folder_id
    patient_dir.mkdir(parents=True, exist_ok=True)
    source_name = Path(file.filename or "biopsy.svs").name
    source_path: Optional[Path] = None
    dzi_path = patient_dir / f"{Path(source_name).stem}.dzi"

    try:
        # Le fichier est copié par blocs : il n'est jamais chargé intégralement
        # en RAM. Le fichier temporaire va dans le dossier temporaire du
        # système, et NON dans `dzi_data` : ce dernier est monté en statique,
        # la lame brute y était donc téléchargeable le temps de l'import.
        with tempfile.NamedTemporaryFile(delete=False, suffix=extension) as temporary:
            source_path = Path(temporary.name)
            while chunk := await file.read(8 * 1024 * 1024):
                temporary.write(chunk)

        ensure_bucket()
        minio_object_name = f"{folder_id}/{source_name}"
        # Hors boucle d'événements : l'envoi d'une lame de plusieurs centaines
        # de mégaoctets gelait l'API entière.
        await run_in_threadpool(
            minio_client.fput_object, BUCKET_NAME, minio_object_name, str(source_path)
        )

        # Étape la plus longue (plusieurs minutes), purement synchrone.
        await run_in_threadpool(
            slide_processing.tile_to_dzi,
            source_path,
            patient_dir / Path(source_name).stem,
        )

        biopsy = models.Biopsy(
            patient_id=patient.id,
            image_url=f"{folder_id}/{dzi_path.name}",
            status="Non analysé",
        )
        db.add(biopsy)
        db.commit()
        db.refresh(biopsy)
        return biopsy
    except Exception as error:
        db.rollback()
        raise ServiceError(f"Échec de l'upload de biopsie : {error}", status_code=500)
    finally:
        await file.close()
        if source_path and source_path.exists():
            source_path.unlink()


def download_biopsy_source(patient: models.Patient, prefix: str = "chiron") -> Path:
    """Télécharge la lame source d'un patient depuis MinIO vers un fichier temporaire.

    Le nom de l'objet MinIO ne correspond pas toujours au DZI affiché (voir
    `storage.py`) : on essaie les emplacements du plus précis au plus large,
    et on lève une `NotFound` explicite listant ce qui a été cherché.

    L'appelant doit supprimer le fichier renvoyé une fois le travail fini.
    """
    if not patient.biopsies:
        raise NotFound("Aucune biopsie disponible pour ce patient")

    candidates = storage.candidate_object_keys(
        minio_client, BUCKET_NAME, patient.folder_id, patient.biopsies[0].image_url
    )

    for key in candidates:
        target = Path(tempfile.gettempdir()) / f"{prefix}-{uuid.uuid4().hex}{Path(key).suffix}"
        try:
            minio_client.fget_object(BUCKET_NAME, key, str(target))
            return target
        except Exception:
            if target.exists():
                target.unlink()

    raise NotFound(
        "Lame source introuvable dans MinIO pour ce patient. "
        f"Emplacements essayes : {', '.join(candidates[:6])}."
    )


def delete_biopsy(db: Session, biopsy_id: int) -> Tuple[dict, List[Path]]:
    """Supprime une lame : objet MinIO, tuiles DZI, puis la ligne.

    Les extractions déjà réalisées sur cette lame sont conservées : elles
    portent leur propre fichier et leur propre compte rendu. Le rapport
    indique combien restent rattachées au dossier.

    :returns: (rapport de suppression, dossiers à effacer en tâche de fond)
    """
    biopsy = db.query(models.Biopsy).filter(models.Biopsy.id == biopsy_id).first()
    if not biopsy:
        raise NotFound("Lame introuvable")

    patient = (
        db.query(models.Patient).filter(models.Patient.id == biopsy.patient_id).first()
    )
    rapport = {"minio_objects": 0, "dzi_paths": 0, "extractions_conservees": 0, "warnings": []}

    if patient:
        rapport["extractions_conservees"] = len(patient.extractions)
        cle = storage.find_object_key(
            minio_client, BUCKET_NAME, patient.folder_id, biopsy.image_url
        )
        if cle:
            try:
                minio_client.remove_object(BUCKET_NAME, cle)
                rapport["minio_objects"] += 1
            except Exception as error:
                rapport["warnings"].append(f"MinIO {cle} : {error}")

    differes: List[Path] = []
    tile_cleanup.supprimer_tuiles(biopsy.image_url, rapport, differes)

    db.delete(biopsy)
    db.commit()

    rapport["message"] = "Lame supprimee."
    return rapport, differes
