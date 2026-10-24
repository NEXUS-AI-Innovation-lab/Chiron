# 03 — Docker : les 7 conteneurs

Fichier d'orchestration : [`docker-compose.yml`](../docker-compose.yml)
Réseau unique : `app_network` (driver `bridge`)
Volumes nommés : `postgres_data`, `minio_data`, `orthanc_data`

```bash
docker compose up -d --build     # tout démarrer
docker compose ps                # état des 7 conteneurs
docker compose logs -f backend   # suivre un service
docker compose down              # arrêter (les volumes survivent)
docker compose down -v           # ⚠️ arrêter ET DÉTRUIRE les données
```

---

## Carte des dépendances

```
        postgres ◄─────────┐          minio ◄──────────┐       orthanc ◄──┐
        (données)          │       (lames + extract.)   │       (DICOM)    │
            ▲              │              ▲             │          ▲       │
            │              │              │             │          │       │
            └──── backend ─┴──────────────┘             │          │       │
                    ▲  │                                 │          │       │
                    │  └──── instanseg (segmentation) ───┘          │       │
                    │                                               │       │
       frontend ────┘                                               │       │
     (navigateur)                                                   │       │
                                                                    │       │
        image_seeder ───────────────────────────────────────────────┴───────┘
        (one-shot au démarrage : dépend de backend, orthanc, minio)
```

> `depends_on` en Compose v2 **sans `condition`** ne fait qu'ordonner le
> *démarrage* des conteneurs — il n'attend pas qu'un service soit *prêt*. C'est
> pourquoi `seed_images.py` implémente sa propre boucle d'attente
> (`wait_for`, 60 tentatives × 2 s). Voir §7.

---

## 1. `postgres` — la base de données

```yaml
image: postgres:15
container_name: p6_postgres
environment:
  POSTGRES_USER: user
  POSTGRES_PASSWORD: password
  POSTGRES_DB: p6_db
ports: ["5432:5432"]
volumes: [postgres_data:/var/lib/postgresql/data]
```

| | |
|---|---|
| **Rôle** | Stocke les 7 tables métier + `alembic_version`. Seule source de vérité des données structurées. |
| **Image** | Officielle `postgres:15`, non modifiée. |
| **Persistance** | Volume nommé `postgres_data`. Survit à `docker compose down`, détruit par `down -v`. |
| **Qui l'appelle** | `backend` (SQLAlchemy) et `image_seeder` (même code). |
| **Port exposé** | `5432` sur l'hôte — utile pour brancher DBeaver / pgAdmin. |

**Diagnostic**

```bash
docker exec -it p6_postgres psql -U user -d p6_db -c '\dt'
docker exec p6_postgres pg_isready -U user
```

> ⚠️ Le port `5432` est exposé sur l'hôte. Si vous avez un PostgreSQL local, le
> démarrage échoue avec `port is already allocated`. Changez le mapping en
> `"5433:5432"` — le backend, lui, passe par le réseau Docker et n'est pas
> affecté.

---

## 2. `minio` — le stockage objet des lames

```yaml
image: minio/minio
container_name: p6_minio
hostname: minio
ports: ["9000:9000", "9001:9001"]
environment:
  MINIO_ROOT_USER: minioadmin
  MINIO_ROOT_PASSWORD: minioadmin
volumes: [minio_data:/data]
command: server /data --console-address ":9001"
networks:
  app_network:
    aliases: [minio]
```

| | |
|---|---|
| **Rôle** | Conserve **intactes** les lames sources (`.svs`, `.tif`) et les extractions TIFF pyramidales. Compatible S3. |
| **Bucket** | `biopsie` — créé à la volée par `ensure_minio_bucket()` ou par le seeder. |
| **Port 9000** | API S3 (celle qu'utilise le backend). |
| **Port 9001** | Console web — http://localhost:9001, `minioadmin`/`minioadmin`. |
| **Persistance** | Volume `minio_data`. |

**Pourquoi un `hostname` ET un `alias` réseau ?** Le backend a `minio:9000` en
dur dans [main.py:75](../backend/main.py#L75). L'alias garantit que ce nom
résout, quelle que soit la manière dont Compose préfixe les noms de service.

### Organisation du bucket `biopsie`

Deux dispositions **coexistent**, héritées de l'histoire du projet :

```
biopsie/
├── William-30b14509/              ← disposition APPLICATIVE (actuelle)
│   ├── CMU-1.svs                     écrite par POST /patients/{id}/upload-biopsy
│   └── extractions/                  et par le seeder actuel
│       └── extraction_1735820412.svs
│
└── CMU-1.svs                      ← disposition HISTORIQUE (ancien script)
                                      à la racine, sans dossier patient
```

D'où [`backend/storage.py`](../backend/storage.py), qui essaie **4 familles
d'emplacements**, du plus précis au plus large :

```python
1. f"{folder}/{stem}{ext}"   # disposition applicative
2. f"{stem}{ext}"            # racine, même nom que le DZI
3. f"{folder}{ext}"          # racine, nommé d'après le dossier patient
4. listing de {folder}/**    # tout objet de lame, hors /extractions/
```

Ce module est **partagé** par `main.py` et `seed_images.py` : sans lui, la même
liste serait dupliquée à deux endroits avec le risque qu'elle diverge. C'est la
correction de la difficulté décrite sur la diapositive 11 (« l'extraction
échouait pour trois patients sur quatre »).

**Diagnostic**

```bash
docker exec p6_minio mc alias set local http://localhost:9000 minioadmin minioadmin
docker exec p6_minio mc ls --recursive local/biopsie
```

---

## 3. `orthanc` — le PACS DICOM

```yaml
image: jodogne/orthanc-plugins:1.12.0
container_name: p6_orthanc
ports: ["8042:8042", "4242:4242"]
environment: [ORTHANC_NAME=Chiron PACS Radiologie]
volumes: [orthanc_data:/var/lib/orthanc/db]
```

| | |
|---|---|
| **Rôle** | Serveur **PACS** (Picture Archiving and Communication System). Indexe les fichiers DICOM, expose une API REST et le protocole WADO. |
| **Image** | `jodogne/orthanc-plugins` — variante avec plugins (dont WADO), par l'auteur d'Orthanc. |
| **Port 8042** | API REST + interface web. Auth basique `orthanc`/`orthanc` (**en dur** dans le code backend). |
| **Port 4242** | **DICOM natif (DIMSE)** — le protocole historique des modalités d'imagerie. Exposé mais **non utilisé** par Chiron. |
| **Persistance** | Volume `orthanc_data`. |

**Modèle hiérarchique DICOM** — indispensable pour comprendre les appels :

```
Patient
  └── Study     (une session d'examen)   ← orthanc_study_id
        └── Series  (une acquisition)    ← porte la Modality
              └── Instance  (une coupe)  ← le fichier .dcm
```

**Endpoints Orthanc utilisés par Chiron**

| Appel | Depuis | Usage |
|---|---|---|
| `POST /instances` | backend, seeder | Téléverser un `.dcm`. **Retourne `ParentStudy` et `ParentSeries`** |
| `GET /studies/{id}` | backend, seeder | `MainDicomTags` (date, description), `PatientMainDicomTags` |
| `GET /series/{id}` | backend, seeder | `MainDicomTags.Modality` |
| `GET /studies/{id}/instances` | **frontend** (via proxy) | Liste des coupes |
| `GET /instances/{id}/file` | **frontend** (via proxy WADO-URI) | Le fichier DICOM brut |
| `GET /system` | seeder | Sonde de disponibilité |

> **Le piège documenté sur la diapositive 10.** `ParentStudy` figure dans la
> réponse du `POST /instances`, **mais pas** dans `GET /instances/{id}` (qui
> n'expose que `ParentSeries`). Le relire par GET renvoyait toujours `None`,
> donc un `502` systématique. Voir
> [main.py:286-291](../backend/main.py#L286-L291).

> **Dédoublonnage par UID.** Orthanc identifie une instance par son
> `SOPInstanceUID`. Réimporter le même fichier ne crée pas de doublon : il
> retourne l'étude existante. D'où la vérification applicative qui refuse
> l'import avec un `409` en nommant le dossier propriétaire.

**Diagnostic**

```bash
curl -u orthanc:orthanc http://localhost:8042/system
curl -u orthanc:orthanc http://localhost:8042/studies
```

---

## 4. `backend` — l'API métier FastAPI

```yaml
build: ./backend
container_name: p6_backend
command: uvicorn main:app --host 0.0.0.0 --port 8002
volumes:
  - ./backend:/app
  - ./backend/dzi_data:/app/dzi_data
ports: ["8002:8002"]
environment:
  - DATABASE_URL=postgresql://user:password@p6_postgres:5432/p6_db
  - MINIO_ENDPOINT=minio:9000
  - MINIO_ACCESS_KEY=minioadmin
  - MINIO_SECRET_KEY=minioadmin
  - MINIO_BUCKET_NAME=biopsie
depends_on: [postgres, minio]
```

| | |
|---|---|
| **Rôle** | Cœur applicatif. 20 routes REST, orchestration de MinIO / Orthanc / InstanSeg, moteur de workflow, tuilage PyVips, service statique des tuiles. |
| **Base** | `python:3.9-slim` |
| **Paquets système** | `libvips-dev` (PyVips), `gcc`, `pkg-config`, `python3-dev`, `libc6-dev`, `libgl1`, `libglib2.0-0` |
| **Code monté en volume** | `./backend:/app` — modifier un `.py` puis `docker compose restart backend` suffit (**pas** de rechargement à chaud : pas de `--reload`). |
| **Taille de l'image** | ~1,7 Go (contre 15 Go si PyTorch y était embarqué) |

### Séquence de démarrage

```
1. import main.py
2. apply_migrations()          → alembic upgrade head    (échec = log, pas crash)
3. app = FastAPI()
4. CORSMiddleware  allow_origins=["*"]                   ← ouvert à tout
5. mkdir /app/dzi_data ; app.mount("/dzi_data", StaticFiles(...))
6. include_router(workflow_router)
7. Minio(...)          client MinIO
8. InstanSegClient(...) client httpx  timeout 300 s
9. uvicorn écoute sur 0.0.0.0:8002
```

### Les deux volumes

| Volume | Rôle |
|---|---|
| `./backend:/app` | Le code source. Développement à chaud. |
| `./backend/dzi_data:/app/dzi_data` | **Les tuiles DZI.** Bind mount vers l'hôte, ignoré par git (`.gitignore`). |

> **Ce second montage est redondant** (`dzi_data` est déjà dans `./backend`),
> mais il rend le chemin explicite. Il est aussi ce qui rend la suppression
> lente : effacer des dizaines de milliers de petits fichiers sur un bind mount
> Windows/Docker prend près d'une minute — d'où la stratégie « renommer puis
> effacer en tâche de fond » de
> [`_retirer_chemin()`](../backend/main.py#L1040-L1066).

### Incohérence de configuration à connaître

Le compose déclare `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`,
`MINIO_BUCKET_NAME` — mais [main.py:75-78](../backend/main.py#L75-L78) les
**ignore** et code les valeurs en dur :

```python
MINIO_HOST = "minio:9000"
ACCESS_KEY = "minioadmin"
SECRET_KEY = "minioadmin"
BUCKET_NAME = "biopsie"
```

Seul `seed_images.py` lit réellement l'environnement
([lignes 33-43](../backend/seed_images.py#L33-L43)) — et encore, sous les noms
`MINIO_HOST` / `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY`, donc `MINIO_ENDPOINT`
n'est lu **nulle part**. Voir [09 — Pièges](09-pieges-et-bugs.md).

`DATABASE_URL`, en revanche, est bien lu
([database.py:17](../backend/database.py#L17)).

---

## 5. `instanseg` — la segmentation de noyaux

```yaml
build: ./instanseg
container_name: p6_instanseg
ports: ["7000:7000"]
environment: [PYTHONUNBUFFERED=1]
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:7000/health"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 60s
```

| | |
|---|---|
| **Rôle** | Micro-service d'**instance segmentation** appliqué aux noyaux cellulaires en histologie. |
| **Base** | `python:3.11-slim` (≠ 3.9 du backend) |
| **Modèle** | `instanseg-torch`, installé depuis GitHub. Deux modèles : `brightfield_nuclei` (le seul utilisé) et `fluorescence_nuclei_and_cells`. |
| **Matériel** | PyTorch **CPU** (`--index-url .../whl/cpu`). `_get_device()` détecte CUDA puis MPS, mais retombe sur `cpu`. |
| **Cache** | Les modèles sont chargés paresseusement et gardés en mémoire dans `_cache` — le **premier appel est lent**. |
| **Healthcheck** | **Seul service qui en a un.** `start_period: 60s` laisse le temps au chargement PyTorch. |

### Ses 4 routes (port 7000)

| Méthode | Route | Rôle |
|---|---|---|
| `GET` | `/health` | `{status, device, loaded_models}` |
| `POST` | `/segment` | Instances détectées : `id`, `area_px`, centroïde, `bbox`, + `labeled_array` complet |
| `POST` | `/segment/mask` | Masque PNG colorisé, ou labels bruts 16 bits |
| `POST` | `/segment/points` | Contours en JSON : `[{color, points:[{x,y},…]}]` |

Le backend n'utilise que `/health`, `/segment` et `/segment/points`. `/segment/mask`
n'est appelé par personne.

**Paramètres communs** : `model` (défaut `brightfield_nuclei`), `target` (défaut
`nuclei`, aussi `cells` / `all_outputs`), `pixel_size` (optionnel).

### Pourquoi un service séparé

PyTorch + le modèle pèsent ~13 Go. Les embarquer dans l'API métier donnait une
image backend de **15 Go**. Isolés, le backend retombe à **1,7 Go** et n'est plus
qu'un client HTTP :
[`instanseg_client.py`](../backend/instanseg_client.py), 90 lignes.

`requirements.txt` du backend le dit explicitement :

```
# `instanseg-torch` a été retiré d'ici, il n'était importé nulle part
# et embarquait tout PyTorch (image de 15 Go).
httpx==0.28.1
```

> ⚠️ Le service n'est **pas** sur le chemin de démarrage du backend
> (`depends_on` ne le mentionne pas). Si InstanSeg est absent, tout fonctionne
> sauf l'analyse IA — et `/health` renvoie `503` avec l'erreur exacte.

---

## 6. `frontend` — React + Vite en mode développement

```yaml
build: ./frontend
container_name: p6_frontend
volumes:
  - ./frontend:/app
  - /app/node_modules          ← volume anonyme
ports: ["5173:5173"]
environment:
  - VITE_API_URL=http://localhost:8002
  - VITE_OLGA_API_URL=http://localhost:9091
```

| | |
|---|---|
| **Rôle** | Sert l'application React via le **serveur de développement Vite**. Pas de build de production, pas de Nginx. |
| **Base** | `node:20-alpine` |
| **Commande** | `npm run dev -- --host` (le `--host` expose sur `0.0.0.0`, sinon inaccessible depuis l'hôte) |
| **Rechargement** | **HMR actif** — modifier un `.tsx` se voit immédiatement, sans redémarrage. |

### Le volume anonyme `/app/node_modules` — le point à comprendre

```yaml
- ./frontend:/app        # 1. le code de l'hôte écrase /app
- /app/node_modules      # 2. mais node_modules reste celui de l'IMAGE
```

Sans la seconde ligne, le bind mount masquerait le `node_modules` installé au
build. Avec elle, Docker crée un volume anonyme qui **préserve** les dépendances
installées dans l'image.

> **Conséquence pratique :** ajouter une dépendance dans `package.json` ne suffit
> pas. Il faut :
> ```bash
> docker compose build frontend && docker compose up -d frontend
> # ou, plus direct :
> docker exec p6_frontend npm install <paquet>
> ```

### `usePolling: true`

[vite.config.ts:10-12](../frontend/vite.config.ts#L10-L12) force la surveillance
par **polling** : les événements inotify ne traversent pas les bind mounts
Docker sur Windows et macOS. Sans ça, le HMR ne se déclenche jamais. Coût : un
peu de CPU en permanence.

### Le proxy Orthanc

```ts
proxy: {
  '/orthanc': {
    target: 'http://p6_orthanc:8042',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/orthanc/, '')
  }
}
```

Le navigateur appelle `/orthanc/studies/xxx/instances` ; Vite réécrit vers
`http://p6_orthanc:8042/studies/xxx/instances`. Deux bénéfices : pas de CORS, et
les identifiants Orthanc ne transitent pas par le navigateur.

> ⚠️ **Ce proxy n'existe que dans le conteneur.** Lancer `npm run dev` sur
> l'hôte casse la radiologie : `p6_orthanc` ne résout pas hors du réseau Docker.
> Il faudrait alors changer le `target` en `http://localhost:8042`.

---

## 7. `image_seeder` — l'injection et la réconciliation

```yaml
build: ./backend          ← MÊME image que le backend
container_name: p6_image_seeder
command: python seed_images.py
volumes: [./backend:/app]
depends_on: [backend, orthanc, minio]
```

| | |
|---|---|
| **Rôle** | Conteneur **one-shot** : s'exécute au démarrage, fait son travail, puis s'arrête (`Exited (0)`). C'est **normal**. |
| **Image** | Réutilise celle du backend — mêmes dépendances, même code, aucune duplication. |

### Il fait deux choses, dans cet ordre

**① À CHAQUE démarrage — réconciliation des tuiles**
[`reconcilier_tuiles()`](../backend/seed_images.py#L200-L252)

```
Pour chaque Biopsy en base :
    le fichier .dzi existe-t-il sur disque ?
        oui  → rien à faire (simple accès disque, coût nul)
        non  → retrouver la lame source dans MinIO (storage.find_object_key)
               la télécharger dans un fichier temporaire
               régénérer la pyramide DZI
               effacer le temporaire
```

**Pourquoi c'est indispensable :** `dzi_data/` est dans le `.gitignore`. Un dépôt
fraîchement cloné, puis restauré depuis un dump SQL, aurait des lignes
`biopsies` en base et **aucune tuile sur disque** → viewer vide. Cette passe
reconstruit l'artefact manquant.

```
--- VERIFICATION DES TUILES ---
[>] tuiles manquantes pour William-30b14509/CMU-1.dzi
[+] tuiles regenerees : William-30b14509/CMU-1.dzi
[=] 1 pyramide(s) DZI regeneree(s)
```

**② UNIQUEMENT si la base est vide — injection initiale**

```python
existing = db.query(models.Patient).count()
if existing:
    print(f"Base deja peuplee ({existing} patient(s)) : injection ignoree.")
    return
```

Sur une base peuplée, il s'abstient — sinon chaque `docker compose up`
créerait des doublons et retuilerait des centaines de Mo.

Sources injectées :

```
backend/images_initiales/
├── biopsie/       → HE_example.tif                    (.svs, .tif, .tiff)
└── radiologie/    → 0002.DCM, Anonymized_*.dcm,       (.dcm)
                     image-00000.dcm
```

Pour chaque lame (`seed_slide`) : MinIO sous `{folder_id}/`, tuiles DZI, lignes
`Patient` + `Biopsy`. Le `folder_id` est le **nom de fichier sans extension** —
aucun patronyme n'est inventé.

Pour chaque DICOM (`seed_dicom`) : push vers Orthanc, lecture des tags, création
`Patient` + `RadiologyStudy`. L'identité vient des **métadonnées DICOM**
(`PatientID`, `PatientName`).

### L'attente active

`depends_on` sans `condition` n'attend pas la disponibilité. D'où
[`wait_for()`](../backend/seed_images.py#L48-L60) : 60 tentatives, 2 s
d'intervalle, sur PostgreSQL, MinIO et Orthanc. Si l'un manque après 2 minutes,
le seeder abandonne proprement plutôt que de planter.

> ⚠️ **Fragilité connue.** `wait_for("PostgreSQL", …)` teste seulement la
> *connexion*, pas l'existence des **tables**. Or celles-ci sont créées par
> Alembic au démarrage du *backend*. Sur une base neuve, le seeder peut lancer
> `db.query(models.Biopsy).all()` avant que les tables existent →
> `UndefinedTable`. Correctif : `docker compose up -d --force-recreate image_seeder`.

**Diagnostic**

```bash
docker logs p6_image_seeder
docker compose up -d --force-recreate image_seeder   # relancer la passe
```

---

## 8. Récapitulatif des ports

| Port hôte | Conteneur | Service | Qui l'utilise |
|---|---|---|---|
| `5173` | frontend | Vite dev server | Navigateur |
| `8002` | backend | FastAPI + `/dzi_data` | Navigateur, `curl` |
| `7000` | instanseg | API de segmentation | Backend (interne), debug |
| `8042` | orthanc | API REST / web PACS | Proxy Vite, debug |
| `4242` | orthanc | DICOM natif (DIMSE) | **personne** |
| `9000` | minio | API S3 | Backend (interne), debug |
| `9001` | minio | Console web | Navigateur |
| `5432` | postgres | PostgreSQL | Backend (interne), client SQL |
| `9091` | *(hors compose)* | **OLGA** — stack séparée | Navigateur |

---

## 9. OLGA — le huitième service, hors compose

**OLGA n'est pas dans le `docker-compose.yml` de Chiron.** Il vit dans sa propre
stack (`olga-designer-admin-backend`) :

```bash
docker pull kirito140/olga-backend:latest
docker compose up -d          # dans le dépôt OLGA
```

| | |
|---|---|
| **Rôle** | Fournit **uniquement** la définition des formulaires du workflow. |
| **Appelé par** | Le **navigateur** directement (`VITE_OLGA_API_URL`), jamais par le backend. |
| **Endpoint** | `GET /forms/getFromID/{formId}` |
| **Si absent** | L'application sert les instantanés JSON Schema versionnés, affiche un bandeau ambre, et **la saisie reste possible**. |

Deux particularités d'OLGA gérées côté client
([olgaClient.ts](../frontend/src/features/workflow/olga/olgaClient.ts)) :

1. Il sert du JSON avec un `Content-Type: text/plain` → le client parse le texte
   lui-même ;
2. Il renvoie ses erreurs applicatives en **HTTP 200** avec `{"error": "..."}` →
   le client vérifie la présence de cette clé.

---

## 10. Dépannage Docker

| Symptôme | Cause probable | Action |
|---|---|---|
| `port is already allocated` | Un service local occupe 5432/8042/9000 | Changer le mapping hôte |
| Backend `Exited (1)` au boot | Postgres pas encore prêt | `docker compose restart backend` |
| `/health` → 503 | Une dépendance est tombée | La réponse contient l'erreur exacte |
| Viewer biopsie vide | Tuiles manquantes | `docker compose up -d --force-recreate image_seeder` puis `docker logs -f p6_image_seeder` |
| Écran noir en radiologie | Étude absente d'Orthanc, ou id différent | Vérifier sur http://localhost:8042 |
| Bandeau « OLGA injoignable » | Stack OLGA non démarrée | Normal — les instantanés prennent le relais |
| Le seeder n'injecte rien | Base déjà peuplée | **Voulu.** La réconciliation des tuiles, elle, tourne quand même |
| Modification `.tsx` invisible | Polling / volume | `docker compose restart frontend` |
| Modification `.py` invisible | Pas de `--reload` | `docker compose restart backend` |
| Nouvelle dépendance npm absente | Volume anonyme `node_modules` | `docker compose build frontend` |
| InstanSeg `unhealthy` au début | Chargement PyTorch (~60 s) | Attendre le `start_period` |
| `p6_image_seeder` en `Exited (0)` | **Comportement normal** | C'est un one-shot |

```bash
# Repartir de zéro (⚠️ DÉTRUIT TOUTES LES DONNÉES)
docker compose down -v
docker compose up -d --build
```
