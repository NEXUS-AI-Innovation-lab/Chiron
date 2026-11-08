# 04 — Architecture backend

**Stack :** Python 3.9 · FastAPI 0.128.8 · SQLAlchemy 2.0.49 · Pydantic 2.13.4 ·
Alembic 1.16.5 · PyVips 3.1.1 · boto3 1.42.97 · httpx 0.28.1 · NumPy 2.0.2

---

## 1. Carte des fichiers

```
backend/
├── main.py                    70 l.  Assemble l'app (lifespan, CORS, erreurs, routeurs)
├── config.py                  34 l.  Configuration lue depuis l'environnement
├── migrations.py              32 l.  Alembic « upgrade head » au démarrage
├── models.py                 176 l.  Modèles SQLAlchemy (7 tables)
├── database.py                38 l.  Engine, SessionLocal, Base, get_db
├── storage.py                 78 l.  Résolution des lames dans Garage (PARTAGÉ)
├── seed_images.py            324 l.  Réconciliation des tuiles + injection
│
├── routers/                           Routes HTTP, une par domaine (voir doc 14)
├── services/                          Logique métier (voir doc 14)
├── schemas/                           Contrats Pydantic (voir doc 14)
├── clients/                           S3 (Garage, boto3), Orthanc, InstanSeg (voir doc 14 et 15)
│
├── workflow/                          Moteur de workflow, même découpage
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

> **Chaque morceau de code va dans sa couche : `routers/` (HTTP), `services/`
> (métier), `schemas/` (contrats), `clients/` (services externes).** Le détail
> complet, l'index des routes et la correspondance avec l'ancien `main.py` sont
> dans [14 — Architecture backend](14-architecture-backend.md).

L'ancien `main.py` de 1 150 lignes a été découpé selon ce modèle, déjà appliqué
par `workflow/` :

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
_DEFAULT_URL = "postgresql://postgres:postgres@host.docker.internal:56322/postgres"  # Supabase
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

## 3. `main.py` — l'assemblage de l'application

`main.py` ne contient plus aucune route. Il fait cinq choses, dans cet ordre :

| Étape | Contenu |
|---|---|
| `lifespan` | Migrations Alembic au démarrage, fermeture du client InstanSeg à l'arrêt |
| `app.add_middleware` | CORS |
| `@app.exception_handler(ServiceError)` | Transforme les erreurs métier en `{"detail": ...}` |
| `app.mount("/dzi_data")` | Sert les tuiles DZI |
| `app.include_router` × 7 | `health`, `patients`, `biopsies`, `radiology`, `analysis`, `extractions`, `workflow` |

Pour trouver le code d'une route, utilisez l'index de
[14 — Architecture backend §8](14-architecture-backend.md#8-index-des-routes--quelle-url-quel-fichier).

### Le montage statique des tuiles

```python
os.makedirs(config.DZI_FOLDER, exist_ok=True)   # /app/dzi_data par défaut
app.mount("/dzi_data", StaticFiles(directory=config.DZI_FOLDER), name="dzi_data")
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

**Le problème.** PyVips, Garage et `requests` sont **synchrones**. Appelés
directement depuis une route `async def`, ils bloquent la **boucle d'événements**
d'uvicorn : l'API entière devient injoignable (`ERR_CONNECTION_RESET`) pendant
toute la durée de l'opération — plusieurs minutes pour une lame de 500 Mo.

**La solution.** `starlette.concurrency.run_in_threadpool` déporte l'appel dans
un thread séparé.

```python
# Envoi vers Garage (S3) — services/biopsies.py
await run_in_threadpool(object_storage.upload_file, object_key, str(source_path))

# Tuilage PyVips — services/biopsies.py → services/slide_processing.py
await run_in_threadpool(
    slide_processing.tile_to_dzi, source_path, patient_dir / stem
)

# Appel HTTP vers Orthanc — services/radiology.py → clients/orthanc.py
orthanc_response = await run_in_threadpool(orthanc.upload_instance, file.file)
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
# Réception d'un upload par blocs de 8 Mo — services/biopsies.py
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
> dans [services/biopsies.py](../backend/services/biopsies.py).

### Pattern 3 — suppression différée des tuiles

```python
def retirer_chemin(cible, rapport, differes):   # services/tile_cleanup.py
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

78 lignes, **partagées entre les services de l'API et `seed_images.py`**. Deux fonctions
publiques :

```python
candidate_object_keys(store, folder_id, image_url) -> List[str]
    # Tous les emplacements possibles, du plus précis au plus large

find_object_key(store, folder_id, image_url) -> Optional[str]
    # Le premier qui existe réellement (HEAD S3, NE TÉLÉCHARGE RIEN)
```

Pourquoi c'est nécessaire : `Biopsy.image_url` désigne le **fichier DZI**, dont
le nom ne correspond pas forcément à l'objet Garage. Et deux dispositions
coexistent dans le bucket (voir [03 — Docker §2](03-docker.md#2-garage--le-stockage-objet-des-lames)).

`find_object_key` utilise `store.exists()` (requête HEAD) : il vérifie l'existence **sans
rapatrier** plusieurs centaines de Mo. `download_biopsy_source` dans `services/biopsies.py`,
lui, télécharge vraiment et lève une `404` explicite listant les emplacements
essayés :

```python
raise NotFound(
    "Lame source introuvable dans le stockage S3 pour ce patient. "
    f"Emplacements essayes : {', '.join(candidates[:6])}."
)
```

C'est un bon exemple du principe « les erreurs se voient » : le message dit quoi
vérifier.

---

## 6. `clients/instanseg.py` — le client du service IA

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
  `close()` appelé à l'arrêt par le `lifespan` de
  [main.py](../backend/main.py). Sans ça, les connexions du
  pool restaient ouvertes jusqu'à la fin du processus.
- **Timeout de 300 s** : la segmentation CPU d'un patch 1500×1500 peut être
  longue.
- Les réponses sont validées par des modèles Pydantic (`Instance`,
  `SegmentResult`, `BlobPoints`) — le contrat du service est explicite.

> L'ancien `@app.on_event("shutdown")`, déprécié, a été remplacé par le
> `lifespan` lors du découpage du backend.

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

## 8. Les schémas Pydantic de `schemas/`

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
    model_config = ConfigDict(from_attributes=True)

    id: int
    image_url: Optional[str] = None
    status: str
```

`from_attributes = True` (l'ex-`orm_mode` de Pydantic v1) autorise la
construction depuis un objet SQLAlchemy. C'est ce qui permet
`return patient` avec `response_model=PatientSchema`.

> L'ancien `main.py` utilisait `class Config:` (style Pydantic v1). Le découpage
> est passé à `model_config = ConfigDict(...)`, le style de Pydantic v2.

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
   backend/services/extractions.py      → REPORT_FIELDS ou get_details()
6. docker compose restart backend
```

### Ajouter une route

Dans un domaine existant : un schéma dans `schemas/<domaine>.py` si besoin, une
fonction dans `services/<domaine>.py`, puis quelques lignes dans
`routers/<domaine>.py`. La recette complète est dans
[14 — Architecture backend §10](14-architecture-backend.md#10-recette--ajouter-une-fonctionnalité).

Pour un gros domaine autonome (machine à états, constantes...), créez plutôt
un package sur le modèle de `workflow/` :

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
// Routes de routers/ (ServiceError) — detail est une CHAÎNE
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
# services/health.py (la route est dans routers/health.py)
async def check():
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
    return healthy, payload   # le routeur renvoie 503 si healthy est faux
```

Le commentaire du code est explicite : *« La base est réellement interrogée :
jusqu'ici `database: connected` était affirmé sans aucun test, ce qui rendait le
diagnostic trompeur. »*

> ⚠️ `/health` ne teste **ni Garage ni Orthanc**. Une lame introuvable ou un PACS
> mort ne dégradent pas le statut. C'est une amélioration facile et utile.
