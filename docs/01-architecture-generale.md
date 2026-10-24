# 01 — Architecture générale

## 1. Vue d'ensemble

```
                          NAVIGATEUR
   ┌───────────────────────────────────────────────────────────┐
   │  React 19 · TypeScript · Vite 7 · Tailwind 4      :5173    │
   │                                                           │
   │   Dashboard ──── Viewer (biopsie)  ──── RadiologyViewer   │
   │                  OpenSeadragon           Cornerstone.js   │
   └──┬──────────────────┬─────────────────┬──────────────┬────┘
      │ REST (axios      │ tuiles DZI      │ WADO-URI     │ HTTP direct
      │  + fetch)        │ (HTTP statique) │ via proxy    │
      │                  │                 │ Vite         │
      ▼                  ▼                 ▼              ▼
   ┌──────────────────────────────────┐   ┌─────────┐  ┌──────────┐
   │ BACKEND FastAPI          :8002   │   │ Orthanc │  │  OLGA    │
   │ SQLAlchemy 2 · Pydantic 2        │   │  :8042  │  │  :9091   │
   │ Alembic (migrations au boot)     │   │  PACS   │  │ externe  │
   │                                  │   └─────────┘  └──────────┘
   │  main.py        workflow/        │        ▲
   │  (historique)   (structure cible)│        │
   └──┬────────┬─────────┬────────────┴────────┘
      │        │         │
      ▼        ▼         ▼
  ┌────────┐ ┌───────┐ ┌───────────┐   ┌──────────────────┐
  │Postgres│ │ MinIO │ │ dzi_data/ │   │ InstanSeg :7000  │
  │ :5432  │ │ :9000 │ │  (disque) │   │ PyTorch, CPU     │
  └────────┘ └───────┘ └───────────┘   └──────────────────┘
       ▲          ▲          ▲                   ▲
       └──────────┴──────────┴───────────────────┘
                image_seeder (one-shot au boot)
```

### Les deux chaînes d'imagerie

Le cœur de la conception : **deux formats de nature radicalement différente**,
donc deux chaînes techniques complètes, réunies par un seul dossier patient.

| | Radiologie | Biopsie (anatomopathologie) |
|---|---|---|
| Format source | `.dcm` (DICOM) | `.svs`, `.tif`, `.tiff` (WSI) |
| Taille typique | quelques Mo | **100 Mo à plusieurs Go** |
| Stockage | **Orthanc** (PACS, indexe par UID) | **MinIO** (stockage objet S3) |
| Transformation | aucune | **pyramide de tuiles DZI** (PyVips) |
| Service au navigateur | protocole **WADO-URI** via proxy Vite | fichiers statiques `/dzi_data` |
| Visionneuse | **Cornerstone.js** | **OpenSeadragon** |
| Annotations | `cornerstoneTools` sérialisées en JSON dans `radiology_studies.annotations` | calque SVG maison, table `drawings` |
| Compte rendu | texte libre + export PDF | workflow OLGA en 4 étapes |
| Table | `radiology_studies` | `biopsies` → `extractions` |

**Règle métier structurante :** un dossier patient ne porte **qu'une seule
lame** et **qu'un seul examen radiologique**. Le backend refuse le second import
avec un `409`. Voir [main.py:174](../backend/main.py#L174) et
[main.py:257](../backend/main.py#L257).

---

## 2. Pourquoi la lame ne peut pas être chargée directement

C'est la contrainte n° 1 du projet. Une lame WSI de 2 Go ne rentre ni dans la
mémoire d'un navigateur, ni dans une réponse HTTP raisonnable.

**Solution : la pyramide DZI (Deep Zoom Image).**

```
Lame source .svs  (100 000 × 80 000 px, 2 Go)
        │
        │  pyvips.Image.new_from_file(..., access="sequential")
        │       ↑ lecture EN FLUX : jamais tout en RAM
        │  .dzsave(chemin, tile_size=256, overlap=1, suffix=".jpg")
        ▼
CMU-1.dzi          ← manifeste XML : dimensions, taille de tuile, format
CMU-1_files/
  ├── 0/           ← niveau 0 : l'image entière en 1 tuile de 1×1 px
  ├── 1/           ← niveau 1 : 2×2 px
  ├── …
  └── 17/          ← niveau max : des dizaines de milliers de .jpg de 256 px
      ├── 0_0.jpg
      ├── 0_1.jpg
      └── …
```

OpenSeadragon lit le `.dzi`, calcule quelles tuiles couvrent la zone visible au
niveau de zoom courant, et ne télécharge que celles-là. Le navigateur ne voit
jamais plus de quelques centaines de Ko à la fois.

Code : [main.py:218-227](../backend/main.py#L218-L227) (import applicatif) et
[seed_images.py:189-197](../backend/seed_images.py#L189-L197) (injection).

> **`dzsave` attend un chemin SANS extension.** Il ajoute lui-même le `.dzi` et
> crée le dossier `_files`. Passer `foo.dzi` produirait `foo.dzi.dzi`.

---

## 3. Répartition des responsabilités

### Backend — deux zones distinctes

Le backend est **volontairement scindé en deux**, et c'est la première chose à
comprendre avant de toucher au code :

| Zone | Fichiers | Statut |
|---|---|---|
| **Code historique** | [`main.py`](../backend/main.py) (1 150 lignes) | Tout dans un fichier : routes, schémas Pydantic, helpers, logique métier. **Ne plus l'étendre.** |
| **Structure cible** | [`workflow/`](../backend/workflow/) | Découpage propre : `router.py` (HTTP) / `service.py` (métier) / `schemas.py` (contrats) / `constants.py` (données de référence). |

Convention explicite du projet (README racine, §Conventions) : *« Le nouveau
code va dans les modules dédiés (`backend/workflow/`, `frontend/src/features/`),
pas dans les fichiers historiques. »*

Le module `workflow` est branché dans l'app à
[main.py:70-72](../backend/main.py#L70-L72) :

```python
from workflow.router import router as workflow_router
app.include_router(workflow_router)
```

### Frontend — même dualité

| Zone | Dossiers | Statut |
|---|---|---|
| **Code historique** | `pages/`, `components/`, `services/api.ts` | Composants gros et peu découpés (`Viewer.tsx` = 1 732 lignes). |
| **Structure cible** | [`features/workflow/`](../frontend/src/features/workflow/) | Module autonome : registre d'étapes, hooks, client HTTP, frontière OLGA, composants, instantanés. |

---

## 4. Le moteur de workflow : le choix d'architecture central

### Le problème

Le compte rendu anatomopathologique suit **quatre étapes obligatoires et
ordonnées**. Les formulaires de ces étapes appartiennent à **OLGA**, un service
externe de l'écosystème. Question : qui détient la logique de progression ?

### La décision

| Ce qui vit chez **OLGA** | Ce qui vit chez **Chiron** |
|---|---|
| La **définition** des formulaires (champs, types, options) | L'**ordre** des étapes |
| | Les **règles de transition** |
| | La **validation** et son horodatage |
| | La **persistance** des données saisies |

**Justification :** les données de santé restent dans la base de
l'établissement et gardent leur lien au dossier patient. Une donnée médicale
n'est pas exportée vers un service tiers.

### Conséquence : la couche anti-corruption

Le format d'OLGA est propriétaire. Un seul fichier du dépôt le connaît :
[`olga/olgaAdapter.ts`](../frontend/src/features/workflow/olga/olgaAdapter.ts).
Il traduit chaque formulaire en **JSON Schema**, format standard que tout le
reste de l'application manipule.

```
OLGA  ──GET /forms/getFromID/{uuid}──▶  olgaClient.ts
                                             │
                                             ▼
                                       olgaAdapter.ts     ← SEUL fichier
                                    olgaToJsonSchema()      qui connaît OLGA
                                             │
                                             ▼
                                     WorkflowJsonSchema
                                             │
                        ┌────────────────────┴──────────────────┐
                        ▼                                       ▼
                 JsonSchemaForm.tsx                    schemas/*.json
                 (rendu générique)                     (instantanés versionnés)
```

**Si OLGA est indisponible**, l'application sert les instantanés JSON Schema
versionnés dans le dépôt, affiche un bandeau ambre, et **la saisie reste
possible**. Voir
[useOlgaForm.ts:60-74](../frontend/src/features/workflow/useOlgaForm.ts#L60-L74).

### La machine à états, côté serveur

Trois règles appliquées dans
[`workflow/service.py`](../backend/workflow/service.py) — le client **ne peut
pas** les contourner :

1. **Une étape ne peut être validée que si toutes les précédentes le sont.**
   `save_step()` compare `step_position(step)` à `max_reached_position(state)` ;
   au-delà → `WorkflowError("step_locked")` → HTTP **409**.
   [service.py:166-173](../backend/workflow/service.py#L166-L173)
2. **La progression avance d'un cran à la fois**, jamais de saut.
   [service.py:190-196](../backend/workflow/service.py#L190-L196)
3. **Chaque validation enregistre son auteur et son horodatage**
   (`validated_by`, `validated_at`).

Plus une commodité : `validate_step=false` enregistre un **brouillon** sans
franchir l'étape.

---

## 5. La double écriture des données de formulaire

C'est le point le plus subtil du backend. Quand une étape est enregistrée, la
donnée part **à deux endroits** :

```
PUT /extractions/12/workflow/steps/microscopie
  { "data": { "microObs": "…", "histoType": "canalaire", "sbrGrade": "2" } }
                            │
              ┌─────────────┴──────────────┐
              ▼                            ▼
  workflow_step_states.data       extractions.micro_obs
  (JSONB — intégralité)           extractions.histo_type
                                  extractions.sbr_grade
                                  (colonnes historiques)
```

- **`workflow_step_states.data`** garde la **saisie complète**, y compris un
  champ qu'OLGA ajouterait sans colonne correspondante en base. Rien n'est
  perdu.
- **Les colonnes de `extractions`** sont alimentées par
  [`_mirror_to_columns()`](../backend/workflow/service.py#L125-L136), selon la
  table de projection
  [`FIELD_TO_COLUMN`](../backend/workflow/constants.py#L69-L94). Elles
  maintiennent le contrat des consommateurs existants :
  `GET /extractions/{id}/details`, la carte patient, le viewer.

La correspondance inverse (`column_to_field`) sert à **reconstruire** l'état du
workflow pour les extractions créées avant l'existence du moteur — voir
[`get_or_create_state()`](../backend/workflow/service.py#L57-L104).

---

## 6. Suivre une requête de bout en bout

### Exemple : « lancer l'analyse IA sur une région »

```
1. Viewer.tsx  handleAiAnalysis()                    [frontend/src/pages/Viewer.tsx:282]
   ├─ calcule la boîte englobante de la forme sélectionnée (getShapeBounds)
   ├─ REFUSE côté client si > 1500 × 1500 px
   └─ POST http://localhost:8002/analyze-ai
        { x, y, width, height, patient_folder, patient_name,
          annotation_label, extraction_id }

2. FastAPI  analyze_image_with_ai()                  [backend/main.py:547]
   ├─ résout le patient par folder_id
   ├─ download_biopsy_source()  ── MinIO ──▶ fichier temporaire
   │     essaie plusieurs emplacements (storage.candidate_object_keys)
   ├─ run_in_threadpool(_borner_region)   ← PyVips, hors boucle d'événements
   ├─ REFUSE de nouveau si > 1500 × 1500 px  (garde-fou serveur)
   ├─ run_in_threadpool(_extraire_png)    ← découpe + encodage PNG
   │
   ├─ instanseg_client.segment(...)       ──HTTP──▶ InstanSeg :7000 /segment
   │     ← instances : id, area_px, centroid, bbox
   ├─ instanseg_client.segment_points(...) ──HTTP──▶ InstanSeg /segment/points
   │     ← contours (polygones), un par noyau
   │
   ├─ calcule densité, taille moyenne, pléomorphisme (numpy)
   └─ renvoie { suggestion, cell_count, contour_points }

3. Viewer.tsx  retour
   ├─ setAiSuggestion(data.suggestion)      → panneau latéral
   └─ retranslate chaque point : p.x + cropX, p.y + cropY
        (InstanSeg travaille dans le repère du PATCH, pas de la lame)
      setAiContours(contours)               → renderAiPoints() les dessine
```

Le point à retenir : **la retranslation des coordonnées**. InstanSeg reçoit un
patch découpé et raisonne dans son repère local ; il faut rajouter l'origine du
crop pour replacer les contours sur la lame. Voir
[Viewer.tsx:341-353](../frontend/src/pages/Viewer.tsx#L341-L353).

### Exemple : « ouvrir une extraction »

Attention, c'est contre-intuitif :

```
PatientCard.tsx  openViewer(extraction)
  └─ navigate('/viewer?url=<image_url de la LAME>', {
         state: { roi: extraction.roi, extractionId: extraction.id, … } })

Viewer.tsx
  ├─ charge la LAME COMPLÈTE dans OpenSeadragon
  ├─ viewer.viewport.fitBounds(roiRect)   ← zoome sur la région
  ├─ borne le zoom et le déplacement à cette région (minZoomLevel/maxZoomLevel)
  └─ isAnnotationMode = true  →  affiche le workflow OLGA
```

**Le fichier TIFF pyramidal produit par `/extract-roi` n'est jamais affiché.**
Il est généré, poussé dans MinIO, puis effacé du disque
([main.py:740-741](../backend/main.py#L740-L741)). Le champ `url` renvoyé par
`GET /patients/{folder_id}/extractions` pointe vers `/dzi_data/...` où plus
aucun fichier n'existe — il est simplement inutilisé par le frontend. Voir
[09 — Pièges](09-pieges-et-bugs.md#lextraction-tiff-est-produite-mais-jamais-affichée).

---

## 7. Les frontières réseau

| Depuis | Vers | Adresse utilisée | Résolue par |
|---|---|---|---|
| Navigateur | Backend | `http://localhost:8002` (`VITE_API_URL`) | l'OS de l'hôte |
| Navigateur | OLGA | `http://localhost:9091` (`VITE_OLGA_API_URL`) | l'OS de l'hôte |
| Navigateur | Orthanc | `/orthanc/...` | **proxy Vite** → `http://p6_orthanc:8042` |
| Navigateur | Tuiles DZI | `http://localhost:8002/dzi_data/...` | l'OS de l'hôte |
| Backend | Postgres | `p6_postgres:5432` | DNS Docker |
| Backend | MinIO | `minio:9000` | alias réseau Docker |
| Backend | Orthanc | `orthanc:8042` | DNS Docker |
| Backend | InstanSeg | `instanseg:7000` | DNS Docker |

> **Le piège classique.** `VITE_*` est résolu par le **navigateur**, pas par le
> conteneur : d'où `localhost` et non un nom de service Docker. Le
> `docker-compose.yml` le commente explicitement
> ([lignes 100-103](../docker-compose.yml#L100-L103)).

Le **proxy Vite** vers Orthanc existe pour deux raisons : contourner le CORS, et
éviter d'exposer les identifiants Orthanc dans le navigateur. Configuration :
[vite.config.ts:13-20](../frontend/vite.config.ts#L13-L20).

---

## 8. Décisions structurantes et leur justification

| Décision | Raison | Preuve dans le code |
|---|---|---|
| Le moteur d'étapes vit chez Chiron, pas chez OLGA | Les données de santé restent dans la base de l'établissement | [`workflow/service.py`](../backend/workflow/service.py) |
| OLGA ne fournit que la définition des formulaires | Format propriétaire isolé dans une couche anti-corruption unique | [`olgaAdapter.ts`](../frontend/src/features/workflow/olga/olgaAdapter.ts) |
| Le workflow occupe 2 tables dédiées | JSONB par étape : un champ ajouté côté OLGA est conservé même sans colonne | [models.py:108-176](../backend/models.py#L108-L176) |
| InstanSeg est un service séparé | Évite d'embarquer PyTorch dans l'API métier — image backend 15 Go → 1,7 Go | [`instanseg/`](../instanseg/) + [requirements.txt:14-17](../backend/requirements.txt#L14-L17) |
| Alembic remplace `create_all` | `create_all` crée les tables absentes mais **n'ajoute jamais de colonne** | [main.py:29-42](../backend/main.py#L29-L42) |
| Le travail lourd passe par `run_in_threadpool` | PyVips et MinIO sont synchrones : sur la boucle d'événements ils gelaient toute l'API | [main.py:209](../backend/main.py#L209), [218](../backend/main.py#L218), [555](../backend/main.py#L555) |
| Suppression de tuiles : renommer puis effacer en tâche de fond | Un dossier de tuiles = des dizaines de milliers de fichiers ; l'effacer prend ~1 min | [main.py:1040-1066](../backend/main.py#L1040-L1066) |
| Confirmations par modale applicative, pas `window.confirm` | Le dialogue natif est désactivable par l'utilisateur → suppressions silencieusement inopérantes | [PatientCard.tsx:152-170](../frontend/src/components/PatientCard.tsx#L152-L170) |

---

## 9. Principes de code du projet (à respecter)

Extraits du README racine, §Conventions — ce sont les règles que la relecture
applique :

1. **Configuration par l'environnement.** Les valeurs en dur ne servent que de
   repli hors conteneur. `DATABASE_URL`, `VITE_API_URL`, `VITE_OLGA_API_URL`
   priment.
2. **Aucune donnée inventée.** Une valeur absente affiche « non renseigné »,
   jamais une valeur plausible générée. *Sur un dossier patient, une donnée
   fabriquée est indiscernable d'une donnée réelle.*
3. **Les erreurs se voient.** Pas de `catch` vide, pas de message générique : le
   détail renvoyé par le serveur est affiché à l'utilisateur.
4. **Le nouveau code va dans les modules dédiés**, pas dans les fichiers
   historiques.

> Le point 3 n'est **pas** respecté partout : `RadiologyViewer.tsx` avale
> plusieurs erreurs dans des `console.error` sans retour utilisateur. Voir
> [09 — Pièges](09-pieges-et-bugs.md).
