"""Configuration du backend, lue une seule fois depuis l'environnement.

Toutes les adresses et tous les identifiants des services voisins sont ici.
Avant le découpage, ils étaient écrits en dur au milieu de `main.py`, si bien
que les variables `MINIO_*` déclarées dans `docker-compose.yml` n'étaient
jamais lues (piège B12 de docs/09-pieges-et-bugs.md).

Les valeurs par défaut sont exactement celles qui étaient en dur : sans
variable d'environnement, le comportement est identique à l'ancien.
"""

import os

# --- Tuiles DZI -------------------------------------------------------------
# Dossier servi en statique sous /dzi_data (volume Docker).
DZI_FOLDER = os.getenv("DZI_FOLDER", "/app/dzi_data")

# Adresse publique de l'API, vue par le NAVIGATEUR. Sert à construire le
# champ `url` des extractions.
PUBLIC_API_URL = os.getenv("PUBLIC_API_URL", "http://localhost:8002")

# --- MinIO (stockage objet des lames) ---------------------------------------
MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "minio:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "minioadmin")
MINIO_BUCKET_NAME = os.getenv("MINIO_BUCKET_NAME", "biopsie")

# --- Orthanc (PACS radiologie) ----------------------------------------------
ORTHANC_URL = os.getenv("ORTHANC_URL", "http://orthanc:8042")
ORTHANC_USER = os.getenv("ORTHANC_USER", "orthanc")
ORTHANC_PASSWORD = os.getenv("ORTHANC_PASSWORD", "orthanc")

# --- InstanSeg (micro-service IA) -------------------------------------------
INSTANSEG_URL = os.getenv("INSTANSEG_URL", "http://instanseg:7000")
