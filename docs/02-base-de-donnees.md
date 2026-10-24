# 02 — Base de données

**SGBD :** PostgreSQL 15 (conteneur `p6_postgres`, port `5432`)
**ORM :** SQLAlchemy 2.0.49 — modèles dans [`backend/models.py`](../backend/models.py)
**Migrations :** Alembic 1.16.5 — [`backend/alembic/`](../backend/alembic/)
**Connexion :** [`backend/database.py`](../backend/database.py)

| Paramètre | Valeur (docker-compose) |
|---|---|
| Base | `p6_db` |
| Utilisateur | `user` |
| Mot de passe | `password` |
| URL complète | `postgresql://user:password@p6_postgres:5432/p6_db` |
| Volume | `postgres_data:/var/lib/postgresql/data` |

---

## 1. Schéma relationnel complet

```
┌───────────────────────────────────────────┐
│ patients                                  │
│───────────────────────────────────────────│
│ PK  id                 INTEGER            │
│     name               VARCHAR            │
│     age                INTEGER            │
│     folder_id          VARCHAR   ◄─── clé fonctionnelle (non unique en base !)
│     birth_date         VARCHAR            │
│     family_history     VARCHAR            │
│     medical_history    TEXT               │
└─────┬─────────────┬──────────────┬────────┘
      │ 1..n        │ 1..n         │ 1..n
      │             │              │
      ▼             ▼              ▼
┌──────────────┐ ┌────────────────────┐ ┌──────────────────────────────┐
│ biopsies     │ │ radiology_studies  │ │ extractions                  │
│──────────────│ │────────────────────│ │──────────────────────────────│
│PK id         │ │PK id               │ │PK id                         │
│FK patient_id │ │FK patient_id       │ │FK patient_id                 │
│   image_url  │ │   orthanc_study_id │ │   label                      │
│   status     │ │   modality         │ │   dzi_url                    │
└──────────────┘ │   description      │ │   x, y, w, h      INTEGER    │
                 │   date             │ │   created_at      TIMESTAMP  │
                 │   report      TEXT │ │   owner                      │
                 │   annotations TEXT │ │  ── formulaire à plat ──     │
                 └────────────────────┘ │   prelevement_type           │
                                        │   prelevement_date           │
                                        │   block_number               │
                                        │   fixation                   │
                                        │   slide_count     INTEGER    │
                                        │   staining        JSON       │
                                        │   macro_obs       TEXT       │
                                        │   micro_obs       TEXT       │
                                        │   histo_type                 │
                                        │   sbr_grade                  │
                                        │   margins                    │
                                        │   hormonal_receptors         │
                                        │   diagnosis                  │
                                        │   comments        TEXT       │
                                        │   status                     │
                                        │   pathologist                │
                                        │   validation_date            │
                                        └───┬──────────────────┬───────┘
                                            │ 1..n             │ 1..1
                                            ▼                  ▼
                            ┌───────────────────────┐ ┌────────────────────────┐
                            │ drawings              │ │ workflow_states        │
                            │───────────────────────│ │────────────────────────│
                            │PK id                  │ │PK id                   │
                            │FK extraction_id       │ │FK extraction_id UNIQUE │
                            │   type    VARCHAR     │ │   current_step  NOT NULL│
                            │   x, y    FLOAT       │ │   completed_at         │
                            │   w, h    FLOAT       │ │   created_at    NOT NULL│
                            │   radius  FLOAT       │ │   updated_at    NOT NULL│
                            │   text    VARCHAR     │ └───────────┬────────────┘
                            │   points  JSON        │             │ 1..n
                            │   author  VARCHAR     │             ▼
                            └───────────────────────┘ ┌────────────────────────────┐
                                                      │ workflow_step_states       │
                                                      │────────────────────────────│
                                                      │PK id                       │
                                                      │FK workflow_state_id NOT NULL│
                                                      │   step         NOT NULL    │
                                                      │   position     NOT NULL    │
                                                      │   data    JSON NOT NULL    │
                                                      │   validated_at             │
                                                      │   validated_by             │
                                                      │   updated_at   NOT NULL    │
                                                      │ UNIQUE(workflow_state_id,  │
                                                      │        step)               │
                                                      └────────────────────────────┘
```

**Huitième table :** `alembic_version` (une seule colonne `version_num`),
gérée automatiquement par Alembic.

---

## 2. Description table par table

### `patients` — le dossier patient

| Colonne | Type SQL | Null | Description |
|---|---|---|---|
| `id` | `INTEGER` | non (PK) | Identifiant technique auto-incrémenté. Indexé. |
| `name` | `VARCHAR` | oui | Nom complet du patient. |
| `age` | `INTEGER` | oui | Âge en années. Le seeder met `0` faute de mieux. |
| `folder_id` | `VARCHAR` | oui | **Identifiant fonctionnel du dossier**, utilisé partout dans l'application et comme préfixe de clé MinIO / nom de dossier de tuiles. |
| `birth_date` | `VARCHAR` | oui | Date de naissance. **Stockée en chaîne**, pas en `DATE`. |
| `family_history` | `VARCHAR` | oui | Antécédents familiaux. |
| `medical_history` | `TEXT` | oui | Historique médical / antécédents personnels. |

**Le `folder_id` mérite un paragraphe.** Il est construit à la création :

```python
folder_id = f"{safe_folder_name(payload.name)}-{uuid.uuid4().hex[:8]}"
# ex. "William-30b14509"
```
[main.py:146](../backend/main.py#L146)

Le `safe_folder_name` ne garde que lettres/chiffres/`-`/`_`/espace, puis
remplace les espaces par `-`. Ce même identifiant devient :

- le préfixe des objets MinIO : `William-30b14509/CMU-1.svs` ;
- le dossier des tuiles : `dzi_data/William-30b14509/CMU-1_files/` ;
- la clé de rapprochement du seeder (idempotence).

> ⚠️ **`folder_id` n'a pas de contrainte `UNIQUE` en base.** L'unicité repose
> uniquement sur l'UUID tiré à la création. Le seeder l'utilise comme clé de
> rapprochement (`get_or_create_patient`) — un doublon casserait cette logique.

Le seeder crée aussi des patients depuis les **métadonnées DICOM** :
`folder_id = PatientID` du DICOM, ou `DICOM-{study_id[:8]}` si le `PatientID`
est vide ou réduit à un caractère
([seed_images.py:171-173](../backend/seed_images.py#L171-L173)).

---

### `biopsies` — la lame numérisée

| Colonne | Type | Description |
|---|---|---|
| `id` | `INTEGER` PK | Indexé. |
| `patient_id` | `INTEGER` FK → `patients.id` | |
| `image_url` | `VARCHAR` | **Chemin relatif du fichier `.dzi`**, ex. `William-30b14509/CMU-1.dzi`. Résolu par le frontend en `${VITE_API_URL}/dzi_data/{image_url}`. |
| `status` | `VARCHAR` | Statut libre. Seule valeur écrite par le code : `"Non analysé"` ([main.py:232](../backend/main.py#L232), [seed_images.py:118](../backend/seed_images.py#L118)). |

> **`image_url` désigne le DZI, pas l'objet MinIO.** Les deux noms peuvent
> diverger (les lames de démonstration sont tuilées sous d'autres noms). C'est
> précisément la raison d'être de
> [`storage.candidate_object_keys()`](../backend/storage.py#L31-L61), qui essaie
> les emplacements du plus précis au plus large.

> **`status` n'est jamais mis à jour.** Le `Dashboard` compte les analyses
> terminées en testant `status === "termine" | "archive" | "Validé"`
> ([Dashboard.tsx:87](../frontend/src/pages/Dashboard.tsx#L87)) — aucune de ces
> valeurs n'est jamais écrite. Les statistiques restent donc à zéro. Voir
> [09 — Pièges](09-pieges-et-bugs.md).

---

### `radiology_studies` — l'étude DICOM

| Colonne | Type | Description |
|---|---|---|
| `id` | `INTEGER` PK | Indexé. |
| `patient_id` | `INTEGER` FK → `patients.id` | |
| `orthanc_study_id` | `VARCHAR` | **Identifiant de l'étude dans Orthanc.** C'est la clé de jointure avec le PACS, et la clé de recherche des routes `/radiology/{study_id}/report`. |
| `modality` | `VARCHAR` | Modalité DICOM (`CT`, `MR`, `CR`, `US`, `OT`…). Lue **au niveau de la série**. Valeur de repli : `"Inconnue"` (API) ou `"OT"` (seeder). |
| `description` | `VARCHAR` | Tag DICOM `StudyDescription`. Repli : le nom du fichier. |
| `date` | `VARCHAR` | Tag DICOM `StudyDate`, format brut `YYYYMMDD`. |
| `report` | `TEXT` | Compte rendu radiologique, texte libre. |
| `annotations` | `TEXT` | **État sérialisé de `cornerstoneTools`**, `JSON.stringify` du `globalImageIdSpecificToolStateManager.toolState`. Chaîne `"{}"` quand vide. |

**Où lire chaque métadonnée dans Orthanc** — c'est la difficulté n° 1 du module
radiologie, documentée sur la diapositive 10 :

| Donnée | Niveau Orthanc | Endpoint |
|---|---|---|
| `ParentStudy` | **réponse du POST** `/instances` uniquement | pas dans `GET /instances/{id}` |
| `StudyDescription`, `StudyDate` | étude | `GET /studies/{id}` → `MainDicomTags` |
| `Modality` | **série** | `GET /series/{id}` → `MainDicomTags` |
| `PatientID`, `PatientName` | étude | `GET /studies/{id}` → `PatientMainDicomTags` |

Code : [main.py:289-325](../backend/main.py#L289-L325).

> **Contrainte métier :** `orthanc_study_id` sert de garde-fou anti-doublon.
> Orthanc dédoublonne par UID DICOM ; réimporter le même fichier renvoie
> l'étude déjà indexée. Le backend vérifie donc si une ligne existe déjà et
> refuse avec un `409` en nommant le dossier propriétaire
> ([main.py:327-350](../backend/main.py#L327-L350)).

---

### `extractions` — la région d'intérêt et son compte rendu

C'est la table centrale de l'anatomopathologie. Elle porte **trois natures de
données** :

**a) Géométrie de la région**

| Colonne | Type | Description |
|---|---|---|
| `label` | `VARCHAR` | Nom donné par le praticien (« Extraction » par défaut). |
| `dzi_url` | `VARCHAR` | Chemin de l'extraction : `{folder}/extractions/extraction_{timestamp}.svs`. **Objet MinIO**, pas fichier disque. |
| `x`, `y`, `w`, `h` | `INTEGER` | ROI en **coordonnées pixel de la lame source**. Sert à `fitBounds` à la réouverture. |
| `created_at` | `TIMESTAMP` | `datetime.utcnow` par défaut. |
| `owner` | `VARCHAR` | Créateur — vient du `localStorage`, donc **non authentifié**. Contrôle la suppression (`403` si `owner != username`). |

**b) Le formulaire médical, à plat (une colonne par champ)**

| Colonne | Type | Étape | Champ OLGA correspondant |
|---|---|---|---|
| `prelevement_type` | `VARCHAR` | 1 Prélèvement | `prelevementType` |
| `prelevement_date` | `VARCHAR` | 1 | `prelevementDate` |
| `block_number` | `VARCHAR` | 1 | `blockNumber` |
| `fixation` | `VARCHAR` | 1 | `fixation` |
| `slide_count` | `INTEGER` | 2 Préparation | `slideCount` |
| `staining` | `JSON` | 2 | `staining` |
| `macro_obs` | `TEXT` | 2 | `macroObs` |
| `micro_obs` | `TEXT` | 3 Microscopie | `microObs` |
| `histo_type` | `VARCHAR` | 3 | `histoType` |
| `sbr_grade` | `VARCHAR` | 3 | `sbrGrade` |
| `margins` | `VARCHAR` | 3 | `margins` |
| `hormonal_receptors` | `VARCHAR` | 4 Diagnostic | `hormonalReceptors` |
| `diagnosis` | `VARCHAR` | 4 | `diagnosis` |
| `comments` | `TEXT` | 4 | `comments` |
| `pathologist` | `VARCHAR` | 4 | `pathologist` |
| `validation_date` | `VARCHAR` | 4 | `validationDate` |

Cette table de correspondance est encodée une seule fois, dans
[`workflow/constants.py:69-94`](../backend/workflow/constants.py#L69-L94) —
**c'est la source de vérité**. Chaque entrée porte aussi un convertisseur :

| Convertisseur | Rôle |
|---|---|
| `_to_str` | `None` → `""` ; une liste devient `"a, b"` |
| `_to_str_or_none` | `""` → `NULL` (colonnes de date) |
| `_to_int` | texte → entier, `""`/illisible → `NULL` |
| `_to_list` | scalaire → liste à un élément (colonne `staining` en JSON) |

> **Le cas `staining` est instructif.** La colonne est `JSON` (une liste), mais
> le formulaire OLGA la déclare en `select` simple (une chaîne). `_to_list`
> emballe côté écriture ; `coerceToSchema` déballe côté lecture
> ([olgaAdapter.ts:196-214](../frontend/src/features/workflow/olga/olgaAdapter.ts#L196-L214)).
> L'aller-retour fonctionne — mais si vous passez `staining` en `multiselect`
> côté OLGA, tout continue de marcher sans changer une ligne de backend. C'est
> exactement l'intérêt du dispositif.

**c) Statut de validation (colonnes historiques)**

| Colonne | Description |
|---|---|
| `status` | `"en_analyse"` écrit par le Viewer ([Viewer.tsx:1183](../frontend/src/pages/Viewer.tsx#L1183)). |
| `pathologist` | Pathologiste référent — aussi un champ du formulaire étape 4. |
| `validation_date` | Date de validation — aussi un champ du formulaire étape 4. |

> Ces trois colonnes **font doublon** avec `workflow_step_states.validated_by` /
> `validated_at`, plus fiables. Elles sont conservées pour compatibilité.

---

### `drawings` — les annotations géométriques

| Colonne | Type | Description |
|---|---|---|
| `id` | `INTEGER` PK | |
| `extraction_id` | `INTEGER` FK → `extractions.id` | Cascade ORM `all, delete`. |
| `type` | `VARCHAR` | `'rect'`, `'circle'`, `'polygon'`, `'text'` |
| `x`, `y` | `FLOAT` | Ancre, en **coordonnées image** de la lame. |
| `w`, `h` | `FLOAT` | Largeur/hauteur pour un rectangle. **Pour un `text`, ce sont les coordonnées de l'étiquette déplacée** — surcharge de sens. |
| `radius` | `FLOAT` | Rayon d'un cercle. |
| `text` | `VARCHAR` | Libellé attaché. |
| `points` | `JSON` | Sommets d'un polygone : `[{x, y}, …]`. |
| `author` | `VARCHAR` | Auteur du tracé. Pilote la couleur : **vert `#10b981` si c'est moi, orange `#f59e0b` sinon** ([Viewer.tsx:763-767](../frontend/src/pages/Viewer.tsx#L763-L767)). |

> ⚠️ **Ces colonnes portent des sens différents selon `type`.** Pour un `text`,
> `(x, y)` est le point d'ancrage et `(w, h)` la position du libellé. Pour un
> `rect`, `(w, h)` est une dimension. Cette surcharge est une dette assumée.

**Stratégie d'écriture :** `POST /annotations/save` **efface toutes les
`drawings` de l'extraction puis les réinsère**
([main.py:825-839](../backend/main.py#L825-L839)). Les `id` changent donc à
chaque sauvegarde. Il n'y a pas de mise à jour incrémentale.

---

### `workflow_states` — l'avancement d'une extraction

| Colonne | Type | Null | Description |
|---|---|---|---|
| `id` | `INTEGER` PK | non | |
| `extraction_id` | `INTEGER` FK | **non** | **UNIQUE + indexé.** `ondelete="CASCADE"` en base. Relation `uselist=False` → un état par extraction. |
| `current_step` | `VARCHAR` | **non** | `"prelevement"` \| `"preparation"` \| `"microscopie"` \| `"diagnostic"`. |
| `completed_at` | `TIMESTAMP` | oui | Renseigné quand la **dernière** étape est validée. `is_complete = completed_at is not None`. |
| `created_at` | `TIMESTAMP` | non | |
| `updated_at` | `TIMESTAMP` | non | `onupdate=datetime.utcnow`. |

Créée **paresseusement** : `get_or_create_state()` la fabrique au premier
`GET /extractions/{id}/workflow`.

---

### `workflow_step_states` — les données d'une étape

| Colonne | Type | Null | Description |
|---|---|---|---|
| `id` | `INTEGER` PK | non | |
| `workflow_state_id` | `INTEGER` FK | **non** | Indexé, `ondelete="CASCADE"`. |
| `step` | `VARCHAR` | **non** | Identifiant d'étape. |
| `position` | `INTEGER` | **non** | Rang **1-based** (1 à 4). Ordonne la relation. |
| `data` | `JSON` | **non** | **Intégralité du formulaire saisi**, clés OLGA en camelCase. Défaut `{}`. |
| `validated_at` | `TIMESTAMP` | oui | `NULL` = non validée. C'est le seul marqueur de validation. |
| `validated_by` | `VARCHAR` | oui | Auteur de la validation. Repli : `extraction.owner`. |
| `updated_at` | `TIMESTAMP` | non | |

**Contrainte :** `UNIQUE(workflow_state_id, step)` — nommée `uq_workflow_step`.
Une étape ne peut exister qu'une fois par workflow.

Les 4 lignes sont créées **d'un coup** par `get_or_create_state()`, pas au fil
de l'eau.

---

## 3. Le cycle de vie du workflow, en base

### Création (premier `GET .../workflow`)

`get_or_create_state()` [service.py:57-104](../backend/workflow/service.py#L57-L104)
fait de la **reprise sur l'existant** :

```python
for index, step in enumerate(STEP_IDS):
    data = _legacy_data(extraction, step)   # relit les colonnes historiques
    has_data = any(_is_filled(v) for v in data.values())
    validated = still_consecutive and has_data
    if validated: validated_count += 1
    else:         still_consecutive = False   # on s'arrête au premier trou
```

Traduction : **une extraction créée avant l'existence du moteur** est
reconstituée depuis ses colonnes. Une étape est réputée validée si elle porte au
moins une valeur, **en s'arrêtant à la première étape vide**. `current_step`
devient donc la première étape non renseignée.

### Progression

```
état initial            current_step = "prelevement"
                        max_reached_position = 1

PUT .../steps/prelevement  {validate_step: true}
  ├─ position(1) <= reachable(1)     ✅
  ├─ target.validated_at = now()
  ├─ current_step = STEP_IDS[1] = "preparation"
  ├─ completed_at = None
  └─ _mirror_to_columns() → extractions.prelevement_type, …

PUT .../steps/microscopie  {validate_step: true}   ← saut tenté
  ├─ position(3) > reachable(2)      ❌
  └─ WorkflowError("step_locked")  →  HTTP 409
```

`max_reached_position()` [service.py:114-122](../backend/workflow/service.py#L114-L122)
compte les positions validées **consécutives** depuis 1, puis retourne
`min(consécutives + 1, 4)`.

### Achèvement

Quand la 4ᵉ étape est validée : `current_step = "diagnostic"` et
`completed_at = now()`. Revalider une étape antérieure remet `completed_at` à
`None` ([service.py:193](../backend/workflow/service.py#L193)).

---

## 4. Cascades de suppression

Attention : **deux mécanismes coexistent**, et ils ne couvrent pas la même chose.

| Relation | Cascade | Portée |
|---|---|---|
| `Patient.biopsies` | `cascade="all, delete"` | **ORM seulement** |
| `Patient.extractions` | `cascade="all, delete"` | ORM seulement |
| `Patient.radiology_studies` | `cascade="all, delete"` | ORM seulement |
| `Extraction.drawings` | `cascade="all, delete"` | ORM seulement |
| `Extraction.workflow` | `cascade="all, delete-orphan"` | ORM seulement |
| `workflow_states.extraction_id` | `ondelete="CASCADE"` | **base de données** |
| `workflow_step_states.workflow_state_id` | `ondelete="CASCADE"` | **base de données** |

Les cascades ORM ne s'appliquent que si la suppression passe par
`db.delete(objet)` avec les relations chargées. Un `DELETE FROM patients` en SQL
brut **laisserait des orphelins** dans `biopsies`, `radiology_studies`,
`extractions`, `drawings` — car ces FK n'ont pas de `ON DELETE` en base.

Seules les deux tables du workflow sont protégées au niveau SQL.

**Ce que `DELETE /patients/{id}` supprime réellement**
([main.py:945-1017](../backend/main.py#L945-L1017)) :

| Ressource | Supprimée ? |
|---|---|
| Objets MinIO sous `{folder}/` | ✅ |
| Tuiles DZI du patient | ✅ (renommées puis effacées en tâche de fond) |
| Lignes `patients`, `biopsies`, `extractions`, `drawings`, `workflow_*` | ✅ (cascade ORM) |
| **Études DICOM dans Orthanc** | ❌ **conservées volontairement** |
| Objets MinIO à la racine du bucket (seeder) | ❌ conservés |

---

## 5. Migrations Alembic

### Fonctionnement

Les migrations sont **appliquées automatiquement au démarrage du backend**, pas
par une commande manuelle :

```python
# backend/main.py:45-51 — s'exécute à l'import du module
try:
    apply_migrations()          # équivaut à `alembic upgrade head`
    print("✅ Schéma de base à jour (Alembic).")
except Exception as e:
    print(f"❌ ÉCHEC DES MIGRATIONS : {e}")
```

L'application **démarre malgré l'échec**, pour que `/health` puisse rapporter
l'incident plutôt que de mourir en silence.

### La source de l'URL

`alembic.ini` contient une URL bidon (`driver://user:pass@localhost/dbname`).
Elle est **ignorée** : [`alembic/env.py:29-35`](../backend/alembic/env.py#L29-L35)
la remplace par celle de l'application.

```python
def get_url() -> str:
    return os.getenv("ALEMBIC_URL") or database.SQLALCHEMY_DATABASE_URL
```

Une seule source de vérité → aucun risque de migrer une base différente de celle
que le backend utilise. `ALEMBIC_URL` permet de viser une base jetable pour
tester une révision.

`compare_type=True` est activé : les changements de **type** de colonne sont
détectés, pas seulement les ajouts/suppressions.

### Créer une migration

```bash
# 1. Modifier backend/models.py
# 2. Générer la révision
docker exec p6_backend sh -c 'cd /app && alembic revision --autogenerate -m "ajout colonne x"'
# 3. RELIRE le fichier généré dans backend/alembic/versions/ — l'autogenerate
#    se trompe régulièrement sur les renommages et les types serveur
# 4. Appliquer
docker compose restart backend
# 5. Vérifier
docker exec p6_backend sh -c 'cd /app && alembic current'
docker exec p6_backend sh -c 'cd /app && alembic history'
```

### Pourquoi Alembic et pas `create_all`

Commentaire du code, à conserver en tête :

> `create_all` crée les tables absentes mais **n'ajoute jamais de colonne** à une
> table existante : toute évolution du modèle cassait silencieusement les bases
> déjà déployées.

L'unique révision actuelle est
[`719b309ce4d3_schema_initial.py`](../backend/alembic/versions/719b309ce4d3_schema_initial.py)
(`down_revision = None`).

---

## 6. Requêtes utiles

```bash
# Ouvrir un psql
docker exec -it p6_postgres psql -U user -d p6_db
```

```sql
-- Vue d'ensemble d'un dossier
SELECT p.id, p.name, p.folder_id,
       COUNT(DISTINCT b.id)  AS lames,
       COUNT(DISTINCT r.id)  AS etudes_dicom,
       COUNT(DISTINCT e.id)  AS extractions
FROM patients p
LEFT JOIN biopsies b           ON b.patient_id = p.id
LEFT JOIN radiology_studies r  ON r.patient_id = p.id
LEFT JOIN extractions e        ON e.patient_id = p.id
GROUP BY p.id ORDER BY p.id;

-- Avancement de tous les workflows
SELECT e.id, e.label, ws.current_step, ws.completed_at,
       COUNT(*) FILTER (WHERE wss.validated_at IS NOT NULL) AS etapes_validees
FROM extractions e
JOIN workflow_states ws       ON ws.extraction_id = e.id
JOIN workflow_step_states wss ON wss.workflow_state_id = ws.id
GROUP BY e.id, e.label, ws.current_step, ws.completed_at;

-- Contenu JSONB d'une étape
SELECT step, position, data, validated_at, validated_by
FROM workflow_step_states wss
JOIN workflow_states ws ON ws.id = wss.workflow_state_id
WHERE ws.extraction_id = 1
ORDER BY position;

-- Détecter les orphelins (cascades ORM contournées)
SELECT 'biopsies' AS t, COUNT(*) FROM biopsies b
  WHERE NOT EXISTS (SELECT 1 FROM patients p WHERE p.id = b.patient_id)
UNION ALL
SELECT 'drawings', COUNT(*) FROM drawings d
  WHERE NOT EXISTS (SELECT 1 FROM extractions e WHERE e.id = d.extraction_id);

-- Version de schéma appliquée
SELECT * FROM alembic_version;
```

---

## 7. Ce qui manque au schéma (dette identifiée)

| Manque | Conséquence |
|---|---|
| `UNIQUE` sur `patients.folder_id` | Deux dossiers homonymes casseraient la résolution MinIO et le seeder |
| `UNIQUE` sur `radiology_studies.orthanc_study_id` | Le garde-fou anti-doublon est purement applicatif |
| `ON DELETE` sur les FK de `biopsies`, `extractions`, `radiology_studies`, `drawings` | Suppression SQL directe → orphelins |
| `NOT NULL` sur `patients.name`, `biopsies.image_url` | Des lignes vides sont acceptées |
| Type `DATE` pour `birth_date`, `prelevement_date`, `validation_date` | Aucun tri ni comparaison possible en SQL ; tout est `VARCHAR` |
| Index sur `patients.folder_id` et `radiology_studies.orthanc_study_id` | Ce sont pourtant les colonnes les plus filtrées |
| Une table `users` | L'auteur (`owner`, `author`, `validated_by`) est une chaîne libre non vérifiée |
