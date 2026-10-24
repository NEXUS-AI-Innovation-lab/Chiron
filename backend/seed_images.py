"""Injection des images de démonstration.

Ce script tourne au démarrage de la pile (service `image_seeder`). Il fait
désormais le même travail que les routes d'upload de l'application, au lieu
de simplement déposer des fichiers :

* la lame est rangée sous ``{folder_id}/`` dans MinIO — la disposition que
  le backend interroge, et non plus la racine du bucket ;
* les tuiles DZI sont générées, donc la lame est visible dans le viewer ;
* les lignes ``Patient`` / ``Biopsy`` / ``RadiologyStudy`` sont créées, sans
  quoi les images injectées n'apparaissaient nulle part dans l'interface.

Le script est **idempotent** : il est rejoué à chaque ``docker compose up``
et ne doit jamais créer de doublon. La clé de rapprochement est le
``folder_id`` pour les patients, et l'identifiant d'étude Orthanc pour la
radiologie.
"""

import os
import tempfile
import time
import uuid
from pathlib import Path

import pyvips
import requests
from minio import Minio

import database
import models
import storage

ORTHANC_BASE = os.getenv("ORTHANC_URL", "http://orthanc:8042")
ORTHANC_AUTH = (os.getenv("ORTHANC_USER", "orthanc"), os.getenv("ORTHANC_PASSWORD", "orthanc"))
MINIO_URL = os.getenv("MINIO_HOST", "minio:9000")
MINIO_KEY = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
MINIO_SECRET = os.getenv("MINIO_SECRET_KEY", "minioadmin")
BUCKET_NAME = "biopsie"

BASE_DIR = Path(os.getenv("SEED_BASE_DIR", "/app/images_initiales"))
RADIO_DIR = BASE_DIR / "radiologie"
BIOPSIE_DIR = BASE_DIR / "biopsie"
DZI_FOLDER = Path(os.getenv("DZI_FOLDER", "/app/dzi_data"))

SLIDE_EXTENSIONS = {".svs", ".tif", ".tiff"}


def wait_for(label: str, check, attempts: int = 60, delay: float = 2.0) -> bool:
    """Attend qu'un service réponde, au lieu d'un `sleep` fixe et optimiste."""
    for attempt in range(1, attempts + 1):
        try:
            check()
            print(f"[ok] {label} disponible")
            return True
        except Exception as error:
            if attempt == attempts:
                print(f"[echec] {label} indisponible : {error}")
                return False
            time.sleep(delay)
    return False


def get_or_create_patient(db, folder_id: str, name: str) -> models.Patient:
    """Retrouve un patient par son `folder_id`, ou le crée.

    Le `folder_id` est la clé de rapprochement : rejouer le seeder sur une
    base déjà remplie réutilise les patients existants, en conservant les
    noms qui leur ont été donnés depuis l'interface.
    """
    patient = (
        db.query(models.Patient).filter(models.Patient.folder_id == folder_id).first()
    )
    if patient:
        return patient

    patient = models.Patient(name=name, age=0, folder_id=folder_id)
    db.add(patient)
    db.commit()
    db.refresh(patient)
    print(f"[+] patient cree : {name} ({folder_id})")
    return patient


def seed_slide(db, minio_client: Minio, path: Path) -> None:
    """Injecte une lame : MinIO, tuiles DZI, puis lignes en base."""
    folder_id = path.stem
    object_key = f"{folder_id}/{path.name}"
    dzi_relative = f"{folder_id}/{path.stem}.dzi"

    # Le nom du fichier est la seule identite disponible : on ne fabrique
    # aucun patronyme.
    patient = get_or_create_patient(db, folder_id, folder_id)

    existing = (
        db.query(models.Biopsy)
        .filter(
            models.Biopsy.patient_id == patient.id,
            models.Biopsy.image_url == dzi_relative,
        )
        .first()
    )

    try:
        minio_client.stat_object(BUCKET_NAME, object_key)
    except Exception:
        print(f"[>] envoi MinIO : {object_key}")
        minio_client.fput_object(BUCKET_NAME, object_key, str(path))

    dzi_path = DZI_FOLDER / dzi_relative
    if not dzi_path.exists():
        print(f"[>] generation des tuiles : {dzi_relative} (peut etre long)")
        generer_tuiles(path, dzi_path)

    if existing:
        print(f"[=] biopsie deja referencee pour {folder_id}")
        return

    db.add(models.Biopsy(patient_id=patient.id, image_url=dzi_relative, status="Non analysé"))
    db.commit()
    print(f"[+] biopsie enregistree pour {folder_id}")


def seed_dicom(db, path: Path) -> None:
    """Pousse un DICOM vers Orthanc et le rattache a un patient.

    L'identite vient des metadonnees DICOM (`PatientID`, `PatientName`) :
    aucun rapprochement arbitraire n'est invente.
    """
    with path.open("rb") as handle:
        response = requests.post(
            f"{ORTHANC_BASE}/instances", data=handle, auth=ORTHANC_AUTH, timeout=120
        )
    if response.status_code not in (200, 302):
        print(f"[echec] Orthanc {response.status_code} pour {path.name}")
        return

    instance = response.json()
    # `ParentStudy` n'est present QUE dans la reponse du POST : le detail
    # d'une instance n'expose que `ParentSeries`.
    study_id = instance.get("ParentStudy")
    if not study_id:
        print(f"[echec] Orthanc n'a pas rattache d'etude pour {path.name}")
        return

    study = (
        db.query(models.RadiologyStudy)
        .filter(models.RadiologyStudy.orthanc_study_id == study_id)
        .first()
    )
    if study:
        print(f"[=] etude deja referencee : {study_id}")
        return

    study_detail = requests.get(
        f"{ORTHANC_BASE}/studies/{study_id}", auth=ORTHANC_AUTH, timeout=30
    ).json()
    patient_tags = study_detail.get("PatientMainDicomTags", {})

    modality = "OT"
    series_id = instance.get("ParentSeries")
    if series_id:
        modality = (
            requests.get(f"{ORTHANC_BASE}/series/{series_id}", auth=ORTHANC_AUTH, timeout=30)
            .json()
            .get("MainDicomTags", {})
            .get("Modality", "OT")
        )
    # Certains DICOM de demonstration portent un PatientID vide ou reduit a
    # "0". L'utiliser comme cle de dossier ferait fusionner des patients
    # distincts : on retombe alors sur l'identifiant d'etude, unique.
    raw_id = (patient_tags.get("PatientID") or "").strip()
    dicom_patient_id = raw_id if len(raw_id) > 1 else f"DICOM-{study_id[:8]}"
    dicom_patient_name = (patient_tags.get("PatientName") or "").strip() or dicom_patient_id

    patient = get_or_create_patient(db, dicom_patient_id, dicom_patient_name)
    db.add(
        models.RadiologyStudy(
            patient_id=patient.id,
            orthanc_study_id=study_id,
            modality=modality,
            description=study_detail.get("MainDicomTags", {}).get("StudyDescription", ""),
            date=study_detail.get("MainDicomTags", {}).get("StudyDate", ""),
        )
    )
    db.commit()
    print(f"[+] etude radiologique enregistree : {study_id} ({dicom_patient_name})")


def generer_tuiles(source: Path, destination: Path) -> None:
    """Produit la pyramide DZI d'une lame.

    `dzsave` attend le chemin SANS extension : il ajoute lui-meme le `.dzi`
    et cree le dossier `_files` des tuiles.
    """
    destination.parent.mkdir(parents=True, exist_ok=True)
    image = pyvips.Image.new_from_file(str(source), access="sequential")
    image.dzsave(str(destination.with_suffix("")), tile_size=256, overlap=1, suffix=".jpg")


def reconcilier_tuiles(db, minio_client: Minio) -> int:
    """Regenere les tuiles manquantes des biopsies deja enregistrees.

    Cette passe s'execute a CHAQUE demarrage, meme sur une base peuplee.
    Sans elle, un depot fraichement clone (ou `dzi_data/` est ignore par git)
    suivi d'une restauration du dump laisserait des biopsies en base sans
    aucune tuile : le viewer afficherait un ecran vide, et l'utilisateur
    devrait lancer une conversion a la main.

    La lame source est rapatriee depuis MinIO uniquement si les tuiles
    manquent reellement : le cas courant ne coute qu'un acces disque.
    """
    regenerees = 0

    for biopsie in db.query(models.Biopsy).all():
        if not biopsie.image_url:
            continue

        dzi = DZI_FOLDER / biopsie.image_url
        if dzi.exists():
            continue

        patient = (
            db.query(models.Patient)
            .filter(models.Patient.id == biopsie.patient_id)
            .first()
        )
        if patient is None:
            print(f"[!] biopsie {biopsie.id} sans patient : ignoree")
            continue

        cle = storage.find_object_key(
            minio_client, BUCKET_NAME, patient.folder_id, biopsie.image_url
        )
        if not cle:
            print(f"[!] tuiles absentes pour {biopsie.image_url} et lame source "
                  f"introuvable dans MinIO : regeneration impossible")
            continue

        temporaire = Path(tempfile.gettempdir()) / f"chiron-seed-{uuid.uuid4().hex}{Path(cle).suffix}"
        try:
            print(f"[>] tuiles manquantes pour {biopsie.image_url} — regeneration depuis {cle}")
            minio_client.fget_object(BUCKET_NAME, cle, str(temporaire))
            generer_tuiles(temporaire, dzi)
            regenerees += 1
            print(f"[+] tuiles regenerees : {biopsie.image_url}")
        except Exception as erreur:
            print(f"[echec] regeneration de {biopsie.image_url} : {erreur}")
        finally:
            if temporaire.exists():
                temporaire.unlink()

    return regenerees


def main() -> None:
    minio_client = Minio(MINIO_URL, access_key=MINIO_KEY, secret_key=MINIO_SECRET, secure=False)

    ready = all(
        [
            wait_for("PostgreSQL", lambda: database.engine.connect().close()),
            wait_for("MinIO", lambda: minio_client.list_buckets()),
            wait_for(
                "Orthanc",
                lambda: requests.get(
                    f"{ORTHANC_BASE}/system", auth=ORTHANC_AUTH, timeout=5
                ).raise_for_status(),
            ),
        ]
    )
    if not ready:
        print("Injection abandonnee : un service requis est indisponible.")
        return

    if not minio_client.bucket_exists(BUCKET_NAME):
        minio_client.make_bucket(BUCKET_NAME)
        print(f"[+] bucket '{BUCKET_NAME}' cree")

    db = database.SessionLocal()
    try:
        # Un seeder peuple une base VIDE. Sur une base deja remplie, tout
        # reinjecter creerait des doublons et retuilerait des centaines de Mo
        # a chaque `docker compose up`.
        # Passe systematique : les tuiles sont un artefact regenerable, elles
        # ne sont pas versionnees. On les reconstruit avant toute autre chose.
        print("\n--- VERIFICATION DES TUILES ---")
        regenerees = reconcilier_tuiles(db, minio_client)
        print(f"[=] {regenerees} pyramide(s) DZI regeneree(s)")

        existing = db.query(models.Patient).count()
        if existing:
            print(f"\nBase deja peuplee ({existing} patient(s)) : injection ignoree.")
            return

        if BIOPSIE_DIR.is_dir():
            print("\n--- LAMES ---")
            for path in sorted(BIOPSIE_DIR.iterdir()):
                if path.is_file() and path.suffix.lower() in SLIDE_EXTENSIONS:
                    try:
                        seed_slide(db, minio_client, path)
                    except Exception as error:
                        db.rollback()
                        print(f"[echec] {path.name} : {error}")
        else:
            print(f"[!] dossier absent : {BIOPSIE_DIR}")

        if RADIO_DIR.is_dir():
            print("\n--- RADIOLOGIE ---")
            for path in sorted(RADIO_DIR.iterdir()):
                if path.is_file():
                    try:
                        seed_dicom(db, path)
                    except Exception as error:
                        db.rollback()
                        print(f"[echec] {path.name} : {error}")
        else:
            print(f"[!] dossier absent : {RADIO_DIR}")
    finally:
        db.close()

    print("\nInjection terminee.")


if __name__ == "__main__":
    main()
