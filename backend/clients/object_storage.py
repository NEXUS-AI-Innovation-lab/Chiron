"""Client MinIO partagé : stockage objet des lames sources et des extractions."""

from minio import Minio

import config

BUCKET_NAME = config.MINIO_BUCKET_NAME

# La construction ne contacte pas le serveur : aucune connexion n'est ouverte
# avant le premier appel réel.
minio_client = Minio(
    config.MINIO_ENDPOINT,
    access_key=config.MINIO_ACCESS_KEY,
    secret_key=config.MINIO_SECRET_KEY,
    secure=False,
)


def ensure_bucket() -> None:
    """Crée le bucket des lames s'il n'existe pas encore."""
    if not minio_client.bucket_exists(BUCKET_NAME):
        minio_client.make_bucket(BUCKET_NAME)
