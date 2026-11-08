"""Traitements d'image sur les lames, avec PyVips.

Fonctions pures et SYNCHRONES : pas de base de données, pas de réseau. Elles
peuvent durer plusieurs minutes sur une grosse lame, donc les appelants
asynchrones doivent les exécuter via `run_in_threadpool` (sinon toute l'API
gèle pendant le traitement).
"""

from pathlib import Path
from typing import Optional, Tuple

import pyvips

# Au-delà de ces bornes, la valeur lue n'est pas une vraie résolution de
# scanner : un TIFF sans tag de résolution ou un PNG à 72 dpi en donnent une.
TAILLE_PIXEL_MIN_UM = 0.05
TAILLE_PIXEL_MAX_UM = 5.0


def tile_to_dzi(source_path: Path, output_base: Path) -> None:
    """Découpe une lame en tuiles DZI de 256 px (crée `<base>.dzi` et `<base>_files/`).

    Lecture séquentielle : la lame n'est jamais chargée entièrement en RAM.
    """
    pyvips.Image.new_from_file(str(source_path), access="sequential").dzsave(
        str(output_base),
        tile_size=256,
        overlap=1,
        suffix=".jpg",
    )


def lire_taille_pixel(image: "pyvips.Image") -> Optional[float]:
    """Taille d'un pixel de la lame en µm, ou None si elle n'est pas renseignée.

    InstanSeg a été entraîné à ~0,5 µm/px. Sans cette valeur, il suppose que
    toute image est à cette échelle : sur une lame ×40 (0,25 µm/px), les noyaux
    lui paraissent deux fois trop gros et la segmentation se dégrade sans
    erreur visible.
    """
    taille = None
    if "openslide.mpp-x" in image.get_fields():
        # .svs et autres formats OpenSlide : valeur donnée par le scanner.
        try:
            taille = float(image.get("openslide.mpp-x"))
        except ValueError:
            taille = None
    elif image.xres > 0:
        # TIFF / OME-TIFF : PyVips expose la résolution en pixels par mm.
        taille = 1000.0 / image.xres

    if taille is None or not TAILLE_PIXEL_MIN_UM <= taille <= TAILLE_PIXEL_MAX_UM:
        return None
    return taille


def borner_region(
    source_path: Path, x: int, y: int, width: int, height: int
) -> Tuple[int, int, int, int, Optional[float]]:
    """Ouvre la lame et borne la région demandée à ses dimensions réelles.

    Une zone demandée hors de la lame est ramenée à l'intérieur (la fenêtre
    glisse) au lieu d'être tronquée à zéro : extract_area refuse une largeur
    ou une hauteur nulle et fait échouer la requête avec une 500 opaque.

    :returns: (x, y, largeur, hauteur, taille_pixel_um)
    """
    image = pyvips.Image.new_from_file(str(source_path), access="sequential")
    largeur = max(1, min(width, image.width))
    hauteur = max(1, min(height, image.height))
    x = max(0, min(x, image.width - largeur))
    y = max(0, min(y, image.height - hauteur))
    return x, y, largeur, hauteur, lire_taille_pixel(image)


def extraire_png(source_path: Path, x: int, y: int, largeur: int, hauteur: int) -> bytes:
    """Découpe la région et l'encode en PNG (entrée attendue par InstanSeg)."""
    image = pyvips.Image.new_from_file(str(source_path), access="sequential")
    return image.extract_area(x, y, largeur, hauteur).write_to_buffer(".png")


def save_region_as_tiff(
    source_path: Path, x: int, y: int, width: int, height: int, output_path: str
) -> None:
    """Enregistre une région de la lame en TIFF pyramidal (extraction).

    Contrairement à `borner_region`, seule l'origine est bornée : une région
    qui déborde de la lame fait échouer `extract_area` (comportement
    historique de `POST /extract-roi`).
    """
    image = pyvips.Image.new_from_file(str(source_path), access="sequential")
    safe_x = max(0, min(x, image.width))
    safe_y = max(0, min(y, image.height))
    region = image.extract_area(safe_x, safe_y, width, height)
    region.tiffsave(
        output_path,
        compression="jpeg",
        Q=90,
        tile=True,
        pyramid=True,
        bigtiff=True,
    )
