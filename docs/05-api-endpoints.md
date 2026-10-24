# 05 — Endpoints d'API (référence exhaustive)

**Base URL :** `http://localhost:8002`
**Documentation interactive :** http://localhost:8002/docs (Swagger) et `/redoc`
**Authentification :** aucune. Aucun en-tête n'est requis, aucun n'est vérifié.

> **Décompte réel : 20 routes backend** + 1 point de montage statique.
> (La présentation annonce 18 — le décompte du code fait foi.)

---

## Table des matières

| # | Méthode | Route | Section |
|---|---|---|---|
| 1 | `GET` | `/health` | [Système](#système) |
| 2 | `GET` | `/dzi_data/{chemin}` | [Système](#système) |
| 3 | `GET` | `/patients` | [Patients](#patients) |
| 4 | `POST` | `/patients` | [Patients](#patients) |
| 5 | `DELETE` | `/patients/{patient_id}` | [Patients](#patients) |
| 6 | `POST` | `/patients/{patient_id}/upload-biopsy` | [Imagerie](#imagerie) |
| 7 | `POST` | `/patients/{patient_id}/upload-radiology` | [Imagerie](#imagerie) |
| 8 | `DELETE` | `/biopsies/{biopsy_id}` | [Imagerie](#imagerie) |
| 9 | `DELETE` | `/radiology-studies/{study_id}` | [Imagerie](#imagerie) |
| 10 | `GET` | `/radiology/{study_id}/report` | [Compte rendu radio](#compte-rendu-radiologique) |
| 11 | `POST` | `/radiology/{study_id}/report` | [Compte rendu radio](#compte-rendu-radiologique) |
| 12 | `POST` | `/analyze-ai` | [IA](#aide-au-diagnostic) |
| 13 | `POST` | `/extract-roi` | [Extractions](#extractions) |
| 14 | `POST` | `/annotations/save` | [Extractions](#extractions) |
| 15 | `GET` | `/patients/{folder_id}/extractions` | [Extractions](#extractions) |
| 16 | `GET` | `/extractions/{extraction_id}/details` | [Extractions](#extractions) |
| 17 | `DELETE` | `/extractions/{extraction_id}` | [Extractions](#extractions) |
| 18 | `GET` | `/extractions/{extraction_id}/workflow` | [Workflow](#workflow) |
| 19 | `PUT` | `/extractions/{extraction_id}/workflow/steps/{step}` | [Workflow](#workflow) |
| 20 | `POST` | `/extractions/{extraction_id}/workflow/goto` | [Workflow](#workflow) |
| 21 | `GET` | `/extractions/workflow/steps` | [Workflow](#workflow) |

---

## Système

### 1. `GET /health`

Vérifie **réellement** chaque dépendance. Implémentation :
[main.py:466-496](../backend/main.py#L466-L496).

**Réponse 200 — tout va bien**
```json
{
  "status": "ok",
  "backend": "connected",
  "instanseg": { "status": "ok", "device": "cpu", "loaded_models": ["brightfield_nuclei"] },
  "database": { "status": "connected" }
}
```

**Réponse 503 — dégradé**
```json
{
  "status": "degraded",
  "backend": "connected",
  "instanseg": { "status": "disconnected", "error": "All connection attempts failed" },
  "database": { "status": "connected" }
}
```

| Détail | Valeur |
|---|---|
| Teste | PostgreSQL (`SELECT 1` réel) + InstanSeg (`GET /health`) |
| Ne teste **pas** | MinIO, Orthanc |
| Code si dégradé | `503`, avec l'erreur exacte dans le corps |

```bash
curl -s http://localhost:8002/health | jq
```

---

### 2. `GET /dzi_data/{chemin}` — service statique

Monté par `app.mount("/dzi_data", StaticFiles(directory="/app/dzi_data"))`.
Sert les manifestes `.dzi` et les tuiles `.jpg` à OpenSeadragon.

```
GET /dzi_data/William-30b14509/CMU-1.dzi
GET /dzi_data/William-30b14509/CMU-1_files/14/23_17.jpg
```

> ⚠️ **Aucun contrôle d'accès.** Toute personne connaissant le chemin lit les
> tuiles d'un patient. Limite assumée, citée sur la diapositive 13.

---

## Patients

### 3. `GET /patients`

Liste tous les dossiers, avec leurs biopsies et études radiologiques imbriquées.

**Réponse 200 — `List[PatientSchema]`**
```json
[
  {
    "id": 1,
    "name": "Marie Dupont",
    "age": 54,
    "folder_id": "Marie-Dupont-a3f9c1e2",
    "birth_date": "1971-04-12",
    "family_history": "Mère : cancer du sein à 60 ans",
    "medical_history": "HTA traitée depuis 2018",
    "biopsies": [
      { "id": 3, "image_url": "Marie-Dupont-a3f9c1e2/CMU-1.dzi", "status": "Non analysé" }
    ],
    "radiology_studies": [
      { "id": 2, "orthanc_study_id": "b9f2...", "modality": "CT",
        "description": "Thorax", "date": "20260410" }
    ]
  }
]
```

| Détail | Valeur |
|---|---|
| Pagination | **aucune** — tout est renvoyé |
| Erreur | aucune ; une base vide renvoie `[]` |
| Client | [`getPatients()`](../frontend/src/services/api.ts#L58) → `Dashboard.tsx` |

> ⚠️ **`PatientSchema` déclare `name: str` et `age: int` non-optionnels**, alors
> que les colonnes sont nullables. Un patient créé en SQL direct avec
> `name = NULL` ferait échouer la sérialisation de **toute la liste**.

---

### 4. `POST /patients`

Crée un dossier. Le `folder_id` est **généré par le serveur**, jamais fourni.

**Corps — `PatientCreate`**
```json
{
  "name": "Marie Dupont",
  "age": 54,
  "birth_date": "1971-04-12",
  "family_history": "Mère : cancer du sein à 60 ans",
  "medical_history": "HTA traitée depuis 2018"
}
```

| Champ | Type | Obligatoire |
|---|---|---|
| `name` | `str` | ✅ |
| `age` | `int` | ✅ |
| `birth_date` | `str?` | non |
| `family_history` | `str?` | non |
| `medical_history` | `str?` | non |

**Réponse 201 — `PatientSchema`** (avec `biopsies: []` et `radiology_studies: []`)

**Génération du `folder_id`** ([main.py:146](../backend/main.py#L146)) :
```python
folder_id = f"{safe_folder_name(payload.name)}-{uuid.uuid4().hex[:8]}"
# "Marie Dupont" → "Marie-Dupont-a3f9c1e2"
```

```bash
curl -X POST http://localhost:8002/patients \
  -H 'Content-Type: application/json' \
  -d '{"name":"Jean Martin","age":62}'
```

---

### 5. `DELETE /patients/{patient_id}`

Supprime le dossier **et tout ce qui lui appartient**.

**Réponse 200 — rapport détaillé**
```json
{
  "patient": "Marie Dupont",
  "folder_id": "Marie-Dupont-a3f9c1e2",
  "minio_objects": 2,
  "dzi_paths": 3,
  "orthanc_studies_kept": 1,
  "warnings": [],
  "message": "Patient « Marie Dupont » supprimé."
}
```

| Supprimé | Conservé |
|---|---|
| ✅ Objets MinIO sous `{folder}/` | ❌ **Études DICOM dans Orthanc** |
| ✅ Tuiles DZI (différé, tâche de fond) | ❌ Objets MinIO à la racine du bucket (seeder) |
| ✅ Lignes `patients`, `biopsies`, `extractions`, `drawings`, `workflow_*` | |

**Pourquoi Orthanc est épargné :** *« purger un PACS est une opération à part,
volontairement laissée hors de ce endpoint »*
([main.py:956-960](../backend/main.py#L956-L960)).

**Erreurs :** `404` — `"Patient introuvable"`

> `warnings` n'est **jamais vide par erreur** : chaque échec partiel y est
> listé (objet MinIO non supprimé, chemin hors `dzi_data`…) plutôt que de
> planter. Le frontend les affiche : *« Supprimé, avec réserves : … »*.

---

## Imagerie

### 6. `POST /patients/{patient_id}/upload-biopsy`

Import d'une lame WSI : MinIO + tuilage DZI + ligne `biopsies`.

| | |
|---|---|
| Content-Type | `multipart/form-data` |
| Champ | `file` |
| Extensions acceptées | `.svs`, `.tif`, `.tiff` |
| Durée | **plusieurs minutes** pour une lame de quelques centaines de Mo |

**Réponse 201 — `BiopsySchema`**
```json
{ "id": 3, "image_url": "Marie-Dupont-a3f9c1e2/CMU-1.dzi", "status": "Non analysé" }
```

**Séquence** ([main.py:161-244](../backend/main.py#L161-L244))
```
1. Vérifier que le patient existe                    → 404
2. Vérifier qu'il n'a PAS DÉJÀ une lame              → 409
3. Vérifier l'extension                              → 400
4. Écrire dans un fichier temporaire système, par blocs de 8 Mo
5. run_in_threadpool → minio.fput_object("{folder}/{nom}")
6. run_in_threadpool → pyvips ... .dzsave(tile_size=256, overlap=1, ".jpg")
7. INSERT biopsies (image_url="{folder}/{stem}.dzi", status="Non analysé")
8. finally : fermer le fichier, effacer le temporaire
```

**Erreurs**

| Code | Message |
|---|---|
| `404` | `"Patient introuvable"` |
| `409` | `"Ce dossier contient deja une lame ({image_url}). Supprimez-la avant d'en importer une autre."` |
| `400` | `"Format accepté : .svs, .tif ou .tiff"` |
| `500` | `"Échec de l'upload de biopsie : {error}"` (avec `db.rollback()`) |

**Pourquoi une seule lame par dossier :** tout le reste de l'application
travaille sur `patient.biopsies[0]`. Accepter la seconde donnait l'illusion d'un
import réussi alors qu'elle restait invisible.

```bash
curl -X POST http://localhost:8002/patients/1/upload-biopsy -F 'file=@CMU-1.svs'
```

---

### 7. `POST /patients/{patient_id}/upload-radiology`

Import d'un DICOM : relais vers Orthanc + lecture des métadonnées réelles.

| | |
|---|---|
| Content-Type | `multipart/form-data` |
| Champ | `file` |
| Extension acceptée | `.dcm` uniquement |

**Réponse 201 — `RadiologySchema`**
```json
{ "id": 2, "orthanc_study_id": "b9f2c8a1-...", "modality": "CT",
  "description": "THORAX AVEC INJECTION", "date": "20260410" }
```

**Séquence** ([main.py:247-371](../backend/main.py#L247-L371))
```
1. Patient existe ?                                            → 404
2. Le dossier a-t-il déjà une étude ?                          → 409
3. Extension == .dcm ?                                         → 400
4. POST http://orthanc:8042/instances  (auth orthanc/orthanc)
     status ∉ {200, 202}                                       → 502
     pas d'ID dans la réponse                                  → 502
5. study_id = réponse["ParentStudy"]        ← UNIQUEMENT ICI    → 502 si absent
6. GET /studies/{study_id}  → MainDicomTags.StudyDescription, .StudyDate
7. GET /series/{ParentSeries} → MainDicomTags.Modality  (défaut "Inconnue")
8. Cette étude est-elle déjà en base ?                         → 409 (nomme le dossier)
9. INSERT radiology_studies
```

**Erreurs**

| Code | Message |
|---|---|
| `404` | `"Patient introuvable"` |
| `409` | `"Ce dossier contient deja un examen radiologique. …"` |
| `409` | `"Cet examen DICOM est deja rattache au dossier de {nom}. Un meme examen ne peut pas appartenir a deux patients."` |
| `400` | `"Format accepté : .dcm"` |
| `502` | `"Orthanc a refusé le fichier DICOM"` / `"Orthanc n'a pas retourné d'identifiant"` / `"Étude Orthanc introuvable"` / `"Orthanc indisponible : …"` |

> **Le second `409` est le plus important à comprendre.** Orthanc dédoublonne
> par UID DICOM : réimporter le même fichier renvoie l'étude déjà indexée, qui
> appartient donc déjà à un dossier — possiblement un **autre**. Retourner cette
> ligne telle quelle laissait croire à un import réussi alors que le dossier
> courant ne recevait rien. Il faut d'abord détacher l'étude
> (`DELETE /radiology-studies/{id}`).

**Robustesse :** si la lecture des tags d'étude ou de la modalité échoue,
l'import **continue** avec des valeurs de repli — seul l'échec du `ParentStudy`
est bloquant.

---

### 8. `DELETE /biopsies/{biopsy_id}`

Supprime la lame : objet MinIO, tuiles, puis la ligne.

**Réponse 200**
```json
{ "minio_objects": 1, "dzi_paths": 2, "extractions_conservees": 3,
  "warnings": [], "message": "Lame supprimee." }
```

| Supprimé | Conservé |
|---|---|
| ✅ Objet MinIO (via `storage.find_object_key`) | ❌ **Les extractions déjà réalisées** — elles portent leur propre fichier et leur propre compte rendu |
| ✅ `{stem}.dzi` et `{stem}_files/` | |
| ✅ La ligne `biopsies` | |

**Erreurs :** `404` — `"Lame introuvable"`

**Réponse immédiate :** les tuiles sont **renommées** (instantané) puis effacées
dans un `BackgroundTasks`. Auparavant la réponse attendait près d'une minute
sans aucun retour visuel.

---

### 9. `DELETE /radiology-studies/{study_id}`

**Détache** l'examen du dossier. Ne supprime **rien** dans Orthanc.

> Attention : `{study_id}` est ici l'**`id` entier de la table**, pas le
> `orthanc_study_id`. Contrairement aux routes `/radiology/{study_id}/report` qui,
> elles, utilisent l'identifiant Orthanc. Piège classique.

**Réponse 200**
```json
{ "message": "Examen radiologique detache du dossier.",
  "orthanc_study_id": "b9f2c8a1-...", "orthanc_conserve": true }
```

**Erreurs :** `404` — `"Examen radiologique introuvable"`

**Conséquence utile :** le même fichier pourra être réimporté ensuite, y compris
sur un autre dossier.

---

## Compte rendu radiologique

### 10. `GET /radiology/{study_id}/report`

`{study_id}` = **`orthanc_study_id`** (chaîne).

**Réponse 200**
```json
{ "report": "Opacité du lobe supérieur droit…", "annotations": "{\"wadouri:…\":{…}}" }
```

`annotations` est l'état sérialisé de `cornerstoneTools`. Chaîne vide ou `"{}"`
si aucune annotation.

**Erreurs :** `404` — `"Radio introuvable"`

---

### 11. `POST /radiology/{study_id}/report`

**Corps — `ReportPayload`**
```json
{ "report": "Opacité du lobe supérieur droit…", "annotations": "{...}" }
```

| Champ | Type | Obligatoire |
|---|---|---|
| `report` | `str` | ✅ |
| `annotations` | `str?` | non (défaut `""`) |

**Réponse 200** — `{ "message": "Compte-rendu et annotations sauvegardés !" }`
**Erreurs :** `404` — `"Radio introuvable"`

> ⚠️ **Bug confirmé.** Le frontend envoie un troisième champ `lastModifiedBy`
> ([RadiologyViewer.tsx:253](../frontend/src/pages/RadiologyViewer.tsx#L253)),
> **absent de `ReportPayload`**. Pydantic v2 ignore les champs inconnus par
> défaut : il est **silencieusement jeté**. Il n'existe ni colonne pour le
> stocker, ni clé dans la réponse du `GET`. Résultat : le panneau « Dernière
> modification » affiche toujours « Aucun historique » après un rechargement.
> Détail et correctif dans [09 — Pièges](09-pieges-et-bugs.md).

---

## Aide au diagnostic

### 12. `POST /analyze-ai`

Segmente les noyaux d'une région de la lame via InstanSeg.

**Corps** — `AnalysisPayload`, mais seuls ces champs sont lus :

| Champ | Type | Rôle |
|---|---|---|
| `x`, `y` | `int` | Origine de la région, en pixels de la lame |
| `width`, `height` | `int` | Dimensions — **max 1500 × 1500** |
| `patient_folder` | `str` | Résout le patient (par `folder_id`) |

```json
{ "x": 12000, "y": 8400, "width": 1024, "height": 1024,
  "patient_folder": "Marie-Dupont-a3f9c1e2", "patient_name": "Marie Dupont",
  "annotation_label": "Zone suspecte" }
```

**Réponse 200 — analyse réussie**
```json
{
  "suggestion": "🔬 Bilan InstanSeg :\n• Noyaux détectés : 342\n• Densité : 326 cellules / Mpx\n• Taille moyenne : 187 px²\n• Pléomorphisme : Modéré\n• Temps traitement : 4.213s",
  "cell_count": 342,
  "contour_points": [
    { "color": "#7ab3d4", "points": [{"x": 12, "y": 45}, {"x": 13, "y": 46}] }
  ]
}
```

**Réponse 200 — zone trop vaste** (ce n'est **pas** une erreur HTTP)
```json
{ "suggestion": "❌ Zone trop vaste. L'IA requiert un patch plus petit (zoom maximum). Dessinez un rectangle plus petit (max 1500x1500px).",
  "cell_count": 0, "contour_points": [] }
```

**Les trois indicateurs**

| Indicateur | Calcul | Code |
|---|---|---|
| **Densité cellulaire** | `round(cell_count / (w × h) × 1 000 000)` → cellules / Mpx | [main.py:628-629](../backend/main.py#L628-L629) |
| **Taille moyenne** | `int(np.mean([inst.area_px]))` en px² | [main.py:619](../backend/main.py#L619) |
| **Pléomorphisme** | `max > moy × 3` → « Élevé (Atypies cytonucléaires marquées) »<br>`max > moy × 2` → « Modéré »<br>sinon → « Faible (Noyaux réguliers) » | [main.py:622-626](../backend/main.py#L622-L626) |

**Erreurs**

| Code | Cause |
|---|---|
| `404` | `"Aucune biopsie disponible pour ce patient"` |
| `404` | `"Lame source introuvable dans MinIO… Emplacements essayes : …"` |
| `503` | `"Service InstanSeg indisponible : …"` |
| `500` | Erreur PyVips ou autre |

**Points d'attention**

1. **Le bornage est fait deux fois** : côté client
   ([Viewer.tsx:303](../frontend/src/pages/Viewer.tsx#L303)) et côté serveur. Le
   serveur est le garde-fou réel.
2. **`_borner_region` clampe** la région aux dimensions réelles de l'image avant
   de tester la limite.
3. **L'échec des contours n'est pas bloquant** : si `segment_points` échoue, on
   renvoie quand même les statistiques avec `contour_points: []`.
4. **Les coordonnées sont dans le repère du PATCH.** Le frontend doit rajouter
   `cropX`/`cropY` pour les replacer sur la lame.

> **Curiosité du code.** Le backend appelle `segment_points(mode="centroids")`
> ([main.py:607](../backend/main.py#L607)), alors qu'InstanSeg déclare
> `enum=["pixel","polygon","pylgone"]`. Ce n'est **pas** une erreur bloquante :
> le kwarg `enum` de `Query()` alimente seulement la doc OpenAPI, il ne valide
> rien à l'exécution. Comme `"centroids" != "pixel"`,
> `_blobs_to_points` retombe sur la branche contour et renvoie bien des
> polygones. Le nom est donc trompeur, mais le comportement est correct.

---

## Extractions

### 13. `POST /extract-roi`

Découpe une région d'intérêt en TIFF pyramidal et crée un **dossier d'analyse
autonome**.

**Corps** — `AnalysisPayload` complet : géométrie + identité + tout le formulaire
médical + `drawings`.

**Réponse 200**
```json
{ "message": "Dossier créé avec succès", "id": 12, "extraction_id": 12 }
```

(`id` et `extraction_id` portent la même valeur — le frontend essaie les deux.)

**Séquence** ([main.py:685-787](../backend/main.py#L685-L787))
```
1. Résoudre le patient par folder_id                          → 404 si absent
2. mkdir dzi_data/{folder}/extractions/
3. download_biopsy_source() depuis MinIO                      → 404 si introuvable
4. pyvips extract_area(x, y, w, h)
   .tiffsave(compression="jpeg", Q=90, tile=True, pyramid=True, bigtiff=True)
5. minio.fput_object("{folder}/extractions/extraction_{ts}.svs")
6. os.remove(fichier local)          ← LE FICHIER DISPARAÎT DU DISQUE
7. INSERT extractions (dzi_url, x, y, w, h, owner, + tout le formulaire)
```

**Erreurs**

| Code | Message |
|---|---|
| `404` | `"Dossier patient introuvable. Creez-le d'abord (POST /patients) avant d'extraire une region."` |
| `404` | `"Aucune biopsie disponible pour ce patient"` |

> **Vestige corrigé, à connaître.** Avant l'existence de `POST /patients`, cette
> route **créait un dossier patient** (âge 0) à partir du corps de la requête.
> *« Sur un dossier médical, créer une identité depuis une entrée non
> authentifiée est inacceptable — et cela produisait des dossiers fantômes dès
> qu'un identifiant erroné était transmis. »*
> ([main.py:693-704](../backend/main.py#L693-L704))

> ⚠️ **Les erreurs PyVips et MinIO sont avalées** (`except ... print(...)`,
> [main.py:742-746](../backend/main.py#L742-L746)). L'extraction est **créée en
> base même si le découpage a échoué**. C'est une violation du principe « les
> erreurs se voient ». Voir [09 — Pièges](09-pieges-et-bugs.md).

---

### 14. `POST /annotations/save`

Met à jour une extraction existante : libellé, formulaire, **et remplace toutes
ses annotations**.

**Corps** — `AnalysisPayload` avec **`extraction_id` obligatoire**.

```json
{
  "extraction_id": 12,
  "annotation_label": "Zone suspecte — relecture",
  "owner": "Dr.House",
  "drawings": [
    { "type": "rect", "x": 12050.5, "y": 8410.2, "w": 300, "h": 220, "author": "Dr.House" },
    { "type": "circle", "x": 12400, "y": 8600, "radius": 85, "author": "Dr.House" },
    { "type": "polygon", "x": 0, "y": 0,
      "points": [{"x":1,"y":2},{"x":3,"y":4},{"x":5,"y":6}], "author": "Dr.Watson" },
    { "type": "text", "x": 12100, "y": 8500, "w": 12160, "h": 8440,
      "text": "mitose atypique", "author": "Dr.House" }
  ],
  "histo_type": "canalaire", "sbr_grade": "2", "diagnosis": "malin",
  "status": "en_analyse"
}
```

**Réponse 200** — `{ "message": "Mis à jour" }`

**Erreurs**

| Code | Message |
|---|---|
| `400` | `"ID manquant"` (si `extraction_id` absent) |
| `404` | `"Introuvable"` |

> ⚠️ **Remplacement total des annotations.** La route fait
> `DELETE FROM drawings WHERE extraction_id = ?` puis réinsère tout
> ([main.py:825-839](../backend/main.py#L825-L839)). Deux conséquences :
> 1. Les `id` des dessins changent à chaque sauvegarde ;
> 2. **Deux praticiens qui sauvegardent en même temps s'écrasent mutuellement**
>    (dernier écrivain gagne) — alors que le projet met en avant l'annotation
>    « collaborative ». Il n'y a aucun verrou optimiste.

> ⚠️ **Écrasement par des valeurs vides.** Tous les champs sont réaffectés sans
> condition. Un client qui n'envoie pas `histo_type` transmet `""` (valeur par
> défaut Pydantic) et **efface** la valeur existante. Cette route court-circuite
> complètement le moteur de workflow.

---

### 15. `GET /patients/{folder_id}/extractions`

`{folder_id}` = l'identifiant fonctionnel, **pas** l'`id` entier.

**Réponse 200**
```json
[
  { "id": 12, "filename": "Zone suspecte", "annotation_label": "Zone suspecte",
    "url": "http://localhost:8002/dzi_data/Marie-Dupont-a3f9c1e2/extractions/extraction_1735820412.svs",
    "roi": { "x": 12000, "y": 8400, "w": 1024, "h": 1024 },
    "diagnosis": "malin", "status": "en_analyse", "owner": "Dr.House" }
]
```

> **Un patient inconnu renvoie `[]`, pas `404`.** Choix délibéré : la carte
> patient interroge cette route à chaque montage.

> ⚠️ **Deux défauts dans le champ `url` :**
> 1. `http://localhost:8002` est **codé en dur**
>    ([main.py:858](../backend/main.py#L858)) — inutilisable hors localhost ;
> 2. Le fichier pointé **n'existe pas sur disque** : `/extract-roi` l'a effacé
>    après l'avoir poussé dans MinIO. Le champ renvoie donc systématiquement un
>    404. Il n'est heureusement **jamais utilisé** par le frontend, qui rouvre la
>    lame complète zoomée sur le `roi`.
>
> `filename` et `annotation_label` portent tous deux `e.label` — doublon pour
> compatibilité entre le Dashboard et le Viewer.

---

### 16. `GET /extractions/{extraction_id}/details`

Détail complet d'une extraction : formulaire à plat + annotations.

**Réponse 200**
```json
{
  "id": 12, "filename": "Zone suspecte", "annotation_label": "Zone suspecte",
  "prelevement_type": "biopsie", "prelevement_date": "2026-03-14",
  "block_number": "B-2026-0412", "fixation": "formol",
  "slide_count": 4, "staining": ["HES"],
  "macro_obs": "Fragment tissulaire de 12 mm…",
  "micro_obs": "Prolifération carcinomateuse…",
  "histo_type": "canalaire", "sbr_grade": "2", "margins": "saines, 4 mm",
  "hormonal_receptors": "RE+ 90%, RP+ 70%", "diagnosis": "malin",
  "comments": "Compléter par HER2.",
  "status": "en_analyse", "pathologist": "Dr.House", "validation_date": "2026-03-20",
  "drawings": [
    { "type": "rect", "x": 12050.5, "y": 8410.2, "w": 300, "h": 220,
      "radius": null, "text": null, "points": null, "author": "Dr.House" }
  ]
}
```

**Erreurs :** `404` — `"Non trouvé"`

> Le Viewer n'utilise plus de cette réponse que `drawings` et
> `annotation_label` — **les valeurs du formulaire viennent désormais du moteur
> de workflow** ([Viewer.tsx:1096-1100](../frontend/src/pages/Viewer.tsx#L1096-L1100)).

---

### 17. `DELETE /extractions/{extraction_id}?username={nom}`

| Paramètre | Emplacement | Type | Obligatoire |
|---|---|---|---|
| `extraction_id` | chemin | `int` | ✅ |
| `username` | **query string** | `str` | ✅ |

**Réponse 200** — `{ "message": "Supprimé" }`

**Erreurs**

| Code | Cause |
|---|---|
| `404` | Extraction inexistante (sans `detail`) |
| `403` | `ext.owner != username` (sans `detail`) |
| `422` | `username` absent (validation FastAPI) |

```bash
curl -X DELETE "http://localhost:8002/extractions/12?username=Dr.House"
```

> ⚠️ **Le seul contrôle d'autorisation du projet — et il est purement
> déclaratif.** `username` vient du `localStorage`, sans aucune vérification :
> n'importe qui peut passer le nom du propriétaire. Aucune valeur de sécurité.

> Les erreurs `404`/`403` sont levées **sans `detail`**, et le nettoyage MinIO /
> disque est enveloppé dans des `except: pass` nus
> ([main.py:928-940](../backend/main.py#L928-L940)) — un objet non supprimé
> passe totalement inaperçu.

---

## Workflow

Routeur : [`backend/workflow/router.py`](../backend/workflow/router.py) ·
préfixe `/extractions` · tag `workflow`.

**Format d'erreur commun** — `detail` est un **objet**, pas une chaîne :
```json
{ "detail": { "code": "step_locked",
              "message": "Cette étape n'est pas encore accessible : validez d'abord les précédentes.",
              "details": { "max_reached_position": 2 } } }
```

**Correspondance codes métier → HTTP**

| Code métier | HTTP | Quand |
|---|---|---|
| `unknown_step` | `404` | Identifiant d'étape absent de `STEP_IDS` |
| `invalid_payload` | `422` | `data` n'est pas un objet |
| `missing_fields` | `422` | Champ de `REQUIRED_FIELDS` non renseigné |
| `step_locked` | `409` | Étape non encore accessible |

---

### 18. `GET /extractions/{extraction_id}/workflow`

Avancement complet. **Crée l'état au premier appel** s'il n'existe pas, en le
reconstruisant depuis les colonnes historiques.

**Réponse 200 — `WorkflowStateSchema`**
```json
{
  "extraction_id": 12,
  "current_step": "microscopie",
  "current_position": 3,
  "step_count": 4,
  "is_complete": false,
  "completed_at": null,
  "max_reached_position": 3,
  "steps": [
    { "step": "prelevement", "position": 1, "label": "Prélèvement",
      "data": { "prelevementType": "biopsie", "prelevementDate": "2026-03-14",
                "blockNumber": "B-2026-0412", "fixation": "formol" },
      "validated_at": "2026-03-15T09:12:44", "validated_by": "Dr.House" },
    { "step": "preparation", "position": 2, "label": "Préparation",
      "data": { "slideCount": 4, "staining": ["HES"], "macroObs": "…" },
      "validated_at": "2026-03-15T10:03:11", "validated_by": "Tech.Durand" },
    { "step": "microscopie", "position": 3, "label": "Microscopie",
      "data": {}, "validated_at": null, "validated_by": null },
    { "step": "diagnostic", "position": 4, "label": "Diagnostic",
      "data": {}, "validated_at": null, "validated_by": null }
  ]
}
```

**Champs de la réponse**

| Champ | Sens |
|---|---|
| `current_step` | Étape ouverte dans l'interface |
| `current_position` | Son rang **1-based** |
| `step_count` | Toujours 4 |
| `is_complete` | `completed_at is not None` |
| `max_reached_position` | Rang le plus avancé **accessible** — pilote les cadenas de la frise |
| `steps[].data` | Le JSONB complet de l'étape |
| `steps[].validated_at` | `null` = non validée. Seul marqueur de validation |

**Erreurs :** `404` — `"Extraction introuvable."` (chaîne, pas objet)

---

### 19. `PUT /extractions/{extraction_id}/workflow/steps/{step}`

Enregistre une étape. **C'est ici que les règles s'appliquent.**

| Paramètre | Valeurs |
|---|---|
| `{step}` | `prelevement` \| `preparation` \| `microscopie` \| `diagnostic` |

**Corps — `StepSavePayload`**
```json
{
  "data": { "microObs": "Prolifération carcinomateuse…",
            "histoType": "canalaire", "sbrGrade": "2", "margins": "saines, 4 mm" },
  "validated_by": "Dr.House",
  "validate_step": true
}
```

| Champ | Type | Défaut | Rôle |
|---|---|---|---|
| `data` | `object` | `{}` | Valeurs du formulaire, clés OLGA en camelCase |
| `validated_by` | `str?` | `null` | Auteur. Si absent → `extraction.owner` |
| `validate_step` | `bool` | **`true`** | `false` = **brouillon**, ne franchit pas l'étape |

**Réponse 200 :** le `WorkflowStateSchema` **complet et à jour**.

**Effets d'une validation**

1. `data` est écrit dans `workflow_step_states.data` ;
2. `validated_at = now()`, `validated_by` renseigné ;
3. `current_step` avance **d'un cran** (ou `completed_at = now()` si c'était la 4ᵉ) ;
4. `_mirror_to_columns()` projette les champs connus sur les colonnes de
   `extractions`.

> **La projection a lieu même en brouillon** (`validate_step=false`) —
> `_mirror_to_columns` est appelé hors du bloc conditionnel
> ([service.py:198](../backend/workflow/service.py#L198)).

**Erreurs**

| Code | `code` | Cause |
|---|---|---|
| `404` | — | Extraction introuvable (`detail` = chaîne) |
| `404` | `unknown_step` | Étape hors `STEP_IDS` |
| `422` | `invalid_payload` | `data` n'est pas un objet |
| `422` | `missing_fields` | Champ requis vide — `details.missing` liste les clés |
| `409` | `step_locked` | Étape non accessible — `details.max_reached_position` |

```bash
curl -X PUT http://localhost:8002/extractions/12/workflow/steps/prelevement \
  -H 'Content-Type: application/json' \
  -d '{"data":{"prelevementType":"biopsie","fixation":"formol"},
       "validated_by":"Dr.House","validate_step":true}'
```

---

### 20. `POST /extractions/{extraction_id}/workflow/goto`

Revient sur une étape **déjà accessible** (bouton « Retour », clic sur la frise).

**Corps — `TransitionPayload`** — `{ "step": "preparation" }`

**Réponse 200 :** le `WorkflowStateSchema` complet.

**Erreurs**

| Code | `code` | Message |
|---|---|---|
| `404` | `unknown_step` | `"Étape inconnue : {step}"` |
| `409` | `step_locked` | `"Étape inaccessible : les étapes précédentes ne sont pas validées."` |

Ne modifie **que** `current_step` et `updated_at`. Aucune donnée n'est touchée,
aucune validation n'est annulée.

---

### 21. `GET /extractions/workflow/steps`

Ordre de référence des étapes, pour aligner n'importe quel client.

**Réponse 200**
```json
{ "steps": ["prelevement", "preparation", "microscopie", "diagnostic"] }
```

Aucun paramètre, aucune erreur.

> **Pas de conflit de routage** avec `GET /extractions/{extraction_id}/workflow` :
> les motifs sont `/{id}/workflow` et `/workflow/steps`. Pour
> `/extractions/workflow/steps`, le premier exigerait que le 2ᵉ segment soit
> littéralement `workflow` — or c'est `steps`. Le second gagne.
>
> ⚠️ **Mais l'ordre d'enregistrement compte.** Si vous ajoutez un jour
> `GET /extractions/{extraction_id}` (deux segments), il faudra le déclarer
> **après** `/workflow/steps`, sinon il capturerait la requête.

---

## Annexe A — Le micro-service InstanSeg (port 7000)

Non exposé au navigateur ; le backend en est le seul client.
Code : [`instanseg/api.py`](../instanseg/api.py).

| Méthode | Route | Réponse | Utilisé par Chiron |
|---|---|---|---|
| `GET` | `/health` | `{status, device, loaded_models}` | ✅ `/health` |
| `POST` | `/segment` | `SegmentResult` | ✅ `/analyze-ai` |
| `POST` | `/segment/mask` | PNG (`StreamingResponse`) | ❌ jamais |
| `POST` | `/segment/points` | `[{color, points}]` | ✅ `/analyze-ai` |

**Paramètres communs** (query string) : `model` (`brightfield_nuclei` \|
`fluorescence_nuclei_and_cells`), `target` (`nuclei` \| `cells` \|
`all_outputs`), `pixel_size` (`float?`). Fichier en `multipart/form-data`, champ
`file`.

**`SegmentResult`**
```json
{ "model": "brightfield_nuclei", "target": "nuclei",
  "processing_time_s": 4.213, "image_shape": [1024, 1024, 3],
  "instance_count": 342,
  "instances": [ { "id": 1, "area_px": 187, "centroid_x": 45.2,
                   "centroid_y": 88.7, "bbox": [80, 38, 98, 53] } ],
  "labeled_array": [[0,0,1,…], …] }
```

> `bbox` est ordonné `[y_min, x_min, y_max, x_max]` — **y d'abord**, convention
> NumPy. Et `labeled_array` est la matrice **complète** des labels : pour un
> patch 1500×1500, c'est un JSON de plusieurs dizaines de Mo. Le backend le
> reçoit et le jette. Optimisation évidente à faire.

---

## Annexe B — Récapitulatif des codes d'erreur

| Code | Signification dans Chiron | Routes concernées |
|---|---|---|
| `200` | Succès | toutes |
| `201` | Créé | `POST /patients`, les deux `upload-*` |
| `400` | Format de fichier refusé, ID manquant | uploads, `/annotations/save` |
| `403` | Pas propriétaire de l'extraction | `DELETE /extractions/{id}` |
| `404` | Ressource ou étape inexistante, lame introuvable dans MinIO | la plupart |
| `409` | Règle métier : doublon de lame/étude, transition interdite | uploads, workflow |
| `422` | Validation Pydantic, ou champ de workflow manquant | toutes, workflow |
| `500` | Erreur inattendue (upload) | `upload-biopsy` |
| `502` | Orthanc en panne ou réponse inattendue | `upload-radiology` |
| `503` | InstanSeg indisponible, ou `/health` dégradé | `/analyze-ai`, `/health` |
