"""Résolution des lames sources dans le stockage objet.

Le dépôt MinIO contient deux dispositions issues de l'histoire du projet :

* ``{folder_id}/{nom}{ext}`` — écrite par ``POST /patients/{id}/upload-biopsy``
  et par le script d'injection actuel ;
* ``{nom}{ext}`` à la racine du bucket — écrite par l'ancien script, qui
  ignorait les dossiers patients.

S'y ajoute le fait que ``Biopsy.image_url`` désigne le fichier DZI affiché par
le viewer, dont le nom ne correspond pas forcément à celui de l'objet MinIO :
les lames de démonstration sont tuilées sous ``biopsie_cmu_N``.

Ce module est partagé par l'API et par le script d'injection : sans lui, la
même liste d'emplacements serait écrite à deux endroits, avec le risque
qu'elle diverge.
"""

from pathlib import Path
from typing import List, Optional

SLIDE_EXTENSIONS = (".svs", ".tif", ".tiff")


def safe_folder_name(name: str) -> str:
    """Nettoie un identifiant de dossier pour en faire un préfixe de clé."""
    cleaned = "".join(c for c in (name or "") if c.isalnum() or c in (" ", "-", "_"))
    return cleaned.strip().replace(" ", "-")


def candidate_object_keys(
    minio_client, bucket: str, folder_id: str, image_url: str
) -> List[str]:
    """Emplacements possibles d'une lame, du plus précis au plus large.

    L'ordre compte : on privilégie la disposition applicative avant de se
    rabattre sur les vestiges de l'ancien script d'injection.
    """
    folder = safe_folder_name(folder_id)
    stem = Path(image_url or "").stem
    candidates: List[str] = []

    # 1. Disposition de l'upload applicatif.
    candidates += [f"{folder}/{stem}{ext}" for ext in SLIDE_EXTENSIONS]
    # 2. Objet à la racine portant le même nom que le DZI.
    candidates += [f"{stem}{ext}" for ext in SLIDE_EXTENSIONS]
    # 3. Objet à la racine nommé d'après le dossier patient (lames injectées).
    candidates += [f"{folder}{ext}" for ext in SLIDE_EXTENSIONS]

    # 4. Tout objet déposé sous le dossier du patient, hors extractions.
    try:
        for obj in minio_client.list_objects(bucket, prefix=f"{folder}/", recursive=True):
            name = obj.object_name
            if "/extractions/" in name:
                continue
            if name.lower().endswith(SLIDE_EXTENSIONS) and name not in candidates:
                candidates.append(name)
    except Exception as error:  # noqa: BLE001 - le listing reste facultatif
        print(f"MinIO : listing impossible pour {folder} ({error})")

    return candidates


def find_object_key(
    minio_client, bucket: str, folder_id: str, image_url: str
) -> Optional[str]:
    """Clé du premier emplacement réellement présent, ou ``None``.

    Ne télécharge rien : utile pour vérifier l'existence d'une source sans
    rapatrier plusieurs centaines de mégaoctets.
    """
    for key in candidate_object_keys(minio_client, bucket, folder_id, image_url):
        try:
            minio_client.stat_object(bucket, key)
            return key
        except Exception:
            continue
    return None
