"""Suppression des tuiles DZI sur le disque, sans faire attendre l'utilisateur.

Un dossier de tuiles contient des dizaines de milliers de fichiers : le
supprimer prend près d'une minute sur un volume monté. On le **renomme**
d'abord — opération instantanée, qui le fait disparaître pour de bon du
point de vue de l'application — puis on planifie son effacement réel en
tâche de fond (`BackgroundTasks` de FastAPI, branché par le routeur).
"""

import shutil
import uuid
from pathlib import Path
from typing import List

import config


def retirer_chemin(cible: Path, rapport: dict, differes: List[Path]) -> None:
    """Retire un chemin de tuiles, immédiatement pour l'utilisateur.

    Un fichier est supprimé tout de suite. Un dossier est renommé, et son
    nouveau chemin ajouté à `differes` pour l'effacement en tâche de fond.
    Les compteurs et avertissements sont écrits dans `rapport`.
    """
    racine = Path(config.DZI_FOLDER).resolve()
    try:
        resolu = cible.resolve()
        # Garde-fou : ne jamais sortir du dossier des tuiles.
        if not str(resolu).startswith(str(racine)):
            rapport["warnings"].append(f"Chemin hors dzi_data ignore : {cible}")
            return

        if resolu.is_dir():
            ecarte = resolu.with_name(f"{resolu.name}.suppression-{uuid.uuid4().hex[:8]}")
            resolu.rename(ecarte)
            differes.append(ecarte)
            rapport["dzi_paths"] += 1
        elif resolu.exists():
            resolu.unlink()
            rapport["dzi_paths"] += 1
    except Exception as error:
        rapport["warnings"].append(f"DZI {cible} : {error}")


def supprimer_tuiles(image_url: str, rapport: dict, differes: List[Path]) -> None:
    """Retire le fichier .dzi et le dossier de tuiles `_files` d'une lame."""
    if not image_url:
        return

    stem = Path(image_url).stem
    parent = Path(config.DZI_FOLDER) / Path(image_url).parent
    for cible in (parent / f"{stem}.dzi", parent / f"{stem}_files"):
        retirer_chemin(cible, rapport, differes)


def effacer_en_arriere_plan(chemins: List[Path]) -> None:
    """Efface réellement les dossiers déjà mis de côté (tâche de fond).

    Retire ensuite le dossier parent s'il est devenu vide, pour ne pas laisser
    une arborescence de dossiers patients sans contenu.
    """
    racine = Path(config.DZI_FOLDER).resolve()
    for chemin in chemins:
        try:
            shutil.rmtree(chemin, ignore_errors=True)
            parent = chemin.parent
            if parent != racine and str(parent).startswith(str(racine)):
                try:
                    parent.rmdir()  # échoue si le dossier n'est pas vide
                except OSError:
                    pass
        except Exception as error:  # noqa: BLE001 - nettoyage best effort
            print(f"Nettoyage differe impossible pour {chemin} : {error}")
