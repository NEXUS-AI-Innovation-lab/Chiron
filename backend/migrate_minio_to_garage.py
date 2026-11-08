"""Copie tous les objets d'un ancien MinIO vers Garage (migration ponctuelle).

À lancer UNE fois, quand on passe d'une pile MinIO à la pile Garage sans
vouloir perdre les lames déjà importées. Les tuiles DZI, elles, sont sur le
disque (`dzi_data/`) et ne bougent pas ; mais l'analyse IA et les extractions
relisent la lame SOURCE dans le stockage objet : sans cette copie, elles
répondraient 404 pour les lames importées avant la migration.

Le script est idempotent : un objet déjà présent dans Garage avec la même
taille est ignoré. On peut donc le relancer après une interruption.

Source (l'ancien MinIO) — variables d'environnement :

* SOURCE_S3_ENDPOINT    ex. http://old-minio:9000
* SOURCE_S3_ACCESS_KEY  défaut minioadmin
* SOURCE_S3_SECRET_KEY  défaut minioadmin
* SOURCE_S3_BUCKET      défaut biopsie

Destination : Garage, configuré comme le reste du backend (config.py).

Usage (procédure complète : docs/15-stockage-garage.md) :

    python migrate_minio_to_garage.py            # copie
    python migrate_minio_to_garage.py --dry-run  # liste sans copier
"""

import os
import sys
import tempfile
from pathlib import Path

import boto3
from botocore.config import Config

from clients.object_storage import object_storage

SOURCE_ENDPOINT = os.getenv("SOURCE_S3_ENDPOINT", "http://old-minio:9000")
SOURCE_ACCESS_KEY = os.getenv("SOURCE_S3_ACCESS_KEY", "minioadmin")
SOURCE_SECRET_KEY = os.getenv("SOURCE_S3_SECRET_KEY", "minioadmin")
SOURCE_BUCKET = os.getenv("SOURCE_S3_BUCKET", "biopsie")


def source_client():
    return boto3.client(
        "s3",
        endpoint_url=SOURCE_ENDPOINT,
        region_name="us-east-1",
        aws_access_key_id=SOURCE_ACCESS_KEY,
        aws_secret_access_key=SOURCE_SECRET_KEY,
        config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
    )


def destination_size(key: str):
    """Taille de l'objet dans Garage, ou None s'il n'y est pas."""
    try:
        head = object_storage.client.head_object(Bucket=object_storage.bucket, Key=key)
        return head["ContentLength"]
    except Exception:
        return None


def main(dry_run: bool) -> int:
    source = source_client()
    object_storage.ensure_bucket()

    copied = skipped = failed = 0
    paginator = source.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=SOURCE_BUCKET):
        for obj in page.get("Contents", []):
            key, size = obj["Key"], obj["Size"]
            if destination_size(key) == size:
                skipped += 1
                continue
            if dry_run:
                print(f"[a copier] {key} ({size} octets)")
                copied += 1
                continue

            # Passage par un fichier temporaire : les lames font plusieurs
            # centaines de Mo, on ne les charge jamais en mémoire.
            temporary = Path(tempfile.gettempdir()) / f"migration-{os.getpid()}"
            try:
                source.download_file(SOURCE_BUCKET, key, str(temporary))
                object_storage.upload_file(key, str(temporary))
                copied += 1
                print(f"[+] {key} ({size} octets)")
            except Exception as error:
                failed += 1
                print(f"[echec] {key} : {error}")
            finally:
                temporary.unlink(missing_ok=True)

    verbe = "a copier" if dry_run else "copie(s)"
    print(f"\n{copied} objet(s) {verbe}, {skipped} deja present(s), {failed} echec(s).")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(dry_run="--dry-run" in sys.argv))
