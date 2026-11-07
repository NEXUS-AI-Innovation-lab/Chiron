"""Configuration du backend, lue une seule fois depuis l'environnement.

Toutes les adresses et tous les identifiants des services voisins sont ici,
pour l'API comme pour le script d'injection (`seed_images.py`). Avant le
découpage, ils étaient écrits en dur au milieu de `main.py` (piège B12 de
docs/09-pieges-et-bugs.md).

Les valeurs par défaut correspondent à la pile de développement de
`docker-compose.yml`.
"""

import os

# --- Tuiles DZI -------------------------------------------------------------
# Dossier servi en statique sous /dzi_data (volume Docker).
DZI_FOLDER = os.getenv("DZI_FOLDER", "/app/dzi_data")

# Adresse publique de l'API, vue par le NAVIGATEUR. Sert à construire le
# champ `url` des extractions.
PUBLIC_API_URL = os.getenv("PUBLIC_API_URL", "http://localhost:8002")

# --- Stockage objet S3 (Garage) : lames sources et extractions ---------------
# N'importe quel service compatible S3 convient ; la pile utilise Garage.
# Les clés par défaut sont celles de DÉVELOPPEMENT déclarées dans
# docker-compose.yml : à remplacer en déploiement. Garage impose leur format
# (identifiant « GK » + 24 caractères hexadécimaux, secret de 64).
S3_ENDPOINT = os.getenv("S3_ENDPOINT", "http://garage:3900")
S3_REGION = os.getenv("S3_REGION", "garage")  # = s3_region de garage.toml
S3_ACCESS_KEY = os.getenv("S3_ACCESS_KEY", "GK7f5b9f737e5d1f5b2d907639")
S3_SECRET_KEY = os.getenv(
    "S3_SECRET_KEY", "baa7d18ca1d495315d4bf859e05dd3a3f2898ccff58f634c7f309f1764c47939"
)
S3_BUCKET = os.getenv("S3_BUCKET", "biopsie")

# --- Orthanc (PACS radiologie) ----------------------------------------------
ORTHANC_URL = os.getenv("ORTHANC_URL", "http://orthanc:8042")
ORTHANC_USER = os.getenv("ORTHANC_USER", "orthanc")
ORTHANC_PASSWORD = os.getenv("ORTHANC_PASSWORD", "orthanc")

# --- InstanSeg (micro-service IA) -------------------------------------------
INSTANSEG_URL = os.getenv("INSTANSEG_URL", "http://instanseg:7000")
