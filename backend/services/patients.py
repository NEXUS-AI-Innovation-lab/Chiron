"""Dossiers patients : création, lecture et suppression complète."""

import uuid
from pathlib import Path
from typing import List, Tuple

from sqlalchemy.orm import Session

import config
import models
from clients.object_storage import object_storage
from schemas.patients import PatientCreate
from services import tile_cleanup
from services.errors import NotFound


def safe_folder_name(value: str) -> str:
    """Nettoie un nom pour en faire un nom de dossier (`"patient"` si vide).

    Différent de `storage.safe_folder_name`, qui renvoie une chaîne vide :
    les deux sont conservés tels quels pour ne pas changer les chemins
    existants.
    """
    cleaned = "".join(char for char in value if char.isalnum() or char in ("-", "_", " "))
    return cleaned.strip().replace(" ", "-") or "patient"


def get_patient(db: Session, patient_id: int) -> models.Patient:
    """Patient par identifiant numérique, ou `NotFound`."""
    patient = db.query(models.Patient).filter(models.Patient.id == patient_id).first()
    if not patient:
        raise NotFound("Patient introuvable")
    return patient


def list_patients(db: Session) -> List[models.Patient]:
    return db.query(models.Patient).all()


def create_patient(db: Session, payload: PatientCreate) -> models.Patient:
    """Crée un dossier. Le `folder_id` = nom nettoyé + suffixe aléatoire."""
    folder_id = f"{safe_folder_name(payload.name)}-{uuid.uuid4().hex[:8]}"
    patient = models.Patient(
        name=payload.name.strip(),
        age=payload.age,
        folder_id=folder_id,
        birth_date=payload.birth_date,
        family_history=payload.family_history,
        medical_history=payload.medical_history,
    )
    db.add(patient)
    db.commit()
    db.refresh(patient)
    return patient


def delete_patient(db: Session, patient_id: int) -> Tuple[dict, List[Path]]:
    """Supprime un patient et tout ce qui lui appartient.

    Sont retirés : les objets S3 rangés sous son dossier, les tuiles DZI
    de ses biopsies, puis la ligne patient — la cascade ORM emporte biopsies,
    extractions (avec leurs dessins et leur workflow) et études radiologiques.

    Les études DICOM ne sont PAS supprimées d'Orthanc : purger un PACS est une
    opération à part, volontairement laissée hors de cette fonction. Les
    objets déposés à la racine du bucket par le seeder sont également
    conservés : ils sont réinjectés à chaque démarrage et peuvent servir à
    d'autres dossiers.

    :returns: (rapport de suppression, dossiers à effacer en tâche de fond)
    """
    patient = get_patient(db, patient_id)
    name = patient.name

    folder = safe_folder_name(patient.folder_id)
    report = {
        "patient": name,
        "folder_id": patient.folder_id,
        # Clé de réponse conservée telle quelle : le frontend la lit.
        "minio_objects": 0,
        "dzi_paths": 0,
        "orthanc_studies_kept": len(patient.radiology_studies),
        "warnings": [],
    }

    # 1. Objets S3 rangés sous le dossier du patient (lame + extractions).
    try:
        keys = list(object_storage.list_keys(prefix=f"{folder}/"))
        for key in keys:
            try:
                object_storage.delete(key)
                report["minio_objects"] += 1
            except Exception as error:
                report["warnings"].append(f"Stockage S3 {key} : {error}")
    except Exception as error:
        report["warnings"].append(f"Stockage S3 listing : {error}")

    # 2. Tuiles DZI : le dossier du patient, plus le DZI propre à chaque
    #    biopsie (les lames de démonstration sont tuilées à la racine).
    targets = [Path(config.DZI_FOLDER) / folder]
    for biopsy in patient.biopsies:
        if not biopsy.image_url:
            continue
        stem = Path(biopsy.image_url).stem
        parent = Path(config.DZI_FOLDER) / Path(biopsy.image_url).parent
        targets.append(parent / f"{stem}.dzi")
        targets.append(parent / f"{stem}_files")

    differes: List[Path] = []
    for target in targets:
        tile_cleanup.retirer_chemin(target, report, differes)

    # 3. Lignes en base (la cascade emporte biopsies, extractions, workflow).
    db.delete(patient)
    db.commit()

    report["message"] = f"Patient « {name} » supprimé."
    return report, differes
