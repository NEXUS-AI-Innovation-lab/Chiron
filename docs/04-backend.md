# 04 — Architecture backend

**Stack :** Python 3.9 · FastAPI 0.128.8 · SQLAlchemy 2.0.49 · Pydantic 2.13.4 ·
Alembic 1.16.5 · PyVips 3.1.1 · MinIO 7.2.20 · httpx 0.28.1 · NumPy 2.0.2

---

## 1. Carte des fichiers

```
backend/
├── main.py                 1 150 l.  API historique — TOUT sauf le workflow
├── models.py                 176 l.  Modèles SQLAlchemy (7 tables)
├── database.py                38 l.  Engine, SessionLocal, Base, get_db
├── storage.py                 78 l.  Résolution des lames dans MinIO (PARTAGÉ)
├── instanseg_client.py        90 l.  Client HTTP du micro-service IA
├── seed_images.py            324 l.  Réconciliation des tuiles + injection
│
├── workflow/                          ← STRUCTURE CIBLE
│   ├── __init__.py             1 l.
│   ├── router.py              97 l.  Routes HTTP, zéro règle métier
│   ├── service.py            255 l.  Machine à états — TOUTE la logique
│   ├── schemas.py             56 l.  Contrats Pydantic
│   └── constants.py          105 l.  Étapes, libellés, projection colonnes
│
├── alembic/
│   ├── env.py                        URL depuis database.py, pas alembic.ini
│   ├── script.py.mako
│   └── versions/
│       └── 719b309ce4d3_schema_initial.py
├── alembic.ini
├── requirements.txt
├── Dockerfile
├── .dockerignore
├── images_initiales/                 Images de démonstration (seeder)
└── dzi_data/                         Tuiles générées (gitignored, monté en volume)
```

### La règle d'or

> **`main.py` est du code historique. Le nouveau code va dans un package
> dédié, sur le modèle de `workflow/`.**

`workflow/` montre la structure cible :

| Couche | Fichier | Responsabilité | Ne fait PAS |
|---|---|---|---|
| **Routeur** | `router.py` | Résout l'entité, délègue, traduit les erreurs métier en codes HTTP | Aucune règle métier |
| **Service** | `service.py` | Machine à états, règles de transition, persistance | Ne connaît ni HTTP ni FastAPI |
| **Schémas** | `schemas.py` | Contrats d'entrée/sortie Pydantic | Aucune logique |
| **Constantes** | `constants.py` | Données de référence : étapes, libellés, projection | Aucun I/O |

Le service lève des `WorkflowError(code, message, details)` ; le routeur les
traduit via un simple dictionnaire :

```python
_STATUS_BY_CODE = {
    "unknown_step":   404,
    "invalid_payload": 422,
    "missing_fields":  422,
    "step_locked":     409,
}
```

Ce découpage rend le service **testable sans serveur HTTP**.

---

## 2. `database.py` — la connexion

```python
_DEFAULT_URL = "postgresql://user:password@p6_postgres:5432/p6_db"
SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL", _DEFAULT_URL)

engine = create_engine(SQLALCHEMY_DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

Trois points à retenir :

1. **`DATABASE_URL` prime.** La valeur en dur n'est qu'un repli pour un
   lancement hors conteneur. Le commentaire du fichier précise que jusqu'ici
   elle était la seule source, *« ce qui rendait la variable du compose
   totalement inopérante »*.
2. **`pool_pre_ping=True`** teste la connexion avant de la prêter. Sans ça, la
   première requête après une période d'inactivité échouait avec une connexion
   coupée par le serveur.
3. **`declarative_base` vient de `sqlalchemy.orm`** — l'ancien chemin
   `sqlalchemy.ext.declarative` est déprécié depuis SQLAlchemy 2.0.

`get_db` est un **générateur** consommé par `Depends(database.get_db)` : FastAPI
ouvre une session par requête et la ferme quoi qu'il arrive.

---

## 3. `main.py` — anatomie du fichier historique

### Ordre de lecture

| Lignes | Contenu |
|---|---|
| 1-27 | Imports |
| 29-51 | `apply_migrations()` + exécution immédiate |
| 53-72 | App FastAPI, CORS, montage `/dzi_data`, inclusion du routeur workflow |
| 74-87 | Clients MinIO et InstanSeg |
| 90-141 | Schémas Pydantic patients + helpers |
| 144-371 | Routes de création et d'import |
| 374-452 | Schémas d'annotation + routes de compte rendu radiologique |
| 455-496 | Arrêt propre + `/health` |
| 499-543 | `download_biopsy_source()` |
| 546-677 | `POST /analyze-ai` |
| 680-943 | Extractions, annotations, détails |
| 945-1151 | Suppressions (patient, biopsie, étude) + helpers de nettoyage |

### Le montage statique des tuiles

```python
DZI_FOLDER = "/app/dzi_data"
os.makedirs(DZI_FOLDER, exist_ok=True)
app.mount("/dzi_data", StaticFiles(directory=DZI_FOLDER), name="dzi_data")
```

C'est ce qui rend `http://localhost:8002/dzi_data/William-abc/CMU-1.dzi`
accessible à OpenSeadragon. **Aucun contrôle d'accès** : n'importe qui
connaissant le chemin lit les tuiles. Limite assumée (diapositive 13).

### CORS

```python
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])
```

Ouvert à toutes les origines. Acceptable en développement, inacceptable en
déploiement.

---

## 4. Les trois patterns récurrents du backend

### Pattern 1 — `run_in_threadpool` pour tout travail synchrone

**Le problème.** PyVips, MinIO et `requests` sont **synchrones**. Appelés
directement depuis une route `async def`, ils bloquent la **boucle d'événements**
d'uvicorn : l'API entière devient injoignable (`ERR_CONNECTION_RESET`) pendant
toute la durée de l'opération — plusieurs minutes pour une lame de 500 Mo.

**La solution.** `starlette.concurrency.run_in_threadpool` déporte l'appel dans
un thread séparé.

```python
# Envoi vers MinIO — main.py:209
await run_in_threadpool(
    minio_client.fput_object, BUCKET_NAME, minio_object_name, str(source_path)
)

# Tuilage PyVips — main.py:218
await run_in_threadpool(
    lambda: pyvips.Image.new_from_file(str(source_path), access="sequential")
        .dzsave(str(patient_dir / stem), tile_size=256, overlap=1, suffix=".jpg")
)

# Appel HTTP vers Orthanc — main.py:270
orthanc_response = await run_in_threadpool(
    lambda: requests.post("http://orthanc:8042/instances", data=file.file, ...)
)
```

> **Règle à appliquer systématiquement :** dans une route `async def`, tout appel
> bloquant (I/O disque, réseau synchrone, calcul lourd) passe par
> `run_in_threadpool`.
>
> ⚠️ **`POST /extract-roi` est une route `def` (synchrone)** — FastAPI l'exécute
> alors *déjà* dans un threadpool, donc pas de blocage. Mais elle fait du
> tuilage lourd sans `run_in_threadpool` explicite : c'est correct par accident
> de signature. Si vous la passez en `async def`, vous **devez** ajouter les
> `run_in_threadpool`.

### Pattern 2 — lecture en flux, jamais tout en RAM

```python
# Réception d'un upload par blocs de 8 Mo — main.py:200-203
with tempfile.NamedTemporaryFile(delete=False, suffix=extension) as temporary:
    source_path = Path(temporary.name)
    while chunk := await file.read(8 * 1024 * 1024):
        temporary.write(chunk)
```

Et côté PyVips, `access="sequential"` demande une lecture en flux plutôt qu'un
chargement complet de l'image.

> **Le fichier temporaire va dans le dossier temporaire du système, PAS dans
> `dzi_data`.** Ce dernier est monté en statique : la lame brute y serait
> téléchargeable pendant l'import, et un import interrompu y laisserait
> plusieurs centaines de Mo. Commentaire explicite
> [main.py:196-199](../backend/main.py#L196-L199).

### Pattern 3 — suppression différée des tuiles

```python
def _retirer_chemin(cible, rapport, differes):
    resolu = cible.resolve()
    if not str(resolu).startswith(str(racine)):    # garde-fou anti-traversée
        rapport["warnings"].append(f"Chemin hors dzi_data ignore : {cible}")
        return
    if resolu.is_dir():
        ecarte = resolu.with_name(f"{resolu.name}.suppression-{uuid4().hex[:8]}")
        resolu.rename(ecarte)          # ← INSTANTANÉ
        differes.append(ecarte)        # ← effacement réel en tâche de fond
```

Un dossier de tuiles contient des **dizaines de milliers de fichiers** ; le
`rmtree` prend près d'une minute sur un volume monté. Le **renommage** est
instantané et fait disparaître le dossier du point de vue de l'application. Le
`shutil.rmtree` réel part ensuite dans un `BackgroundTasks` de FastAPI :

```python
if differes:
    taches.add_task(_effacer_en_arriere_plan, differes)
```

Notez le **garde-fou de traversée de chemin** : on vérifie que le chemin résolu
reste sous `dzi_data`. C'est la seule protection de ce type du backend.

---

## 5. `storage.py` — la résolution des lames

78 lignes, **partagées entre `main.py` et `seed_images.py`**. Deux fonctions
publiques :

```python
candidate_object_keys(minio_client, bucket, folder_id, image_url) -> List[str]
    # Tous les emplacements possibles, du plus précis au plus large

find_object_key(minio_client, bucket, folder_id, image_url) -> Optional[str]
    # Le premier qui existe réellement (stat_object, NE TÉLÉCHARGE RIEN)
```

Pourquoi c'est nécessaire : `Biopsy.image_url` désigne le **fichier DZI**, dont
le nom ne correspond pas forcément à l'objet MinIO. Et deux dispositions
coexistent dans le bucket (voir [03 — Docker §2](03-docker.md#2-minio--le-stockage-objet-des-lames)).

`find_object_key` utilise `stat_object` : il vérifie l'existence **sans
rapatrier** plusieurs centaines de Mo. `download_biopsy_source` dans `main.py`,
lui, télécharge vraiment et lève une `404` explicite listant les emplacements
essayés :

```python
raise HTTPException(status_code=404, detail=(
    "Lame source introuvable dans MinIO pour ce patient. "
    f"Emplacements essayes : {', '.join(candidates[:6])}."
))
```

C'est un bon exemple du principe « les erreurs se voient » : le message dit quoi
vérifier.

---

## 6. `instanseg_client.py` — le client du service IA

```python
class InstanSegClient:
    def __init__(self, base_url: str = "http://instanseg:7000"):
        self.client = httpx.AsyncClient(base_url=base_url, timeout=300.0)

    async def health() -> Dict[str, Any]
    async def segment(file_bytes, model, target, pixel_size) -> SegmentResult
    async def segment_points(file_bytes, model, target, pixel_size, mode) -> List[BlobPoints]
    async def close()
```

- **`httpx.AsyncClient`** avec un pool de connexions réutilisé — d'où le
  `close()` branché sur `@app.on_event("shutdown")`
  ([main.py:455-462](../backend/main.py#L455-L462)). Sans ça, les connexions du
  pool restaient ouvertes jusqu'à la fin du processus.
- **Timeout de 300 s** : la segmentation CPU d'un patch 1500×1500 peut être
  longue.
- Les réponses sont validées par des modèles Pydantic (`Instance`,
  `SegmentResult`, `BlobPoints`) — le contrat du service est explicite.

> `@app.on_event("shutdown")` est **déprécié** en FastAPI moderne au profit du
> `lifespan`. Fonctionnel, mais à moderniser.

---

## 7. `workflow/` en détail

### `constants.py` — les données de référence

```python
STEP_IDS = ["prelevement", "preparation", "microscopie", "diagnostic"]
STEP_LABELS = {"prelevement": "Prélèvement", ...}
FIRST_STEP, LAST_STEP = STEP_IDS[0], STEP_IDS[-1]

def step_position(step) -> int:      # rang 1-based, ValueError si inconnu
    return STEP_IDS.index(step) + 1

FIELD_TO_COLUMN = {                  # clé OLGA -> (colonne, convertisseur)
  "prelevement": {"prelevementType": ("prelevement_type", _to_str), ...},
  ...
}

def column_to_field(step) -> Dict[str, str]:    # correspondance inverse

REQUIRED_FIELDS = {step: [] for step in STEP_IDS}   # VIDE aujourd'hui
```

> **`REQUIRED_FIELDS` est vide.** Aucun formulaire OLGA ne marque de champ
> obligatoire, donc aucune étape n'a de champ requis. Le mécanisme est en place
> (`_missing_required` → `422`) et s'applique **dès qu'une entrée est ajoutée
> ici**. C'est le point d'accroche pour la « validation champ par champ » citée
> comme travail restant sur la diapositive 13.

**L'ordre des étapes est défini ici et à un seul autre endroit** :
[`frontend/src/features/workflow/steps.ts`](../frontend/src/features/workflow/steps.ts).
Les deux listes doivent rester alignées. La route `GET /extractions/workflow/steps`
existe précisément pour qu'un client puisse récupérer l'ordre de référence.

### `service.py` — la machine à états

**Fonctions publiques**

| Fonction | Rôle |
|---|---|
| `get_or_create_state(db, extraction)` | Retourne l'état, en le **reconstruisant** au premier accès depuis les colonnes historiques |
| `save_step(db, extraction, step, data, validated_by, validate_step)` | Enregistre, éventuellement valide, projette sur les colonnes |
| `goto_step(db, extraction, step)` | Repositionne sur une étape déjà accessible |
| `to_schema(state)` | Sérialise pour le frontend |
| `max_reached_position(state)` | Rang le plus avancé accessible |

**Le cœur du blocage de transition** (`save_step`) :

```python
state = get_or_create_state(db, extraction)
target = _step_state(state, step)
position = step_position(step)
reachable = max_reached_position(state)

if position > reachable:
    raise WorkflowError("step_locked",
        "Cette étape n'est pas encore accessible : validez d'abord les précédentes.",
        {"max_reached_position": reachable})
```

Et l'avancement, **d'un seul cran** :

```python
if validate_step:
    target.validated_at = datetime.utcnow()
    target.validated_by = validated_by or extraction.owner
    if position < len(STEP_IDS):
        state.current_step = STEP_IDS[position]   # position est 1-based → cran suivant
        state.completed_at = None
    else:
        state.current_step = LAST_STEP
        state.completed_at = datetime.utcnow()
```

`max_reached_position` compte les positions validées **consécutives** :

```python
validated = {s.position for s in state.steps if s.validated_at is not None}
consecutive = 0
for position in range(1, len(STEP_IDS) + 1):
    if position not in validated:
        break
    consecutive = position
return min(consecutive + 1, len(STEP_IDS))
```

Traduction : si les étapes 1 et 2 sont validées, `reachable = 3`. On peut donc
écrire les étapes 1, 2 et 3, mais pas la 4.

**La double écriture** (`_mirror_to_columns`) :

```python
for field, (column, convert) in FIELD_TO_COLUMN[step].items():
    if field in data:
        setattr(extraction, column, convert(data[field]))
```

Seuls les champs **présents dans `data`** sont projetés — un champ absent ne
remet pas la colonne à zéro.

### `schemas.py` — les contrats

| Schéma | Sens | Champs notables |
|---|---|---|
| `StepStateSchema` | sortie | `step`, `position`, `label`, `data`, `validated_at`, `validated_by` |
| `WorkflowStateSchema` | sortie | + `current_position`, `step_count`, `is_complete`, `max_reached_position` |
| `StepSavePayload` | entrée | `data`, `validated_by`, **`validate_step: bool = True`** |
| `TransitionPayload` | entrée | `step` |

`validate_step=False` = **brouillon** : la saisie partielle est conservée sans
franchir l'étape.

---

## 8. Les schémas Pydantic de `main.py`

### `AnalysisPayload` — le schéma fourre-tout

Un **seul** schéma sert trois routes : `/analyze-ai`, `/extract-roi`,
`/annotations/save`. Il porte 26 champs optionnels, dont l'union de :

- la géométrie de la région (`x`, `y`, `width`, `height`) ;
- l'identité du dossier (`patient_folder`, `patient_name`, `owner`) ;
- **tout le formulaire médical à plat** (`prelevement_type` … `validation_date`) ;
- les annotations (`drawings: List[DrawingSchema]`).

> **Conséquence :** `/analyze-ai` n'a besoin que de 4 champs mais en accepte 26.
> Et comme Pydantic v2 **ignore les champs inconnus par défaut**, le frontend
> peut envoyer `filename` (qui n'existe pas dans le schéma) sans erreur — il est
> simplement jeté.
>
> C'est une dette : un schéma par route rendrait le contrat lisible dans Swagger.

### Configuration `from_attributes`

```python
class BiopsySchema(BaseModel):
    id: int
    image_url: Optional[str] = None
    status: str
    class Config:
        from_attributes = True
```

`from_attributes = True` (l'ex-`orm_mode` de Pydantic v1) autorise la
construction depuis un objet SQLAlchemy. C'est ce qui permet
`return patient` avec `response_model=PatientSchema`.

> Syntaxe `class Config` = style Pydantic v1, toléré en v2. Le style moderne est
> `model_config = ConfigDict(from_attributes=True)`.

---

## 9. Ajouter une fonctionnalité — le mode d'emploi

### Ajouter une colonne

```
1. backend/models.py                    → ajouter la Column
2. docker exec p6_backend sh -c 'cd /app && alembic revision --autogenerate -m "..."'
3. RELIRE le fichier généré dans alembic/versions/
4. Si c'est un champ de formulaire :
   backend/workflow/constants.py        → ajouter dans FIELD_TO_COLUMN[etape]
                                          avec le bon convertisseur
5. Si elle doit sortir par l'API :
   backend/main.py get_details()        → ajouter la clé
6. docker compose restart backend
```

### Ajouter une route

**Ne l'ajoutez pas dans `main.py`.** Créez un package sur le modèle de
`workflow/` :

```
backend/mondomaine/
├── __init__.py
├── router.py      APIRouter(prefix="/mondomaine", tags=["mondomaine"])
├── service.py     logique métier, lève des exceptions typées
├── schemas.py     Pydantic
└── constants.py   données de référence
```

Puis dans `main.py`, à côté de l'inclusion existante :

```python
from mondomaine.router import router as mondomaine_router
app.include_router(mondomaine_router)
```

### Ajouter une étape au workflow

Il faut modifier **deux** fichiers, l'un côté backend, l'autre côté frontend :

```
1. backend/workflow/constants.py
   - STEP_IDS       : insérer l'identifiant à la bonne position
   - STEP_LABELS    : le libellé français
   - FIELD_TO_COLUMN: la projection des champs (ou {} si pas de colonne)
   - REQUIRED_FIELDS: automatique (dict comprehension sur STEP_IDS)

2. frontend/src/features/workflow/steps.ts
   - WORKFLOW_STEPS : { id, order, label, olgaFormId, schemaId }
     ⚠️ l'identifiant DOIT être identique à celui de STEP_IDS

3. Créer le formulaire dans OLGA, récupérer son UUID
4. cd frontend && npm run olga:schemas    → génère schemas/<id>.json
5. Vérifier que schemas/index.ts importe le nouveau fichier
```

> ⚠️ **Les extractions existantes** ont déjà 4 lignes dans
> `workflow_step_states`. `get_or_create_state` ne se déclenche que si
> `extraction.workflow is None` — les états déjà créés ne recevront **pas** la
> nouvelle étape. Une migration de données est nécessaire.

---

## 10. Gestion des erreurs — les conventions du backend

| Situation | Code | Exemple de message |
|---|---|---|
| Ressource absente | `404` | `"Patient introuvable"`, `"Lame introuvable"` |
| Format de fichier refusé | `400` | `"Format accepté : .svs, .tif ou .tiff"` |
| Règle métier violée | `409` | `"Ce dossier contient deja une lame (...)"` |
| Pas propriétaire | `403` | (sans message) |
| Champ obligatoire manquant | `422` | `{code, message, details:{missing:[…]}}` |
| Service tiers en panne | `502` | `"Orthanc indisponible : …"` |
| InstanSeg absent | `503` | `"Service InstanSeg indisponible : …"` |
| Dépendance dégradée | `503` | Corps de `/health` avec l'erreur exacte |
| Erreur inattendue | `500` | `f"Échec de l'upload de biopsie : {error}"` |

**Deux formes de `detail` coexistent** — c'est important pour le frontend :

```jsonc
// Routes de main.py — detail est une CHAÎNE
{ "detail": "Ce dossier contient deja une lame (...)" }

// Routes du workflow — detail est un OBJET
{ "detail": { "code": "step_locked",
              "message": "Cette étape n'est pas encore accessible…",
              "details": { "max_reached_position": 2 } } }
```

Le frontend gère les deux :
[workflowApi.ts:74-85](../frontend/src/features/workflow/workflowApi.ts#L74-L85)
teste la présence de `code` dans `detail`, et
[Viewer.tsx:1212-1217](../frontend/src/pages/Viewer.tsx#L1212-L1217) essaie
`detail` puis `detail.message`.

---

## 11. La route `/health` — un vrai contrôle

```python
@app.get("/health")
async def health_check():
    database_state = {"status": "connected"}
    try:
        with database.engine.connect() as connection:
            connection.execute(text("SELECT 1"))       # ← requête RÉELLE
    except Exception as error:
        database_state = {"status": "disconnected", "error": str(error)}

    try:
        instanseg_state = await instanseg_client.health()
    except Exception as error:
        instanseg_state = {"status": "disconnected", "error": str(error)}

    healthy = (database_state["status"] == "connected"
               and instanseg_state.get("status") != "disconnected")
    payload = {"status": "ok" if healthy else "degraded", "backend": "connected",
               "instanseg": instanseg_state, "database": database_state}
    return payload if healthy else JSONResponse(status_code=503, content=payload)
```

Le commentaire du code est explicite : *« La base est réellement interrogée :
jusqu'ici `database: connected` était affirmé sans aucun test, ce qui rendait le
diagnostic trompeur. »*

> ⚠️ `/health` ne teste **ni MinIO ni Orthanc**. Une lame introuvable ou un PACS
> mort ne dégradent pas le statut. C'est une amélioration facile et utile.
