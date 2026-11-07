"""Stockage objet S3 partagé (boto3), branché sur Garage.

Les lames sources et les extractions y sont rangées, dans le bucket
`config.S3_BUCKET`. Le reste du code n'utilise jamais boto3 directement : il
passe par l'objet `object_storage` ci-dessous, qui n'expose que les six
opérations dont Chiron a besoin. Changer de fournisseur S3 (Garage, MinIO,
AWS...) ne demande donc que de modifier `config.py`.
"""

from typing import Iterator

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

import config

BUCKET_NAME = config.S3_BUCKET

# Codes renvoyés par S3 quand l'objet ou le bucket n'existe pas.
_NOT_FOUND = {"404", "NoSuchKey", "NoSuchBucket", "NotFound"}


def make_s3_client():
    """Client boto3 réglé pour un service S3 auto-hébergé comme Garage.

    * `addressing_style="path"` : http://garage:3900/biopsie/cle, sans
      sous-domaine par bucket (qui ne résoudrait pas dans Docker) ;
    * `region_name` doit être égale à `s3_region` dans garage.toml, sinon
      Garage refuse la signature ;
    * les sommes de contrôle CRC « par défaut » de boto3 récent ne sont
      envoyées que si l'opération l'exige : c'est le comportement attendu
      par la plupart des services compatibles S3.
    """
    return boto3.client(
        "s3",
        endpoint_url=config.S3_ENDPOINT,
        region_name=config.S3_REGION,
        aws_access_key_id=config.S3_ACCESS_KEY,
        aws_secret_access_key=config.S3_SECRET_KEY,
        config=Config(
            signature_version="s3v4",
            s3={"addressing_style": "path"},
            request_checksum_calculation="when_required",
            response_checksum_validation="when_required",
            retries={"max_attempts": 3, "mode": "standard"},
        ),
    )


def is_not_found(error: Exception) -> bool:
    """Vrai si l'erreur boto3 signifie « objet ou bucket absent »."""
    return (
        isinstance(error, ClientError)
        and str(error.response.get("Error", {}).get("Code")) in _NOT_FOUND
    )


class ObjectStorage:
    """Les opérations de stockage utilisées par Chiron, sur un bucket donné.

    Toutes les méthodes sont synchrones (boto3 bloque) : depuis une fonction
    `async`, les appeler via `run_in_threadpool`.
    """

    def __init__(self, client, bucket: str):
        self.client = client
        self.bucket = bucket

    def ping(self) -> None:
        """Lève une exception si le service S3 ne répond pas."""
        self.client.list_buckets()

    def ensure_bucket(self) -> None:
        """Crée le bucket s'il n'existe pas encore.

        Avec Garage, le bucket est normalement déjà créé par
        garage/init_garage.py ; cet appel reste un filet de sécurité.
        """
        try:
            self.client.head_bucket(Bucket=self.bucket)
        except ClientError as error:
            if not is_not_found(error):
                raise
            self.client.create_bucket(Bucket=self.bucket)

    def upload_file(self, key: str, path: str) -> None:
        """Envoie un fichier local. Les gros fichiers partent en plusieurs morceaux."""
        self.client.upload_file(str(path), self.bucket, key)

    def download_file(self, key: str, path: str) -> None:
        """Rapatrie un objet dans un fichier local. Lève une erreur s'il n'existe pas."""
        self.client.download_file(self.bucket, key, str(path))

    def exists(self, key: str) -> bool:
        """Vrai si l'objet existe. Ne télécharge rien (requête HEAD)."""
        try:
            self.client.head_object(Bucket=self.bucket, Key=key)
            return True
        except ClientError as error:
            if is_not_found(error):
                return False
            raise

    def delete(self, key: str) -> None:
        """Supprime un objet. Ne lève pas d'erreur s'il n'existe déjà plus."""
        self.client.delete_object(Bucket=self.bucket, Key=key)

    def list_keys(self, prefix: str = "") -> Iterator[str]:
        """Toutes les clés sous `prefix`, sous-dossiers compris (pagination gérée)."""
        paginator = self.client.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=self.bucket, Prefix=prefix):
            for obj in page.get("Contents", []):
                yield obj["Key"]


# Instance partagée par toute l'application. La construction n'ouvre aucune
# connexion : la première requête réelle a lieu au premier appel.
object_storage = ObjectStorage(make_s3_client(), BUCKET_NAME)


def ensure_bucket() -> None:
    object_storage.ensure_bucket()
