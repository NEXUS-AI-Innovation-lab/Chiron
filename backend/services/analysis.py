"""Analyse IA d'une région de lame par InstanSeg (segmentation des noyaux).

Déroulé : télécharger la lame source depuis le stockage S3 → borner la région →
la découper en PNG → l'envoyer à InstanSeg → calculer les indicateurs
(nombre de noyaux, densité, taille moyenne, pléomorphisme).
"""

from typing import Any, Dict, List

import numpy as np
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

import models
from clients.instanseg import instanseg_client
from schemas.extractions import AnalysisPayload
from services import slide_processing
from services.biopsies import download_biopsy_source
from services.errors import NotFound, ServiceError, ServiceUnavailable

# Au-delà, l'inférence CPU devient trop longue : on demande une zone plus petite.
TAILLE_MAX_REGION_PX = 1500


def _bilan(segment_result, largeur: int, hauteur: int) -> str:
    """Texte de synthèse affiché au pathologiste."""
    instances = segment_result.instances
    cell_count = segment_result.instance_count
    if cell_count <= 0:
        return "🔬 Bilan InstanSeg : Aucune structure nucléaire détectée dans cette zone."

    cell_areas = [inst.area_px for inst in instances]
    avg_size = int(np.mean(cell_areas))
    max_size = int(np.max(cell_areas))

    pleomorphism = "Faible (Noyaux réguliers)"
    if max_size > avg_size * 3:
        pleomorphism = "Élevé (Atypies cytonucléaires marquées)"
    elif max_size > avg_size * 2:
        pleomorphism = "Modéré"

    area_pixels = largeur * hauteur
    density = round((cell_count / area_pixels) * 1000000)

    return (
        f"🔬 Bilan InstanSeg :\n"
        f"• Noyaux détectés : {cell_count}\n"
        f"• Densité : {density} cellules / Mpx\n"
        f"• Taille moyenne : {avg_size} px²\n"
        f"• Pléomorphisme : {pleomorphism}\n"
        f"• Temps traitement : {segment_result.processing_time_s}s"
    )


def _serialiser_contours(contour_points) -> List[Dict[str, Any]]:
    """Convertit les objets renvoyés par le client InstanSeg en dictionnaires JSON."""
    contour_points_dict = []
    for blob in contour_points:
        try:
            contour_points_dict.append(
                blob.dict()
                if hasattr(blob, "dict")
                else {
                    "color": getattr(blob, "color", "#00ff00"),
                    "points": [
                        {"x": p.x, "y": p.y} if hasattr(p, "x") else p
                        for p in getattr(blob, "points", [])
                    ],
                }
            )
        except Exception as e:
            print(f"⚠️ Erreur sérialisation blob : {e}")
    return contour_points_dict


async def analyze_region(db: Session, data: AnalysisPayload) -> Dict[str, Any]:
    """Analyse la région (x, y, width, height) de la lame du dossier `patient_folder`."""
    patient = (
        db.query(models.Patient).filter(models.Patient.folder_id == data.patient_folder).first()
    )
    if not patient or not patient.biopsies:
        raise NotFound("Aucune biopsie disponible pour ce patient")

    # Téléchargement de la lame source (potentiellement plusieurs centaines
    # de Mo) : hors boucle d'événements.
    source_path = await run_in_threadpool(download_biopsy_source, patient, "chiron-ai")

    try:
        safe_x, safe_y, safe_w, safe_h, pixel_size = await run_in_threadpool(
            slide_processing.borner_region,
            source_path, data.x, data.y, data.width, data.height,
        )
        if pixel_size is None:
            print("⚠️ Résolution de la lame inconnue : InstanSeg suppose ~0,5 µm/px.")

        if safe_w > TAILLE_MAX_REGION_PX or safe_h > TAILLE_MAX_REGION_PX:
            # NB : le fichier temporaire n'est pas supprimé dans ce cas
            # (comportement historique conservé).
            return {
                "suggestion": "❌ Zone trop vaste. L'IA requiert un patch plus petit (zoom maximum). Dessinez un rectangle plus petit (max 1500x1500px).",
                "cell_count": 0,
                "contour_points": [],
            }

        print(f"📐 Extraction région {safe_w}x{safe_h}px...")
        png_data = await run_in_threadpool(
            slide_processing.extraire_png, source_path, safe_x, safe_y, safe_w, safe_h
        )
        source_path.unlink(missing_ok=True)

        print(f"🧠 Analyse InstanSeg en cours ({safe_w}x{safe_h} pixels)...")
        try:
            segment_result = await instanseg_client.segment(
                file_bytes=png_data,
                model="brightfield_nuclei",
                target="nuclei",
                pixel_size=pixel_size,
            )
        except Exception as e:
            print(f"❌ Erreur InstanSeg : {e}")
            raise ServiceUnavailable(f"Service InstanSeg indisponible : {str(e)}")

        # Les contours sont un bonus : leur échec ne fait pas échouer l'analyse.
        contour_points = []
        try:
            print("📍 Appel segment_points (mode centroids)...")
            contour_points = await instanseg_client.segment_points(
                file_bytes=png_data,
                model="brightfield_nuclei",
                target="nuclei",
                pixel_size=pixel_size,
                mode="centroids",
            )
            print(f"📍 Contours reçus : {len(contour_points)} entités")
        except Exception as e:
            print(f"⚠️ Impossible de récupérer les contours InstanSeg : {e}")
            contour_points = []

        cell_count = segment_result.instance_count
        result_message = _bilan(segment_result, safe_w, safe_h)
        print(f"✅ Résultat IA : {cell_count} cellules, {len(contour_points)} points générés.")

        return {
            "suggestion": result_message,
            "cell_count": cell_count,
            "contour_points": _serialiser_contours(contour_points),
            # Région réellement analysée : elle peut différer de celle demandée
            # (voir slide_processing.borner_region). Le frontend en a besoin
            # pour replacer les contours au bon endroit sur la lame.
            "region": {"x": safe_x, "y": safe_y, "width": safe_w, "height": safe_h},
        }

    except ServiceError:
        source_path.unlink(missing_ok=True)
        raise
    except Exception as e:
        source_path.unlink(missing_ok=True)
        print(f"❌ Erreur IA : {e}")
        raise ServiceError(str(e), status_code=500)
