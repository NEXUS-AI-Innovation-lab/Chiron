# 14 — Architecture du backend en couches

> **En une phrase :** l'ancien `backend/main.py` de 1 200 lignes a été découpé en
> **routeurs** (HTTP), **services** (métier), **schémas** (contrats) et **clients**
> (services externes). L'API est restée **strictement identique** : mêmes URL,
> mêmes paramètres, mêmes réponses, mêmes codes d'erreur.

Ce document explique **où se trouve quoi**, **comment une requête traverse les
couches** et **comment ajouter du code** sans recréer un fichier fourre-tout.

---

## Sommaire

1. [Avant / après](#1-avant--après)
2. [Carte des fichiers](#2-carte-des-fichiers)
3. [Les quatre couches et leurs règles](#3-les-quatre-couches-et-leurs-règles)
4. [Le trajet d'une requête](#4-le-trajet-dune-requête)
5. [Les erreurs : `ServiceError`](#5-les-erreurs--serviceerror)
6. [La configuration : `config.py`](#6-la-configuration--configpy)
7. [Démarrage et arrêt : `lifespan`](#7-démarrage-et-arrêt--lifespan)
8. [Index des routes : quelle URL, quel fichier](#8-index-des-routes--quelle-url-quel-fichier)
9. [Correspondance ancien `main.py` → nouveaux fichiers](#9-correspondance-ancien-mainpy--nouveaux-fichiers)
10. [Recette : ajouter une fonctionnalité](#10-recette--ajouter-une-fonctionnalité)
11. [Ce qui a changé, ce qui n'a pas changé](#11-ce-qui-a-changé-ce-qui-na-pas-changé)
12. [Comment le découpage a été vérifié](#12-comment-le-découpage-a-été-vérifié)

---

## 1. Avant / après

**Avant :** un seul fichier, `main.py`, contenait tout :

- 16 routes ;
- 8 schémas Pydantic ;
- les identifiants MinIO et Orthanc écrits en dur ;
- les appels à PyVips, MinIO, Orthanc et InstanSeg ;
- les calculs de l'analyse IA ;
- le nettoyage des fichiers.

Pour trouver le code d'une fonctionnalité, il fallait parcourir 1 200 lignes.
On ne pouvait pas tester une règle métier sans lancer un serveur, ni importer
`main` sans base de données, puisque les migrations s'exécutaient à l'import.

**Après :** chaque fichier a **une seule responsabilité** et reste court (≤ 235
lignes) :

```
                       ┌──────────────────────────┐
  requête HTTP  ─────▶ │ main.py (70 l.)          │  assemble l'application
                       └────────────┬─────────────┘
                                    │ include_router
                       ┌────────────▼─────────────┐
                       │ routers/   (HTTP)        │  URL, validation, appel du service
                       └────────────┬─────────────┘
                                    │ appelle
                       ┌────────────▼─────────────┐
                       │ services/  (métier)      │  règles, orchestration, base de données
                       └──────┬─────────────┬─────┘
                              │             │
                ┌─────────────▼───┐   ┌─────▼──────────────────┐
                │ models.py       │   │ clients/               │
                │ database.py     │   │ Garage · Orthanc ·     │
                │ (PostgreSQL)    │   │ InstanSeg              │
                └─────────────────┘   └────────────────────────┘

       schemas/  ← utilisés par routers/ et services/ (forme des données)
       config.py ← lu par clients/ et services/ (adresses, identifiants)
```

Le module [`workflow/`](../backend/workflow/) suivait déjà ce découpage. Il est
**inchangé** et sert de modèle.

---

## 2. Carte des fichiers

```
backend/
├── main.py                 70 l.  Assemble l'app : lifespan, CORS, erreurs, statiques, routeurs
├── config.py               34 l.  Toute la configuration (variables d'environnement)
├── migrations.py           32 l.  Alembic « upgrade head » au démarrage
├── database.py             38 l.  Engine, SessionLocal, Base, get_db        (inchangé)
├── models.py              176 l.  Tables SQLAlchemy                          (inchangé)
├── storage.py              78 l.  Où chercher une lame dans le stockage S3 (partagé)
├── seed_images.py         324 l.  Injection des images de démo              (inchangé)
│
├── routers/                       COUCHE HTTP — une route = quelques lignes
│   ├── health.py                  GET  /health
│   ├── patients.py                GET/POST /patients, DELETE /patients/{id}
│   ├── biopsies.py                POST upload-biopsy, DELETE /biopsies/{id}
│   ├── radiology.py               POST upload-radiology, compte-rendu, DELETE
│   ├── analysis.py                POST /analyze-ai
│   ├── extractions.py             /extract-roi, /annotations/save, /extractions/...
│   ├── account.py                 GET /me (utilisateur connecté, doc 16)
│   └── dependencies.py            require_user : exige un jeton Supabase (doc 16)
│
├── services/                      COUCHE MÉTIER — ne connaît pas HTTP
│   ├── errors.py                  ServiceError et ses sous-classes (404, 409...)
│   ├── patients.py                Créer, lister, supprimer un dossier
│   ├── biopsies.py                Importer une lame, la récupérer depuis Garage, la supprimer
│   ├── radiology.py               Import DICOM via Orthanc, compte-rendu, détachement
│   ├── analysis.py                Analyse IA : région → PNG → InstanSeg → bilan
│   ├── extractions.py             Créer / annoter / lister / supprimer une extraction
│   ├── health.py                  État de la base et d'InstanSeg
│   ├── auth.py                    Vérification des jetons Supabase, CurrentUser (doc 16)
│   ├── slide_processing.py        PyVips pur : tuilage DZI, découpe, résolution
│   └── tile_cleanup.py            Suppression rapide des tuiles (renommer puis effacer)
│
├── schemas/                       CONTRATS — modèles Pydantic, zéro logique
│   ├── patients.py                PatientSchema, PatientCreate
│   ├── biopsies.py                BiopsySchema
│   ├── radiology.py               RadiologySchema, ReportPayload
│   └── extractions.py             AnalysisPayload, DrawingSchema
│
├── clients/                       SERVICES EXTERNES — « comment leur parler »
│   ├── object_storage.py          Client S3 boto3 (Garage) : object_storage
│   ├── orthanc.py                 upload_instance(), get_study(), get_series()
│   └── instanseg.py               Client httpx d'InstanSeg (ex-instanseg_client.py)
│
├── workflow/                      Moteur de workflow (inchangé, même découpage)
│   ├── router.py · service.py · schemas.py · constants.py
│
└── alembic/                       Migrations de schéma (inchangé)
```

**Pourquoi `database.py`, `models.py` et `storage.py` restent à la racine ?**
Ils sont aussi importés par `seed_images.py` et `alembic/env.py`, qui s'exécutent
en dehors de l'API. Les déplacer aurait obligé à modifier ces deux scripts sans
rien y gagner.

---

## 3. Les quatre couches et leurs règles

| Couche | Rôle | A le droit de | N'a PAS le droit de |
|---|---|---|---|
| **`routers/`** | Déclarer les URL | Lire les paramètres, appeler **un** service, renvoyer sa réponse, brancher une `BackgroundTasks` | Faire une requête SQL, appeler le stockage S3 ou Orthanc, contenir un `if` métier |
| **`services/`** | Appliquer les règles métier | Utiliser `db`, `models`, `clients/`, `config`, lever une `ServiceError` | Importer `HTTPException`, connaître les codes HTTP autrement que via `errors.py` |
| **`schemas/`** | Décrire les données échangées | Déclarer des champs et des valeurs par défaut | Contenir de la logique ou des accès à la base |
| **`clients/`** | Parler à un service externe | Ouvrir une connexion, faire un appel réseau | Connaître les patients, les lames ou une règle métier |

**Sens des dépendances :** `routers → services → (clients, models)`. Jamais
l'inverse : un service n'importe pas un routeur, un client n'importe pas un
service.

**Deux nuances assumées :**

- `services/biopsies.py` et `services/radiology.py` reçoivent un `UploadFile`.
  C'est un objet de Starlette, mais il sert ici de simple fichier : on le lit et
  on le ferme. Le convertir avant l'appel aurait obligé à copier une lame de
  plusieurs centaines de Mo en mémoire.
- `services/slide_processing.py` est **synchrone** (PyVips bloque). Les services
  asynchrones l'appellent toujours via `run_in_threadpool`, sinon toute l'API
  gèle pendant le traitement.

---

## 4. Le trajet d'une requête

Exemple : `POST /patients/3/upload-biopsy` avec un fichier `lame.svs`.

```
1. main.py               uvicorn reçoit la requête ; FastAPI cherche la route
2. routers/biopsies.py   upload_biopsy(patient_id=3, file, db)
                           └─ return await biopsies.import_biopsy(db, 3, file)
3. services/biopsies.py  import_biopsy()
     ├─ services/patients.get_patient(db, 3)          → NotFound si absent
     ├─ patient.biopsies non vide ?                    → Conflict (409)
     ├─ extension dans .svs/.tif/.tiff ?               → InvalidInput (400)
     ├─ copie par blocs de 8 Mo dans un fichier temporaire
     ├─ clients/object_storage : ensure_bucket() + fput_object()   (threadpool)
     ├─ services/slide_processing.tile_to_dzi()                    (threadpool)
     └─ models.Biopsy(...) → db.commit()
4. routers/biopsies.py   FastAPI convertit le Biopsy en BiopsySchema (201)
```

Si une étape lève une `ServiceError`, l'exécution s'arrête et `main.py` la
transforme en réponse HTTP (voir la section suivante).

---

## 5. Les erreurs : `ServiceError`

Les services **ne lèvent plus `HTTPException`**. Ils lèvent une erreur métier
définie dans [`services/errors.py`](../backend/services/errors.py) :

| Exception | Code HTTP | Exemple |
|---|---|---|
| `InvalidInput` | 400 | « Format accepté : .dcm » |
| `Forbidden` | 403 | Supprimer l'extraction d'un autre utilisateur |
| `NotFound` | 404 | « Patient introuvable » |
| `Conflict` | 409 | « Ce dossier contient deja une lame » |
| `UpstreamError` | 502 | Orthanc refuse le fichier ou ne répond pas |
| `ServiceUnavailable` | 503 | InstanSeg injoignable |
| `Unauthorized` | 401 | Jeton absent, invalide ou expiré (ajouté avec Supabase, doc 16) |
| `ServiceError(detail, status_code=500)` | au choix | Erreur imprévue |

Un **seul** gestionnaire, dans [`main.py`](../backend/main.py), les convertit :

```python
@app.exception_handler(ServiceError)
async def service_error_handler(request, exc):
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
```

La réponse est **identique** à celle d'une `HTTPException` (`{"detail": "..."}`).
Le frontend n'a donc rien à changer.

**Pourquoi ?** Un service qui ne dépend pas de FastAPI peut être appelé depuis
un test, un script ou une tâche de fond. Le module `workflow/` applique la même
idée avec sa propre `WorkflowError`. Il n'a pas été modifié.

---

## 6. La configuration : `config.py`

Toutes les adresses et tous les identifiants sont dans
[`config.py`](../backend/config.py), lus depuis les variables d'environnement :

| Variable | Défaut | Utilisée par |
|---|---|---|
| `DZI_FOLDER` | `/app/dzi_data` | `main.py` (fichiers statiques), services de lames |
| `PUBLIC_API_URL` | `http://localhost:8002` | `url` renvoyée par `GET /patients/{folder}/extractions` |
| `S3_ENDPOINT` | `http://garage:3900` | `clients/object_storage.py` |
| `S3_REGION` | `garage` | `clients/object_storage.py` |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | clé de développement | `clients/object_storage.py` |
| `S3_BUCKET` | `biopsie` | `clients/object_storage.py` |
| `ORTHANC_URL` | `http://orthanc:8042` | `clients/orthanc.py` |
| `ORTHANC_USER` / `ORTHANC_PASSWORD` | `orthanc` | `clients/orthanc.py` |
| `INSTANSEG_URL` | `http://instanseg:7000` | `clients/instanseg.py` |
| `DATABASE_URL` | (voir `database.py`) | `database.py`, non déplacé |

> **Depuis le passage à Garage**, les variables `MINIO_*` sont remplacées
> par `S3_*`, lues aussi par le seeder : voir [15 — Stockage Garage](15-stockage-garage.md).

Lors du découpage, les valeurs par défaut étaient **exactement** celles qui
étaient écrites en dur dans l'ancien `main.py`. Conséquence : les variables `MINIO_*` déclarées dans
`docker-compose.yml`, autrefois ignorées (piège B12), sont **enfin lues**. Comme
elles ont les mêmes valeurs, rien ne change en pratique.

> `seed_images.py` garde ses propres constantes : il n'a pas été modifié par ce
> découpage.

---

## 7. Démarrage et arrêt : `lifespan`

```
1. uvicorn importe main.py
     ├─ import config, clients/* → création des clients S3 (boto3) et InstanSeg
     │                              (aucune connexion ouverte à ce stade)
     ├─ app = FastAPI(lifespan=lifespan)
     ├─ CORS, gestionnaire de ServiceError
     ├─ mkdir DZI_FOLDER ; mount /dzi_data
     └─ include_router × 7 (health, patients, biopsies, radiology,
                            analysis, extractions, workflow)
2. Démarrage (lifespan, avant le yield)
     └─ migrations.apply_migrations_safely()  → alembic upgrade head
                                                (échec = message, pas de crash)
3. uvicorn écoute sur 0.0.0.0:8002
   ...
4. Arrêt (lifespan, après le yield)
     └─ instanseg_client.close()              → ferme le pool httpx
```

**Différence avec avant :** les migrations s'exécutaient **à l'import** de
`main.py`. Elles s'exécutent maintenant **au démarrage** du serveur. Avec
uvicorn, le résultat est le même. En revanche, `import main` ne touche plus à la
base de données, ce qui permet de l'importer dans un test.

`@app.on_event("shutdown")`, déprécié par FastAPI (dette C7), est remplacé par
le `lifespan`.

---

## 8. Index des routes : quelle URL, quel fichier

| Méthode | URL | Routeur | Fonction de service |
|---|---|---|---|
| GET | `/health` | `routers/health.py` | `services/health.check` |
| GET | `/patients` | `routers/patients.py` | `services/patients.list_patients` |
| POST | `/patients` | `routers/patients.py` | `services/patients.create_patient` |
| DELETE | `/patients/{patient_id}` | `routers/patients.py` | `services/patients.delete_patient` |
| POST | `/patients/{patient_id}/upload-biopsy` | `routers/biopsies.py` | `services/biopsies.import_biopsy` |
| DELETE | `/biopsies/{biopsy_id}` | `routers/biopsies.py` | `services/biopsies.delete_biopsy` |
| POST | `/patients/{patient_id}/upload-radiology` | `routers/radiology.py` | `services/radiology.import_dicom` |
| GET | `/radiology/{study_id}/report` | `routers/radiology.py` | `services/radiology.get_report` |
| POST | `/radiology/{study_id}/report` | `routers/radiology.py` | `services/radiology.save_report` |
| DELETE | `/radiology-studies/{study_id}` | `routers/radiology.py` | `services/radiology.detach_study` |
| POST | `/analyze-ai` | `routers/analysis.py` | `services/analysis.analyze_region` |
| POST | `/extract-roi` | `routers/extractions.py` | `services/extractions.create_from_region` |
| POST | `/annotations/save` | `routers/extractions.py` | `services/extractions.save_annotations` |
| GET | `/patients/{folder_id}/extractions` | `routers/extractions.py` | `services/extractions.list_for_folder` |
| GET | `/extractions/{extraction_id}/details` | `routers/extractions.py` | `services/extractions.get_details` |
| DELETE | `/extractions/{extraction_id}` | `routers/extractions.py` | `services/extractions.delete_extraction` |
| GET/PUT/POST | `/extractions/{id}/workflow...` | `workflow/router.py` | `workflow/service.py` (inchangé) |
| GET | `/dzi_data/...` | `main.py` (fichiers statiques) | — |

La documentation interactive `http://localhost:8002/docs` regroupe désormais
les routes par domaine (tags `patients`, `biopsies`, `radiology`, `analysis`,
`extractions`, `health`, `workflow`).

---

## 9. Correspondance ancien `main.py` → nouveaux fichiers

Pour retrouver un morceau de code cité dans un ancien document ou une ancienne
discussion :

| Ancien `main.py` | Nouvel emplacement |
|---|---|
| `apply_migrations()` + son appel à l'import | `migrations.py` (`apply_migrations`, `apply_migrations_safely`), appelé par le `lifespan` |
| `app = FastAPI()`, CORS, `app.mount("/dzi_data")` | `main.py` |
| `DZI_FOLDER`, `MINIO_HOST`, `ACCESS_KEY`, `SECRET_KEY`, `BUCKET_NAME` | `config.py` |
| `minio_client`, `ensure_minio_bucket()` | `clients/object_storage.py` (`object_storage`, `ensure_bucket`), en boto3 depuis le passage à Garage |
| `instanseg_client = InstanSegClient(...)` | `clients/instanseg.py` (en bas du fichier) |
| `instanseg_client.py` (fichier entier) | `clients/instanseg.py` (déplacé avec `git mv`) |
| Appels `requests` vers `http://orthanc:8042` | `clients/orthanc.py` |
| `BiopsySchema` | `schemas/biopsies.py` |
| `RadiologySchema`, `ReportPayload` | `schemas/radiology.py` |
| `PatientSchema`, `PatientCreate` | `schemas/patients.py` |
| `DrawingSchema`, `AnalysisPayload` | `schemas/extractions.py` |
| `safe_folder_name()` | `services/patients.py` |
| `create_patient`, `get_patients`, `delete_patient` | `routers/patients.py` + `services/patients.py` |
| `upload_biopsy`, `delete_biopsy` | `routers/biopsies.py` + `services/biopsies.py` |
| `download_biopsy_source()` | `services/biopsies.py` |
| `upload_radiology`, `get/save_radiology_report`, `delete_radiology_study` | `routers/radiology.py` + `services/radiology.py` |
| `close_clients()` (`on_event("shutdown")`) | `lifespan` dans `main.py` |
| `health_check()` | `routers/health.py` + `services/health.py` |
| `TAILLE_PIXEL_MIN_UM/MAX_UM`, `lire_taille_pixel()` | `services/slide_processing.py` |
| `_borner_region`, `_extraire_png` (fonctions internes de `/analyze-ai`) | `services/slide_processing.py` (`borner_region`, `extraire_png`) |
| `dzsave(...)` de l'upload | `services/slide_processing.tile_to_dzi` |
| `tiffsave(...)` de `/extract-roi` | `services/slide_processing.save_region_as_tiff` |
| `analyze_image_with_ai` | `routers/analysis.py` + `services/analysis.analyze_region` |
| Calcul densité / taille moyenne / pléomorphisme | `services/analysis._bilan` |
| Sérialisation des contours | `services/analysis._serialiser_contours` |
| `extract_roi`, `update_analysis`, `get_extractions`, `get_details`, `delete_extraction` | `routers/extractions.py` + `services/extractions.py` |
| `_retirer_chemin`, `_supprimer_tuiles`, `_effacer_en_arriere_plan` | `services/tile_cleanup.py` (`retirer_chemin`, `supprimer_tuiles`, `effacer_en_arriere_plan`) |

**Une seule factorisation :** les 16 champs du compte rendu (`prelevement_type`
… `validation_date`) étaient recopiés un par un à trois endroits. Ils sont
maintenant listés une fois dans `REPORT_FIELDS` (`services/extractions.py`) et
copiés en boucle. Les champs et les valeurs sont les mêmes.

---

## 10. Recette : ajouter une fonctionnalité

Exemple : ajouter `GET /patients/{patient_id}` (le détail d'un dossier).

**1. Le schéma** (s'il en faut un nouveau) dans `schemas/<domaine>.py`. Ici,
`PatientSchema` existe déjà.

**2. Le service** dans `services/patients.py` :

```python
def get_patient(db: Session, patient_id: int) -> models.Patient:
    ...  # existe déjà : lève NotFound("Patient introuvable")
```

**3. La route** dans `routers/patients.py` :

```python
@router.get("/patients/{patient_id}", response_model=PatientSchema)
def get_patient(patient_id: int, db: Session = Depends(database.get_db)):
    return patients.get_patient(db, patient_id)
```

C'est tout : le routeur est déjà inclus dans `main.py`.

**Nouveau domaine ?** (par exemple « comptes utilisateurs »)

1. Créez `schemas/users.py`, `services/users.py` et `routers/users.py` avec
   `router = APIRouter(tags=["users"])`.
2. Ajoutez une ligne dans `main.py` : `app.include_router(users.router)`.
3. Si le domaine est gros (machine à états, constantes...), faites plutôt un
   package autonome sur le modèle de `workflow/`.

**Un nouveau service externe ?** Ajoutez son adresse dans `config.py`, puis un
module dans `clients/`. Les services l'importent de là.

**À ne pas faire :**

- écrire une requête SQL dans un routeur ;
- lever `HTTPException` dans un service (utilisez `services/errors.py`) ;
- écrire une URL ou un mot de passe ailleurs que dans `config.py` ;
- appeler PyVips, boto3 (S3) ou `requests` depuis une fonction `async` sans
  `run_in_threadpool`.

**Tester un service sans serveur :**

```python
from services import patients
from services.errors import NotFound

def test_patient_absent(db):          # db : session sur une base de test
    with pytest.raises(NotFound):
        patients.get_patient(db, 999)
```

---

## 11. Ce qui a changé, ce qui n'a pas changé

**Inchangé (volontairement) :**

- **Le contrat de l'API** : 29 entrées de routage (les 16 routes historiques,
  celles du workflow, `/docs` et les fichiers statiques), mêmes chemins, paramètres, corps et
  réponses. Le frontend ne voit aucune différence.
- **Les bugs connus** de [09 — Pièges et bugs](09-pieges-et-bugs.md) (A1 à A10,
  B5...) sont toujours là. Un découpage ne doit pas changer le comportement :
  les corriger en même temps aurait rendu la vérification impossible. Des
  commentaires `Bug Ax` / `piège Bx` les signalent dans le nouveau code.
- `models.py`, `database.py`, `storage.py`, `seed_images.py`, `alembic/`,
  `workflow/`, `docker-compose.yml`, `Dockerfile`.

**Changé :**

| Changement | Effet |
|---|---|
| Découpage en `routers/`, `services/`, `schemas/`, `clients/` | Code trouvable par domaine |
| `config.py` lit l'environnement | Piège B12 résolu (variables `MINIO_*` enfin lues) |
| Migrations dans le `lifespan` | `import main` ne touche plus la base, ce qui rend les tests possibles |
| `on_event("shutdown")` → `lifespan` | Dette C7 résolue |
| `class Config: from_attributes` → `model_config = ConfigDict(...)` | Syntaxe Pydantic 2, sans avertissement de dépréciation |
| `instanseg_client.py` → `clients/instanseg.py` | Rangé avec les autres clients |
| Tags OpenAPI par domaine | `/docs` lisible |
| `REPORT_FIELDS` | Les 16 champs du compte rendu sont listés une seule fois |

---

## 12. Comment le découpage a été vérifié

1. **Contrat OpenAPI comparé.** Le schéma OpenAPI de l'ancien et du nouveau
   code a été généré puis comparé : les 29 entrées de routage, les chemins, les paramètres
   et les schémas sont identiques. Seules les descriptions changent, puisque
   les docstrings sont maintenant affichées.
2. **Scénario de 35 requêtes rejoué sur les deux versions.** Le test a tourné
   sur une base PostgreSQL et un MinIO jetables, avec la même image Docker
   pour les deux versions. Il couvre :
   - la création d'un patient ;
   - l'import d'une vraie lame TIFF, avec envoi dans MinIO et tuilage DZI ;
   - le service des tuiles ;
   - les refus 400, 404, 409 et 422 ;
   - Orthanc absent (502) et InstanSeg absent (503) ;
   - la création d'une extraction par PyVips, l'enregistrement des dessins, le
     détail et la liste des extractions, le workflow ;
   - les suppressions, avec les refus 403 et 404.

   Résultat : **réponses identiques** (codes et corps) sur les 35 étapes.

Non vérifié automatiquement : un import DICOM réussi (il faut Orthanc) et une
analyse IA réussie (il faut InstanSeg). Ces deux chemins sont du code déplacé
sans modification de logique, mais il faut les tester à la main avec
`docker compose up` avant de fusionner.
