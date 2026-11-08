"""Extractions : régions découpées dans une lame, avec leur compte rendu et leurs dessins."""

import os
import shutil
import time
from typing import List

from sqlalchemy.orm import Session

import config
import models
from clients.object_storage import object_storage
from schemas.extractions import AnalysisPayload
from services import slide_processing
from services.biopsies import download_biopsy_source
from services.errors import Forbidden, InvalidInput, NotFound

# Champs du formulaire de compte rendu, copiés tels quels du corps de la
# requête vers la ligne `Extraction` (création comme mise à jour).
REPORT_FIELDS = (
    "prelevement_type",
    "prelevement_date",
    "block_number",
    "fixation",
    "staining",
    "macro_obs",
    "micro_obs",
    "histo_type",
    "sbr_grade",
    "margins",
    "hormonal_receptors",
    "diagnosis",
    "comments",
    "status",
    "pathologist",
    "validation_date",
)


def _slide_count(data: AnalysisPayload):
    """Le frontend peut envoyer une chaîne vide : seul un entier est conservé."""
    return data.slide_count if isinstance(data.slide_count, int) else None


def _get_extraction(db: Session, extraction_id: int, detail: str) -> models.Extraction:
    ext = db.query(models.Extraction).filter(models.Extraction.id == extraction_id).first()
    if not ext:
        raise NotFound(detail)
    return ext


def create_from_region(db: Session, data: AnalysisPayload) -> dict:
    """Découpe une région de la lame, l'envoie dans le stockage S3 et crée l'extraction.

    Attention (bug A8 de docs/09-pieges-et-bugs.md) : une erreur de découpage
    ou d'envoi est seulement journalisée, et l'extraction est créée quand même.
    """
    patient = (
        db.query(models.Patient)
        .filter(models.Patient.folder_id == data.patient_folder)
        .first()
    )
    if not patient:
        # Cette route créait autrefois un dossier patient (âge 0) à partir du
        # corps de la requête : inacceptable sur un dossier médical.
        raise NotFound(
            "Dossier patient introuvable. Creez-le d'abord "
            "(POST /patients) avant d'extraire une region."
        )

    safe_folder = "".join(
        c for c in data.patient_folder if c.isalnum() or c in (" ", "-", "_")
    ).strip()
    patient_dir = os.path.join(config.DZI_FOLDER, safe_folder, "extractions")
    os.makedirs(patient_dir, exist_ok=True)
    filename_str = f"extraction_{int(time.time())}.svs"
    output_path = os.path.join(patient_dir, filename_str)

    if not patient.biopsies:
        raise NotFound("Aucune biopsie disponible pour ce patient")
    source_path = download_biopsy_source(patient, prefix="chiron-roi")

    if source_path.exists():
        try:
            slide_processing.save_region_as_tiff(
                source_path, data.x, data.y, data.width, data.height, output_path
            )
            try:
                object_storage.upload_file(
                    f"{safe_folder}/extractions/{filename_str}", output_path
                )
                if os.path.exists(output_path):
                    os.remove(output_path)
            except Exception as storage_err:
                print(f"❌ Erreur stockage S3 : {storage_err}")
        except Exception as e:
            print(f"⚠️ Erreur PyVips: {e}")
        finally:
            source_path.unlink(missing_ok=True)

    new_ext = models.Extraction(
        patient_id=patient.id,
        label=data.annotation_label,
        dzi_url=f"{safe_folder}/extractions/{filename_str}",
        x=data.x,
        y=data.y,
        w=data.width,
        h=data.height,
        owner=data.owner,
        slide_count=_slide_count(data),
        **{field: getattr(data, field) for field in REPORT_FIELDS},
    )
    db.add(new_ext)
    db.commit()
    db.refresh(new_ext)

    return {
        "message": "Dossier créé avec succès",
        "id": new_ext.id,
        "extraction_id": new_ext.id,
    }


def save_annotations(db: Session, data: AnalysisPayload) -> dict:
    """Met à jour le compte rendu et REMPLACE tous les dessins de l'extraction.

    Attention (piège B5) : tous les champs sont écrasés, y compris par des
    valeurs vides si le frontend ne les envoie pas.
    """
    if not data.extraction_id:
        raise InvalidInput("ID manquant")
    ext = _get_extraction(db, data.extraction_id, "Introuvable")

    ext.label = data.annotation_label
    ext.slide_count = _slide_count(data)
    for field in REPORT_FIELDS:
        setattr(ext, field, getattr(data, field))

    db.query(models.Drawing).filter(models.Drawing.extraction_id == ext.id).delete()
    for d in data.drawings:
        db.add(
            models.Drawing(
                extraction_id=ext.id,
                type=d.type,
                x=d.x,
                y=d.y,
                w=d.w,
                h=d.h,
                radius=d.radius,
                text=d.text,
                points=d.points,
                author=d.author,
            )
        )
    db.commit()
    return {"message": "Mis à jour"}


def list_for_folder(db: Session, folder_id: str) -> List[dict]:
    """Extractions d'un dossier (liste vide si le dossier n'existe pas)."""
    patient = db.query(models.Patient).filter(models.Patient.folder_id == folder_id).first()
    if not patient:
        return []
    return [
        {
            "id": e.id,
            "filename": e.label,
            "annotation_label": e.label,
            # Bug A5 : ce fichier n'existe pas sur le disque (il est dans le stockage S3).
            "url": f"{config.PUBLIC_API_URL}/dzi_data/{e.dzi_url}",
            "roi": {"x": e.x, "y": e.y, "w": e.w, "h": e.h},
            "diagnosis": e.diagnosis,
            "status": e.status,
            "owner": e.owner,
        }
        for e in patient.extractions
    ]


def get_details(db: Session, extraction_id: int) -> dict:
    """Compte rendu complet d'une extraction, avec ses dessins."""
    ext = _get_extraction(db, extraction_id, "Non trouvé")
    return {
        "id": ext.id,
        "filename": ext.label,
        "annotation_label": ext.label,
        "slide_count": ext.slide_count,
        **{field: getattr(ext, field) for field in REPORT_FIELDS},
        "drawings": [
            {
                "type": d.type,
                "x": d.x,
                "y": d.y,
                "w": d.w,
                "h": d.h,
                "radius": d.radius,
                "text": d.text,
                "points": d.points,
                "author": d.author,
            }
            for d in ext.drawings
        ],
    }


def delete_extraction(db: Session, extraction_id: int, username: str) -> dict:
    """Supprime une extraction si `username` en est le propriétaire.

    Le contrôle est déclaratif (sécurité S4) : n'importe qui peut envoyer le
    bon nom d'utilisateur tant qu'il n'y a pas d'authentification.
    """
    ext = _get_extraction(db, extraction_id, "Not Found")
    if ext.owner != username:
        raise Forbidden("Forbidden")
    try:
        object_storage.delete(ext.dzi_url)
    except Exception:
        pass
    try:
        # Bug A9 : ce chemin ne correspond à aucun fichier réel.
        file_path = os.path.join(config.DZI_FOLDER, ext.dzi_url)
        if os.path.exists(file_path):
            os.remove(file_path)
            files_dir = file_path.replace(".svs", "_files").replace(".dzi", "_files")
            if os.path.exists(files_dir):
                shutil.rmtree(files_dir)
    except Exception:
        pass
    db.delete(ext)
    db.commit()
    return {"message": "Supprimé"}
