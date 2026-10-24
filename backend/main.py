import time
import os
import shutil
import tempfile
import uuid
from pathlib import Path
import pyvips
import numpy as np
from fastapi import BackgroundTasks, FastAPI, Depends, HTTPException, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool
from sqlalchemy import text
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional, Any, Dict
from minio import Minio
import requests

# --- IMPORT DU CLIENT INSTANSEG ---
from instanseg_client import InstanSegClient

import models
import database
import storage

# --- SCHEMA DE BASE DE DONNEES ---
def apply_migrations() -> None:
    """Amene la base au dernier schema connu, via Alembic.

    Remplace `create_all`, qui creait les tables absentes mais n'ajoutait
    jamais de colonne a une table existante : toute evolution du modele
    cassait silencieusement les bases deja deployees.
    """
    from alembic import command
    from alembic.config import Config

    root = Path(__file__).resolve().parent
    config = Config(str(root / "alembic.ini"))
    config.set_main_option("script_location", str(root / "alembic"))
    command.upgrade(config, "head")


try:
    apply_migrations()
    print("✅ Schéma de base à jour (Alembic).")
except Exception as e:
    # L'application démarre malgré tout pour que /health puisse rapporter
    # l'incident, mais l'erreur est explicite dans les journaux.
    print(f"❌ ÉCHEC DES MIGRATIONS : {e}")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DZI_FOLDER = "/app/dzi_data"
os.makedirs(DZI_FOLDER, exist_ok=True)
app.mount("/dzi_data", StaticFiles(directory=DZI_FOLDER), name="dzi_data")

# --- MOTEUR DE WORKFLOW ---
# Nouveau code isole dans son propre package (routeur / service / schemas),
# amorce de la structure cible sans toucher aux routes historiques.
from workflow.router import router as workflow_router  # noqa: E402

app.include_router(workflow_router)

# --- CONFIGURATION MINIO ---
MINIO_HOST = "minio:9000"
ACCESS_KEY = "minioadmin"
SECRET_KEY = "minioadmin"
BUCKET_NAME = "biopsie"

minio_client = Minio(
    MINIO_HOST, access_key=ACCESS_KEY, secret_key=SECRET_KEY, secure=False
)

# --- INITIALISATION DU CLIENT INSTANSEG ---
print("🤖 Initialisation du client InstanSeg...")
instanseg_client = InstanSegClient(base_url="http://instanseg:7000")
print("✅ Client InstanSeg prêt !")


# --- SCHEMAS ---
class BiopsySchema(BaseModel):
    id: int
    image_url: Optional[str] = None
    status: str

    class Config:
        from_attributes = True


class RadiologySchema(BaseModel):
    id: int
    orthanc_study_id: str
    modality: str
    description: str
    date: str

    class Config:
        from_attributes = True


class PatientSchema(BaseModel):
    id: int
    name: str
    age: int
    folder_id: str
    birth_date: Optional[str] = None
    family_history: Optional[str] = None
    medical_history: Optional[str] = None
    biopsies: List[BiopsySchema] = []
    radiology_studies: List[RadiologySchema] = []

    class Config:
        from_attributes = True


class PatientCreate(BaseModel):
    name: str
    age: int
    birth_date: Optional[str] = None
    family_history: Optional[str] = None
    medical_history: Optional[str] = None


def safe_folder_name(value: str) -> str:
    cleaned = "".join(char for char in value if char.isalnum() or char in ("-", "_", " "))
    return cleaned.strip().replace(" ", "-") or "patient"


def ensure_minio_bucket() -> None:
    if not minio_client.bucket_exists(BUCKET_NAME):
        minio_client.make_bucket(BUCKET_NAME)


@app.post("/patients", response_model=PatientSchema, status_code=201)
def create_patient(payload: PatientCreate, db: Session = Depends(database.get_db)):
    folder_id = f"{safe_folder_name(payload.name)}-{uuid.uuid4().hex[:8]}"
    patient = models.Patient(
        name=payload.name.strip(),
        age=payload.age,
        folder_id=folder_id,
        birth_date=payload.birth_date,
        family_history=payload.family_history,
        medical_history=payload.medical_history,
    )
    db.add(patient)
    db.commit()
    db.refresh(patient)
    return patient


@app.post("/patients/{patient_id}/upload-biopsy", response_model=BiopsySchema, status_code=201)
async def upload_biopsy(
    patient_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(database.get_db),
):
    patient = db.query(models.Patient).filter(models.Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient introuvable")

    # Un dossier ne porte qu'une lame : tout le reste de l'application
    # travaille sur `patient.biopsies[0]`. Accepter la seconde donnait
    # l'illusion d'un import reussi alors qu'elle restait invisible.
    if patient.biopsies:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Ce dossier contient deja une lame ({patient.biopsies[0].image_url}). "
                "Supprimez-la avant d'en importer une autre."
            ),
        )

    extension = Path(file.filename or "").suffix.lower()
    if extension not in {".svs", ".tif", ".tiff"}:
        raise HTTPException(status_code=400, detail="Format accepté : .svs, .tif ou .tiff")

    folder_id = safe_folder_name(patient.folder_id)
    patient_dir = Path(DZI_FOLDER) / folder_id
    patient_dir.mkdir(parents=True, exist_ok=True)
    source_name = Path(file.filename or "biopsy.svs").name
    source_path: Optional[Path] = None
    dzi_path = patient_dir / f"{Path(source_name).stem}.dzi"

    try:
        # Le fichier est copié par blocs : il n'est jamais chargé intégralement en RAM.
        # Le fichier temporaire va dans le dossier temporaire du système, et
        # NON dans `dzi_data` : ce dernier est monté en statique, la lame brute
        # y était donc téléchargeable le temps de l'import — et un import
        # interrompu y laissait plusieurs centaines de mégaoctets.
        with tempfile.NamedTemporaryFile(delete=False, suffix=extension) as temporary:
            source_path = Path(temporary.name)
            while chunk := await file.read(8 * 1024 * 1024):
                temporary.write(chunk)

        ensure_minio_bucket()
        minio_object_name = f"{folder_id}/{source_name}"
        # Hors boucle d'événements : l'envoi d'une lame de plusieurs centaines
        # de mégaoctets gelait l'API entière.
        await run_in_threadpool(
            minio_client.fput_object, BUCKET_NAME, minio_object_name, str(source_path)
        )

        # PyVips lit le fichier temporaire de façon séquentielle et écrit les
        # tuiles DZI. C'est l'étape la plus longue — plusieurs minutes pour une
        # lame de quelques centaines de mégaoctets — et elle est purement
        # synchrone : exécutée sur la boucle d'événements, elle rendait l'API
        # entière injoignable pendant toute sa durée.
        await run_in_threadpool(
            lambda: pyvips.Image.new_from_file(
                str(source_path), access="sequential"
            ).dzsave(
                str(patient_dir / Path(source_name).stem),
                tile_size=256,
                overlap=1,
                suffix=".jpg",
            )
        )

        biopsy = models.Biopsy(
            patient_id=patient.id,
            image_url=f"{folder_id}/{dzi_path.name}",
            status="Non analysé",
        )
        db.add(biopsy)
        db.commit()
        db.refresh(biopsy)
        return biopsy
    except Exception as error:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Échec de l'upload de biopsie : {error}")
    finally:
        await file.close()
        if source_path and source_path.exists():
            source_path.unlink()


@app.post("/patients/{patient_id}/upload-radiology", response_model=RadiologySchema, status_code=201)
async def upload_radiology(
    patient_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(database.get_db),
):
    patient = db.query(models.Patient).filter(models.Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient introuvable")
    # Meme regle que pour la lame : le dossier porte une etude radiologique.
    if patient.radiology_studies:
        raise HTTPException(
            status_code=409,
            detail=(
                "Ce dossier contient deja un examen radiologique. "
                "Supprimez-le avant d'en importer un autre."
            ),
        )

    if Path(file.filename or "").suffix.lower() != ".dcm":
        raise HTTPException(status_code=400, detail="Format accepté : .dcm")

    try:
        orthanc_response = await run_in_threadpool(
            lambda: requests.post(
            "http://orthanc:8042/instances",
                data=file.file,
                auth=("orthanc", "orthanc"),
                timeout=300,
            )
        )
        if orthanc_response.status_code not in {200, 202}:
            raise HTTPException(status_code=502, detail="Orthanc a refusé le fichier DICOM")

        instance = orthanc_response.json()
        instance_id = instance.get("ID")
        if not instance_id:
            raise HTTPException(status_code=502, detail="Orthanc n'a pas retourné d'identifiant")

        # `ParentStudy` figure dans la reponse du POST, pas dans le detail de
        # l'instance (qui n'expose que `ParentSeries`) : le relire par GET
        # renvoyait toujours None, donc un 502 systematique.
        study_id = instance.get("ParentStudy")
        if not study_id:
            raise HTTPException(status_code=502, detail="Étude Orthanc introuvable")

        # Les tags d'etude (date, description) et la modalite vivent aux
        # niveaux etude et serie, jamais sur l'instance.
        study_tags: Dict[str, Any] = {}
        try:
            study_tags = (
                await run_in_threadpool(
                    lambda: requests.get(
                        f"http://orthanc:8042/studies/{study_id}",
                        auth=("orthanc", "orthanc"),
                        timeout=60,
                    ).json()
                )
            ).get("MainDicomTags", {})
        except Exception as error:
            print(f"Orthanc : tags d'etude illisibles ({error})")

        modality = "Inconnue"
        series_id = instance.get("ParentSeries")
        if series_id:
            try:
                modality = (
                    await run_in_threadpool(
                        lambda: requests.get(
                            f"http://orthanc:8042/series/{series_id}",
                            auth=("orthanc", "orthanc"),
                            timeout=60,
                        ).json()
                    )
                    .get("MainDicomTags", {})
                    .get("Modality", "Inconnue")
                )
            except Exception as error:
                print(f"Orthanc : modalite illisible ({error})")

        existing = (
            db.query(models.RadiologyStudy)
            .filter(models.RadiologyStudy.orthanc_study_id == study_id)
            .first()
        )
        if existing:
            # Orthanc dedoublonne par UID DICOM : re-televerser le meme fichier
            # renvoie l'etude deja indexee. Elle appartient donc a un dossier —
            # possiblement un AUTRE que celui-ci. Retourner cette ligne telle
            # quelle laissait croire a un import reussi alors que le dossier
            # courant ne recevait rien.
            proprietaire = (
                db.query(models.Patient)
                .filter(models.Patient.id == existing.patient_id)
                .first()
            )
            nom = proprietaire.name if proprietaire else "un autre dossier"
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Cet examen DICOM est deja rattache au dossier de {nom}. "
                    "Un meme examen ne peut pas appartenir a deux patients."
                ),
            )

        study = models.RadiologyStudy(
            patient_id=patient.id,
            orthanc_study_id=study_id,
            modality=modality,
            description=study_tags.get("StudyDescription")
            or (file.filename or "Examen radiologique"),
            date=study_tags.get("StudyDate", ""),
        )
        db.add(study)
        db.commit()
        db.refresh(study)
        return study
    except HTTPException:
        db.rollback()
        raise
    except requests.RequestException as error:
        db.rollback()
        raise HTTPException(status_code=502, detail=f"Orthanc indisponible : {error}")
    finally:
        await file.close()


class DrawingSchema(BaseModel):
    type: str
    x: float
    y: float
    w: Optional[float] = 0
    h: Optional[float] = 0
    radius: Optional[float] = 0
    text: Optional[str] = ""
    points: Optional[List[Dict[str, float]]] = []
    author: Optional[str] = "Inconnu"


class AnalysisPayload(BaseModel):
    x: int
    y: int
    width: int
    height: int
    patient_folder: str
    patient_name: str
    annotation_label: str
    extraction_id: Optional[int] = None
    owner: Optional[str] = "Inconnu"
    birth_date: Optional[str] = ""
    family_history: Optional[str] = ""
    medical_history: Optional[str] = ""
    prelevement_type: Optional[str] = ""
    prelevement_date: Optional[str] = ""
    block_number: Optional[str] = ""
    fixation: Optional[str] = ""
    slide_count: Optional[Any] = None
    staining: Optional[List[str]] = []
    macro_obs: Optional[str] = ""
    micro_obs: Optional[str] = ""
    histo_type: Optional[str] = ""
    sbr_grade: Optional[str] = ""
    margins: Optional[str] = ""
    hormonal_receptors: Optional[str] = ""
    diagnosis: Optional[str] = ""
    comments: Optional[str] = ""
    status: Optional[str] = ""
    pathologist: Optional[str] = ""
    validation_date: Optional[str] = ""
    drawings: List[DrawingSchema] = []


# --- SCHEMAS POUR LE RAPPORT ---
class ReportPayload(BaseModel):
    report: str
    annotations: Optional[str] = ""


# COMPTE-RENDU RADIOLOGIQUE
@app.get("/radiology/{study_id}/report")
def get_radiology_report(study_id: str, db: Session = Depends(database.get_db)):
    radio = (
        db.query(models.RadiologyStudy)
        .filter(models.RadiologyStudy.orthanc_study_id == study_id)
        .first()
    )
    if not radio:
        raise HTTPException(status_code=404, detail="Radio introuvable")
    return {"report": radio.report or "", "annotations": radio.annotations or ""}


@app.post("/radiology/{study_id}/report")
def save_radiology_report(
    study_id: str, payload: ReportPayload, db: Session = Depends(database.get_db)
):
    radio = (
        db.query(models.RadiologyStudy)
        .filter(models.RadiologyStudy.orthanc_study_id == study_id)
        .first()
    )
    if not radio:
        raise HTTPException(status_code=404, detail="Radio introuvable")
    radio.report = payload.report
    radio.annotations = payload.annotations
    db.commit()
    return {"message": "Compte-rendu et annotations sauvegardés !"}


@app.on_event("shutdown")
async def close_clients() -> None:
    """Ferme le client HTTP d'InstanSeg a l'arret.

    Il etait cree au chargement du module et jamais ferme : les connexions
    du pool restaient ouvertes jusqu'a la fin du processus.
    """
    await instanseg_client.close()


# --- ROUTE HEALTH CHECK ---
@app.get("/health")
async def health_check():
    """Etat reel des dependances du backend.

    La base est reellement interrogee : jusqu'ici `database: connected` etait
    affirme sans aucun test, ce qui rendait le diagnostic trompeur.
    """
    database_state = {"status": "connected"}
    try:
        with database.engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except Exception as error:
        database_state = {"status": "disconnected", "error": str(error)}

    instanseg_state = {}
    try:
        instanseg_state = await instanseg_client.health()
    except Exception as error:
        instanseg_state = {"status": "disconnected", "error": str(error)}

    healthy = (
        database_state["status"] == "connected"
        and instanseg_state.get("status") != "disconnected"
    )
    payload = {
        "status": "ok" if healthy else "degraded",
        "backend": "connected",
        "instanseg": instanseg_state,
        "database": database_state,
    }
    return payload if healthy else JSONResponse(status_code=503, content=payload)


def download_biopsy_source(patient: models.Patient, prefix: str = "chiron") -> Path:
    """Telecharge la lame source d'un patient depuis MinIO vers un fichier temporaire.

    Le depot MinIO contient deux dispositions historiques :

    * ``{folder_id}/{stem}{ext}`` — ecrite par ``POST /patients/{id}/upload-biopsy`` ;
    * ``{nom}{ext}`` a la racine — ecrite par ``seed_images.py``, qui ignore
      les dossiers patients.

    S'y ajoute le fait que ``Biopsy.image_url`` designe le fichier DZI affiche
    par le viewer, dont le nom ne correspond pas forcement a l'objet MinIO
    (les lames de demonstration sont tuilees sous ``biopsie_cmu_N``).

    On essaie donc les emplacements du plus precis au plus large, et on leve
    une 404 explicite listant ce qui a ete cherche.

    :raises HTTPException: 404 si aucune source n'est trouvee.
    """
    if not patient.biopsies:
        raise HTTPException(
            status_code=404, detail="Aucune biopsie disponible pour ce patient"
        )

    # La liste des emplacements possibles est partagee avec le script
    # d'injection : voir backend/storage.py.
    candidates = storage.candidate_object_keys(
        minio_client, BUCKET_NAME, patient.folder_id, patient.biopsies[0].image_url
    )

    for key in candidates:
        target = Path(tempfile.gettempdir()) / f"{prefix}-{uuid.uuid4().hex}{Path(key).suffix}"
        try:
            minio_client.fget_object(BUCKET_NAME, key, str(target))
            return target
        except Exception:
            if target.exists():
                target.unlink()

    raise HTTPException(
        status_code=404,
        detail=(
            "Lame source introuvable dans MinIO pour ce patient. "
            f"Emplacements essayes : {', '.join(candidates[:6])}."
        ),
    )


# --- ROUTE IA : ANALYSE INSTANSEG ---
# Au-delà de ces bornes, la valeur lue n'est pas une vraie résolution de
# scanner : un TIFF sans tag de résolution ou un PNG à 72 dpi en donnent une.
TAILLE_PIXEL_MIN_UM = 0.05
TAILLE_PIXEL_MAX_UM = 5.0


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


@app.post("/analyze-ai")
async def analyze_image_with_ai(data: AnalysisPayload, db: Session = Depends(database.get_db)):
    patient = db.query(models.Patient).filter(models.Patient.folder_id == data.patient_folder).first()
    if not patient or not patient.biopsies:
        raise HTTPException(status_code=404, detail="Aucune biopsie disponible pour ce patient")

    # Telechargement de la lame source (potentiellement plusieurs centaines
    # de Mo) : hors boucle d'evenements.
    source_path = await run_in_threadpool(
        download_biopsy_source, patient, "chiron-ai"
    )

    def _borner_region():
        """Ouvre la lame et borne la région demandée à ses dimensions réelles.

        Une zone demandée hors de la lame est ramenée à l'intérieur (la fenêtre
        glisse) au lieu d'être tronquée à zéro : extract_area refuse une largeur
        ou une hauteur nulle et fait échouer la requête avec une 500 opaque.
        """
        image = pyvips.Image.new_from_file(str(source_path), access="sequential")
        largeur = max(1, min(data.width, image.width))
        hauteur = max(1, min(data.height, image.height))
        x = max(0, min(data.x, image.width - largeur))
        y = max(0, min(data.y, image.height - hauteur))
        return x, y, largeur, hauteur, lire_taille_pixel(image)

    def _extraire_png(x, y, largeur, hauteur):
        """Découpe la région et l'encode en PNG."""
        image = pyvips.Image.new_from_file(str(source_path), access="sequential")
        return image.extract_area(x, y, largeur, hauteur).write_to_buffer(".png")

    try:
        # Toutes les opérations PyVips sont synchrones : les laisser sur la
        # boucle d'événements bloquait l'API pendant leur exécution.
        safe_x, safe_y, safe_w, safe_h, pixel_size = await run_in_threadpool(_borner_region)
        if pixel_size is None:
            print("⚠️ Résolution de la lame inconnue : InstanSeg suppose ~0,5 µm/px.")

        if safe_w > 1500 or safe_h > 1500:
            return {
                "suggestion": "❌ Zone trop vaste. L'IA requiert un patch plus petit (zoom maximum). Dessinez un rectangle plus petit (max 1500x1500px).",
                "cell_count": 0,
                "contour_points": [],
            }

        print(f"📐 Extraction région {safe_w}x{safe_h}px...")
        png_data = await run_in_threadpool(
            _extraire_png, safe_x, safe_y, safe_w, safe_h
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
            raise HTTPException(
                status_code=503, detail=f"Service InstanSeg indisponible : {str(e)}"
            )

        contour_points = []
        try:
            print(f"📍 Appel segment_points (mode centroids)...")
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

        instances = segment_result.instances
        cell_count = segment_result.instance_count

        if cell_count > 0:
            cell_areas = [inst.area_px for inst in instances]
            avg_size = int(np.mean(cell_areas))
            max_size = int(np.max(cell_areas))

            pleomorphism = "Faible (Noyaux réguliers)"
            if max_size > avg_size * 3:
                pleomorphism = "Élevé (Atypies cytonucléaires marquées)"
            elif max_size > avg_size * 2:
                pleomorphism = "Modéré"

            area_pixels = safe_w * safe_h
            density = round((cell_count / area_pixels) * 1000000)

            result_message = (
                f"🔬 Bilan InstanSeg :\n"
                f"• Noyaux détectés : {cell_count}\n"
                f"• Densité : {density} cellules / Mpx\n"
                f"• Taille moyenne : {avg_size} px²\n"
                f"• Pléomorphisme : {pleomorphism}\n"
                f"• Temps traitement : {segment_result.processing_time_s}s"
            )
        else:
            result_message = "🔬 Bilan InstanSeg : Aucune structure nucléaire détectée dans cette zone."

        print(
            f"✅ Résultat IA : {cell_count} cellules, {len(contour_points)} points générés."
        )

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

        return {
            "suggestion": result_message,
            "cell_count": cell_count,
            "contour_points": contour_points_dict,
            # Region reellement analysee : elle peut differer de celle demandee
            # (voir _borner_region). Le frontend en a besoin pour replacer les
            # contours au bon endroit sur la lame.
            "region": {
                "x": safe_x,
                "y": safe_y,
                "width": safe_w,
                "height": safe_h,
            },
        }

    except HTTPException:
        if source_path:
            source_path.unlink(missing_ok=True)
        raise
    except Exception as e:
        if source_path:
            source_path.unlink(missing_ok=True)
        print(f"❌ Erreur IA : {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/patients", response_model=List[PatientSchema])
def get_patients(db: Session = Depends(database.get_db)):
    return db.query(models.Patient).all()


@app.post("/extract-roi")
def extract_roi(data: AnalysisPayload, db: Session = Depends(database.get_db)):
    patient = (
        db.query(models.Patient)
        .filter(models.Patient.folder_id == data.patient_folder)
        .first()
    )
    if not patient:
        # Vestige d'avant l'existence de POST /patients : cette route creait
        # un dossier patient (age 0) a partir du corps de la requete. Sur un
        # dossier medical, creer une identite depuis une entree non
        # authentifiee est inacceptable — et cela produisait des dossiers
        # fantomes des qu'un identifiant erronne etait transmis.
        raise HTTPException(
            status_code=404,
            detail=(
                "Dossier patient introuvable. Creez-le d'abord "
                "(POST /patients) avant d'extraire une region."
            ),
        )

    safe_folder = "".join(
        c for c in data.patient_folder if c.isalnum() or c in (" ", "-", "_")
    ).strip()
    patient_dir = os.path.join(DZI_FOLDER, safe_folder, "extractions")
    os.makedirs(patient_dir, exist_ok=True)
    filename_str = f"extraction_{int(time.time())}.svs"
    output_path = os.path.join(patient_dir, filename_str)

    if not patient.biopsies:
        raise HTTPException(status_code=404, detail="Aucune biopsie disponible pour ce patient")
    source_path = download_biopsy_source(patient, prefix="chiron-roi")

    if source_path.exists():
        try:
            image = pyvips.Image.new_from_file(str(source_path), access="sequential")
            safe_x = max(0, min(data.x, image.width))
            safe_y = max(0, min(data.y, image.height))
            region = image.extract_area(safe_x, safe_y, data.width, data.height)
            region.tiffsave(
                output_path,
                compression="jpeg",
                Q=90,
                tile=True,
                pyramid=True,
                bigtiff=True,
            )

            try:
                minio_object_name = f"{safe_folder}/extractions/{filename_str}"
                minio_client.fput_object(
                    bucket_name=BUCKET_NAME,
                    object_name=minio_object_name,
                    file_path=output_path,
                )
                if os.path.exists(output_path):
                    os.remove(output_path)
            except Exception as minio_err:
                print(f"❌ Erreur MinIO : {minio_err}")

        except Exception as e:
            print(f"⚠️ Erreur PyVips: {e}")
        finally:
            source_path.unlink(missing_ok=True)

    sc = data.slide_count if isinstance(data.slide_count, int) else None

    new_ext = models.Extraction(
        patient_id=patient.id,
        label=data.annotation_label,
        dzi_url=f"{safe_folder}/extractions/{filename_str}",
        x=data.x,
        y=data.y,
        w=data.width,
        h=data.height,
        owner=data.owner,
        prelevement_type=data.prelevement_type,
        prelevement_date=data.prelevement_date,
        block_number=data.block_number,
        fixation=data.fixation,
        slide_count=sc,
        staining=data.staining,
        macro_obs=data.macro_obs,
        micro_obs=data.micro_obs,
        histo_type=data.histo_type,
        sbr_grade=data.sbr_grade,
        margins=data.margins,
        hormonal_receptors=data.hormonal_receptors,
        diagnosis=data.diagnosis,
        comments=data.comments,
        status=data.status,
        pathologist=data.pathologist,
        validation_date=data.validation_date,
    )
    db.add(new_ext)
    db.commit()
    db.refresh(new_ext)

    return {
        "message": "Dossier créé avec succès",
        "id": new_ext.id,
        "extraction_id": new_ext.id,
    }


@app.post("/annotations/save")
def update_analysis(data: AnalysisPayload, db: Session = Depends(database.get_db)):
    if not data.extraction_id:
        raise HTTPException(status_code=400, detail="ID manquant")
    ext = (
        db.query(models.Extraction)
        .filter(models.Extraction.id == data.extraction_id)
        .first()
    )
    if not ext:
        raise HTTPException(status_code=404, detail="Introuvable")
    
    sc = data.slide_count if isinstance(data.slide_count, int) else None
    
    # 🌟 CORRECTION CRUCIALE : Enregistrement du nouveau nom de l'extraction !
    ext.label = data.annotation_label 
    
    ext.prelevement_type = data.prelevement_type
    ext.prelevement_date = data.prelevement_date
    ext.block_number = data.block_number
    ext.fixation = data.fixation
    ext.slide_count = sc
    ext.staining = data.staining
    ext.macro_obs = data.macro_obs
    ext.micro_obs = data.micro_obs
    ext.histo_type = data.histo_type
    ext.sbr_grade = data.sbr_grade
    ext.margins = data.margins
    ext.hormonal_receptors = data.hormonal_receptors
    ext.diagnosis = data.diagnosis
    ext.comments = data.comments
    ext.status = data.status
    ext.pathologist = data.pathologist
    ext.validation_date = data.validation_date
    
    db.query(models.Drawing).filter(models.Drawing.extraction_id == ext.id).delete()
    for d in data.drawings:
        new_draw = models.Drawing(
            extraction_id=ext.id,
            type=d.type,
            x=d.x,
            y=d.y,
            w=d.w,
            h=d.h,
            radius=d.radius,
            text=d.text,
            points=d.points,
            author=d.author,
        )
        db.add(new_draw)
    db.commit()
    return {"message": "Mis à jour"}


@app.get("/patients/{folder_id}/extractions")
def get_extractions(folder_id: str, db: Session = Depends(database.get_db)):
    patient = (
        db.query(models.Patient).filter(models.Patient.folder_id == folder_id).first()
    )
    if not patient:
        return []
    results = []
    for e in patient.extractions:
        results.append(
            {
                "id": e.id,
                "filename": e.label,
                "annotation_label": e.label, # 🌟 CORRECTION : Renvoi propre pour le Dashboard
                "url": f"http://localhost:8002/dzi_data/{e.dzi_url}",
                "roi": {"x": e.x, "y": e.y, "w": e.w, "h": e.h},
                "diagnosis": e.diagnosis,
                "status": e.status,
                "owner": e.owner,
            }
        )
    return results


@app.get("/extractions/{extraction_id}/details")
def get_details(extraction_id: int, db: Session = Depends(database.get_db)):
    ext = (
        db.query(models.Extraction)
        .filter(models.Extraction.id == extraction_id)
        .first()
    )
    if not ext:
        raise HTTPException(status_code=404, detail="Non trouvé")
    return {
        "id": ext.id,
        "filename": ext.label,
        "annotation_label": ext.label, # 🌟 CORRECTION : Renvoi propre pour le Viewer
        "prelevement_type": ext.prelevement_type,
        "prelevement_date": ext.prelevement_date,
        "block_number": ext.block_number,
        "fixation": ext.fixation,
        "slide_count": ext.slide_count,
        "staining": ext.staining,
        "macro_obs": ext.macro_obs,
        "micro_obs": ext.micro_obs,
        "histo_type": ext.histo_type,
        "sbr_grade": ext.sbr_grade,
        "margins": ext.margins,
        "hormonal_receptors": ext.hormonal_receptors,
        "diagnosis": ext.diagnosis,
        "comments": ext.comments,
        "status": ext.status,
        "pathologist": ext.pathologist,
        "validation_date": ext.validation_date,
        "drawings": [
            {
                "type": d.type,
                "x": d.x,
                "y": d.y,
                "w": d.w,
                "h": d.h,
                "radius": d.radius,
                "text": d.text,
                "points": d.points,
                "author": d.author,
            }
            for d in ext.drawings
        ],
    }


@app.delete("/extractions/{extraction_id}")
def delete_extraction(
    extraction_id: int, username: str, db: Session = Depends(database.get_db)
):
    ext = (
        db.query(models.Extraction)
        .filter(models.Extraction.id == extraction_id)
        .first()
    )
    if not ext:
        raise HTTPException(status_code=404)
    if ext.owner != username:
        raise HTTPException(status_code=403)
    try:
        minio_client.remove_object(BUCKET_NAME, ext.dzi_url)
    except Exception:
        pass
    try:
        file_path = os.path.join(DZI_FOLDER, ext.dzi_url)
        if os.path.exists(file_path):
            os.remove(file_path)
            files_dir = file_path.replace(".svs", "_files").replace(".dzi", "_files")
            if os.path.exists(files_dir):
                shutil.rmtree(files_dir)
    except:
        pass
    db.delete(ext)
    db.commit()
    return {"message": "Supprimé"}

@app.delete("/patients/{patient_id}")
def delete_patient(
    patient_id: int,
    taches: BackgroundTasks,
    db: Session = Depends(database.get_db),
):
    """Supprime un patient et tout ce qui lui appartient.

    Sont retires : les objets MinIO ranges sous son dossier, les tuiles DZI
    de ses biopsies, puis la ligne patient — la cascade ORM emporte biopsies,
    extractions (avec leurs dessins et leur workflow) et etudes radiologiques.

    Les etudes DICOM ne sont PAS supprimees d'Orthanc : purger un PACS est une
    operation a part, volontairement laissee hors de ce endpoint. Les objets
    deposes a la racine du bucket par le seeder sont egalement conserves : ils
    sont reinjectes a chaque demarrage et peuvent servir a d'autres dossiers.

    Le rapport retourne liste ce qui a ete supprime et ce qui a echoue, plutot
    que d'echouer silencieusement.
    """
    patient = db.query(models.Patient).filter(models.Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient introuvable")

    folder = safe_folder_name(patient.folder_id)
    report = {
        "patient": patient.name,
        "folder_id": patient.folder_id,
        "minio_objects": 0,
        "dzi_paths": 0,
        "orthanc_studies_kept": len(patient.radiology_studies),
        "warnings": [],
    }

    # 1. Objets MinIO ranges sous le dossier du patient (lame + extractions).
    try:
        keys = [
            obj.object_name
            for obj in minio_client.list_objects(BUCKET_NAME, prefix=f"{folder}/", recursive=True)
        ]
        for key in keys:
            try:
                minio_client.remove_object(BUCKET_NAME, key)
                report["minio_objects"] += 1
            except Exception as error:
                report["warnings"].append(f"MinIO {key} : {error}")
    except Exception as error:
        report["warnings"].append(f"MinIO listing : {error}")

    # 2. Tuiles DZI : le dossier du patient, plus le DZI propre a chaque
    #    biopsie (les lames de demonstration sont tuilees a la racine).
    targets = [Path(DZI_FOLDER) / folder]
    for biopsy in patient.biopsies:
        if not biopsy.image_url:
            continue
        stem = Path(biopsy.image_url).stem
        parent = Path(DZI_FOLDER) / Path(biopsy.image_url).parent
        targets.append(parent / f"{stem}.dzi")
        targets.append(parent / f"{stem}_files")

    differes: List[Path] = []
    for target in targets:
        _retirer_chemin(target, report, differes)

    if differes:
        taches.add_task(_effacer_en_arriere_plan, differes)

    # 3. Lignes en base (la cascade emporte biopsies, extractions, workflow).
    db.delete(patient)
    db.commit()

    report["message"] = f"Patient « {patient.name} » supprimé."
    return report


def _effacer_en_arriere_plan(chemins: List[Path]) -> None:
    """Efface reellement les dossiers deja mis de cote.

    Retire ensuite le dossier parent s'il est devenu vide, pour ne pas laisser
    une arborescence de dossiers patients sans contenu.
    """
    racine = Path(DZI_FOLDER).resolve()
    for chemin in chemins:
        try:
            shutil.rmtree(chemin, ignore_errors=True)
            parent = chemin.parent
            if parent != racine and str(parent).startswith(str(racine)):
                try:
                    parent.rmdir()  # echoue si le dossier n'est pas vide
                except OSError:
                    pass
        except Exception as error:  # noqa: BLE001 - nettoyage best effort
            print(f"Nettoyage differe impossible pour {chemin} : {error}")


def _retirer_chemin(cible: Path, rapport: dict, differes: List[Path]) -> None:
    """Retire un chemin de tuiles, immediatement pour l'utilisateur.

    Un dossier de tuiles contient des dizaines de milliers de fichiers : le
    supprimer prend pres d'une minute sur un volume monte. On le **renomme**
    d'abord — operation instantanee, qui le fait disparaitre pour de bon du
    point de vue de l'application — puis on planifie son effacement reel en
    tache de fond. La reponse HTTP n'attend donc plus le systeme de fichiers.
    """
    racine = Path(DZI_FOLDER).resolve()
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


def _supprimer_tuiles(image_url: str, rapport: dict, differes: List[Path]) -> None:
    """Retire le fichier .dzi et le dossier de tuiles d'une lame."""
    if not image_url:
        return

    stem = Path(image_url).stem
    parent = Path(DZI_FOLDER) / Path(image_url).parent
    for cible in (parent / f"{stem}.dzi", parent / f"{stem}_files"):
        _retirer_chemin(cible, rapport, differes)


@app.delete("/biopsies/{biopsy_id}")
def delete_biopsy(
    biopsy_id: int,
    taches: BackgroundTasks,
    db: Session = Depends(database.get_db),
):
    """Supprime une lame : objet MinIO, tuiles DZI, puis la ligne.

    Les extractions deja realisees sur cette lame sont conservees : elles
    portent leur propre fichier et leur propre compte rendu. Le rapport
    indique combien restent rattachees au dossier.
    """
    biopsy = db.query(models.Biopsy).filter(models.Biopsy.id == biopsy_id).first()
    if not biopsy:
        raise HTTPException(status_code=404, detail="Lame introuvable")

    patient = (
        db.query(models.Patient).filter(models.Patient.id == biopsy.patient_id).first()
    )
    rapport = {"minio_objects": 0, "dzi_paths": 0, "extractions_conservees": 0, "warnings": []}

    if patient:
        rapport["extractions_conservees"] = len(patient.extractions)
        cle = storage.find_object_key(
            minio_client, BUCKET_NAME, patient.folder_id, biopsy.image_url
        )
        if cle:
            try:
                minio_client.remove_object(BUCKET_NAME, cle)
                rapport["minio_objects"] += 1
            except Exception as error:
                rapport["warnings"].append(f"MinIO {cle} : {error}")

    differes: List[Path] = []
    _supprimer_tuiles(biopsy.image_url, rapport, differes)

    db.delete(biopsy)
    db.commit()

    if differes:
        taches.add_task(_effacer_en_arriere_plan, differes)

    rapport["message"] = "Lame supprimee."
    return rapport


@app.delete("/radiology-studies/{study_id}")
def delete_radiology_study(study_id: int, db: Session = Depends(database.get_db)):
    """Detache un examen radiologique du dossier patient.

    L'etude reste dans Orthanc : purger un PACS est une operation distincte,
    volontairement laissee hors de ce endpoint. Le meme fichier pourra donc
    etre reimporte ensuite, y compris sur un autre dossier.
    """
    study = (
        db.query(models.RadiologyStudy)
        .filter(models.RadiologyStudy.id == study_id)
        .first()
    )
    if not study:
        raise HTTPException(status_code=404, detail="Examen radiologique introuvable")

    orthanc_id = study.orthanc_study_id
    db.delete(study)
    db.commit()

    return {
        "message": "Examen radiologique detache du dossier.",
        "orthanc_study_id": orthanc_id,
        "orthanc_conserve": True,
    }
