# 10 — Parcours de bout en bout

Les six scénarios métier de la présentation, tracés **fichier par fichier**.
Rejouez-les mentalement : c'est le meilleur test de compréhension du projet.

---

## Scénario 1 — Créer un dossier patient

```
UTILISATEUR                FRONTEND                     BACKEND              STOCKAGE
     │
  clic « Nouveau Patient »
     │──────────────▶ Dashboard.tsx
     │                setShowAddPatient(true)
     │                     │
     │                ◀────┴─ AddPatientModal
     │                        (formulaire contrôlé)
  saisit et valide
     │──────────────▶ createPatient(payload)         services/api.ts:31
     │                axios.post('/patients') ────────▶ create_patient()      main.py:144
     │                                                  folder_id = safe_folder_name(name)
     │                                                              + "-" + uuid4()[:8]
     │                                                  db.add(Patient) ──────▶ PostgreSQL
     │                ◀──────────── 201 PatientSchema ─┘
     │                onCreated(patient)
     │                setPatients([...current, patient])   ← ajout LOCAL, pas de refetch
     │                setShowAddPatient(false)
  ◀──┴─ la carte apparaît
```

**Points clés**

- Le `folder_id` est **généré par le serveur**, jamais fourni par le client.
- Le Dashboard **n'appelle pas** `fetchPatients()` : il ajoute la réponse
  directement à son état (mise à jour optimiste bien faite — la réponse est la
  vérité serveur).
- ⚠️ Le `catch` est générique (`'Impossible de créer le patient.'`) — le `detail`
  du serveur n'est pas lu. Voir [09 — C5](09-pieges-et-bugs.md).

---

## Scénario 2 — Importer une lame de biopsie

```
UTILISATEUR              FRONTEND                  BACKEND                   STOCKAGE
     │
  « Importer Imagerie »
     │──────────▶ UploadMedicalImage
     │            type = 'biopsy'
  glisse CMU-1.svs
     │──────────▶ chooseFile()
     │            /\.(svs|tif|tiff)$/i  ✓
  clic « Importer »
     │──────────▶ uploadMedicalImage(id, 'biopsy', file, setProgress)
     │            FormData + onUploadProgress
     │            POST /patients/1/upload-biopsy ──▶ upload_biopsy()          main.py:161
     │                                                │
     │                                     1. patient existe ?         → 404
     │                                     2. patient.biopsies vide ?  → 409 ★
     │                                     3. extension ∈ {svs,tif,tiff}? → 400
     │                                     4. NamedTemporaryFile
     │  ═══ barre de progression ═══▶        while chunk := await file.read(8 Mo)
     │                                     5. run_in_threadpool ─────────▶ MinIO
     │                                        fput_object("{folder}/CMU-1.svs")
     │                                     6. run_in_threadpool ─────────▶ disque
     │                                        pyvips ... .dzsave(256, overlap=1, .jpg)
     │                                        │  ⏳ PLUSIEURS MINUTES
     │                                        └─▶ dzi_data/{folder}/CMU-1.dzi
     │                                                       CMU-1_files/0..17/*.jpg
     │                                     7. INSERT biopsies ──────────▶ PostgreSQL
     │                                        image_url = "{folder}/CMU-1.dzi"
     │                                        status    = "Non analysé"
     │                                     8. finally: unlink(temporaire)
     │            ◀──────────── 201 BiopsySchema ─┘
     │            onUploaded() → fetchPatients()
  ◀──┴─ la carte affiche « Biopsie » actif
```

**★ La règle « une seule lame par dossier »**

```python
if patient.biopsies:
    raise HTTPException(409, detail=(
        f"Ce dossier contient deja une lame ({patient.biopsies[0].image_url}). "
        "Supprimez-la avant d'en importer une autre."))
```

Le message est **affiché tel quel** à l'utilisateur par `UploadMedicalImage` —
c'est le principe « les erreurs se voient » bien appliqué.

**Les trois protections contre le gel de l'API**

| Étape | Protection |
|---|---|
| Réception du fichier | Lecture par blocs de 8 Mo, jamais tout en RAM |
| Envoi MinIO | `run_in_threadpool` |
| Tuilage PyVips | `run_in_threadpool` + `access="sequential"` |

Sans elles : `ERR_CONNECTION_RESET` pendant toute la durée de l'import.

---

## Scénario 3 — Explorer la lame

```
UTILISATEUR              FRONTEND                        BACKEND
     │
  clic « Biopsie »
     │──────────▶ PatientCard.openViewer()
     │            navigate('/viewer?url=<image_url>', { state: {...} })
     │                     │
     │            App.tsx → Route /viewer → Viewer.tsx
     │                     │
     │            extractionId = undefined  →  isAnnotationMode = FALSE
     │                     │
     │            useEffect [rawUrl, isAnnotationMode, initialROI]
     │              OpenSeadragon({ tileSources: `${API}/dzi_data/${rawUrl}` })
     │                     │
     │                     ├─ GET /dzi_data/{folder}/CMU-1.dzi ──▶ StaticFiles
     │                     │   ◀── manifeste XML (dimensions, tile_size)
     │                     │
     │                     └─ pour chaque tuile visible :
  molette / glisser              GET /dzi_data/{folder}/CMU-1_files/14/23_17.jpg
     │──────────▶ viewer  ◀──── JPEG 256×256
     │              addHandler("animation") → setRedrawToken(n+1)
     │                                     → React re-rend le SVG
     │              renderShapesBackground() : IMAGE → ÉCRAN pour chaque forme
     ◀──┴─ zoom fluide, annotations alignées
```

**Le mécanisme de synchronisation SVG ↔ OpenSeadragon**

```tsx
const [, setRedrawToken] = useState(0);              // valeur ignorée
const updateOverlay = () => setRedrawToken((n) => n + 1);
viewer.addHandler("animation",       updateOverlay);
viewer.addHandler("update-viewport", updateOverlay);
viewer.addHandler("resize",          updateOverlay);
```

`setRedrawToken` ne sert **qu'à forcer un rendu React**. Sans lui, les
annotations resteraient figées à leur position d'origine pendant que la lame
défile en dessous.

**En mode création, la barre d'outils est réduite** : déplacer, zoom +/−, et
**rectangle uniquement**. Cercle, polygone et texte n'apparaissent qu'en mode
annotation.

---

## Scénario 4 — Extraire une région d'intérêt

```
UTILISATEUR              FRONTEND                    BACKEND                 STOCKAGE
     │
  outil rectangle
     │──────────▶ setCurrentTool("rect")
     │            useEffect → viewer.setMouseNavEnabled(false)   ← désactive le pan
  glisse sur l'image
     │──────────▶ handleMouseDown  : dragStart (ÉCRAN)
     │            handleMouseMove  : currentDragShape (ÉCRAN, aperçu rouge)
     │            handleMouseUp    :
     │              p1 = viewerElementToImageCoordinates(x, y)      ★ ÉCRAN → IMAGE
     │              p2 = viewerElementToImageCoordinates(x+w, y+h)
     │              newShape = { type:"rect", x:p1.x, y:p1.y,
     │                           w:p2.x-p1.x, h:p2.y-p1.y, author:currentUser }
     │              si w > 5 : setShapes([...prev, newShape])
     │                         setCurrentTool("move"); setShowSidebar(true)
     │
  nomme l'extraction, clic « Créer l'extraction »
     │──────────▶ handleSaveAction()
     │            POST /extract-roi ──────────────▶ extract_roi()         main.py:685
     │            { x, y, width, height,             1. patient par folder_id → 404
     │              patient_folder, owner,           2. mkdir {folder}/extractions/
     │              annotation_label, drawings,      3. download_biopsy_source() ◀── MinIO
     │              + tout le formulaire }              (storage.candidate_object_keys)
     │                                                4. pyvips extract_area(x,y,w,h)
     │                                                   .tiffsave(pyramid, bigtiff)
     │                                                5. fput_object() ─────────▶ MinIO
     │                                                6. os.remove(local)   ⚠️ voir A5
     │                                                7. INSERT extractions ────▶ PostgreSQL
     │            ◀──── { extraction_id: 12 } ───────┘
     │            setNewExtractionId(12); setShowSuccessModal(true)
  ◀──┴─ modale « Extraction Créée ! »
        │
   « Voir l'extraction »
        │──────▶ navigate('/viewer?url=<LAME>', {
                    state: { extractionId: 12, roi: shapes[0], ... } })
                                              ↑ on rouvre la LAME, pas le TIFF
```

**★ Le point de conversion critique.** Les coordonnées sont saisies en **pixels
écran** et persistées en **pixels image**. Si la conversion était omise, les
annotations changeraient de place à chaque niveau de zoom.

**Ce qu'il faut vraiment retenir : le TIFF extrait n'est jamais affiché.**

Il est produit, poussé dans MinIO, puis effacé du disque. Rouvrir une extraction
recharge la **lame complète** et la zoome sur le `roi`, avec le déplacement borné
à cette région. Le TIFF n'existe que comme artefact d'archive.

---

## Scénario 5 — Analyse assistée par IA

```
UTILISATEUR         FRONTEND              BACKEND                    INSTANSEG
     │
  dessine un rectangle, clic « Lancer IA »
     │──────▶ handleAiAnalysis()                                    Viewer.tsx:282
     │        getShapeBounds(shape) → minX, minY, maxX, maxY
     │        cropX/Y/W/H = Math.round(...)
     │        si W>1500 ou H>1500 → message, ARRÊT       ← garde CLIENT
     │        POST /analyze-ai ─────▶ analyze_image_with_ai()        main.py:547
     │                                 patient par folder_id           → 404
     │                                 run_in_threadpool(download_biopsy_source)
     │                                   ◀── MinIO (plusieurs centaines de Mo)
     │                                 run_in_threadpool(_borner_region)
     │                                   x = max(0, min(data.x, image.width))
     │                                   w = min(data.width, image.width - x)
     │                                 si w>1500 ou h>1500 → message  ← garde SERVEUR
     │                                 run_in_threadpool(_extraire_png)
     │                                   extract_area(...).write_to_buffer(".png")
     │                                 source_path.unlink()
     │                                       │
     │                                       ├─ POST /segment ──────────▶ _load("brightfield_nuclei")
     │                                       │   (multipart PNG)           _prepare() CHW [0,1]
     │                                       │                             model.eval_small_image()
     │                                       │  ◀── SegmentResult ─────────┤ _instances()
     │                                       │      instances[], count       area_px, centroid, bbox
     │                                       │      labeled_array ⚠️ (jeté)
     │                                       │
     │                                       └─ POST /segment/points ───▶ _blobs_to_points()
     │                                          ◀── [{color, points}] ────┤ _contour_points()
     │                                                                      tri angulaire
     │                                 ── STATISTIQUES (numpy) ──
     │                                 avg  = int(np.mean(areas))
     │                                 max  = int(np.max(areas))
     │                                 pleo = max>avg*3 ? "Élevé"
     │                                      : max>avg*2 ? "Modéré" : "Faible"
     │                                 dens = round(count/(w*h)*1e6)
     │        ◀── { suggestion, cell_count, contour_points } ─┘
     │
     │        contours = points.map(p => ({ x: p.x + cropX, y: p.y + cropY }))
     │                                        ★ RETRANSLATION dans le repère lame
     │        setAiSuggestion(...); setAiContours(contours)
     │        renderAiPoints() → <polygon> par noyau, superposé à la lame
  ◀──┴─ contours colorés + bilan chiffré dans le panneau
```

**★ La retranslation est indispensable.** InstanSeg reçoit un patch découpé et
raisonne dans **son** repère (origine en haut à gauche du patch). Sans
`+ cropX/cropY`, tous les contours s'empileraient dans le coin supérieur gauche
de la lame.

**Le double bornage à 1500 × 1500** : le client évite un aller-retour inutile,
le serveur est le garde-fou réel (un client modifié pourrait contourner le
premier).

**Le résultat affiché**

```
🔬 Bilan InstanSeg :
• Noyaux détectés : 342
• Densité : 326 cellules / Mpx
• Taille moyenne : 187 px²
• Pléomorphisme : Modéré
• Temps traitement : 4.213s
```

> **Ces valeurs sont une aide à la lecture.** Le diagnostic reste posé par le
> praticien, qui seul valide l'étape correspondante.

---

## Scénario 6 — Le compte rendu guidé en 4 étapes

### 6a — Ouverture de l'extraction

```
     │  clic « Dossiers » → choisit l'extraction #12
     │──────▶ openViewer(extraction)
     │        navigate('/viewer?url=<LAME>', { state:{ extractionId:12, roi } })
     │
     │        Viewer.tsx : isAnnotationMode = TRUE
     │        ├─ OpenSeadragon + fitBounds(roi) + bornage du zoom
     │        │
     │        ├─ useEffect [extractionId]
     │        │    GET /extractions/12/details ──▶ get_details()
     │        │    ◀── { drawings[], annotation_label, ... }
     │        │    setShapes(data.drawings); setLabelInput(...)
     │        │
     │        ├─ useWorkflow(12, currentUser)
     │        │    GET /extractions/12/workflow ──▶ get_workflow()
     │        │      service.get_or_create_state(db, extraction)
     │        │        si extraction.workflow is None :
     │        │          RECONSTRUCTION depuis les colonnes historiques
     │        │          pour chaque étape : _legacy_data() → has_data ?
     │        │          validée tant que consécutif, on s'arrête au 1er trou
     │        │          current_step = STEP_IDS[validated_count]
     │        │    ◀── WorkflowStateSchema (current_step, max_reached_position, steps[])
     │        │
     │        └─ useOlgaForm(currentIndex, true)
     │             GET http://localhost:9091/forms/getFromID/<uuid> ──▶ OLGA
     │               ├─ succès  → olgaToJsonSchema(raw)      status = "live"
     │               └─ échec   → SCHEMA_SNAPSHOTS[step.id]  status = "snapshot"
     │                            + bandeau ambre
  ◀──┴─ frise + formulaire de l'étape ATTEINTE (pas l'étape 1)
```

**« Rouvrir un dossier le repositionne sur l'étape atteinte »** — c'est
`get_or_create_state` qui le permet, y compris pour les extractions créées avant
l'existence du moteur.

### 6b — Validation d'une étape

```
UTILISATEUR         FRONTEND                        BACKEND
     │
  remplit le formulaire
     │──────▶ handleFieldChange(key, value)
     │        setFormData(prev => ({ ...prev, [key]: value }))
     │        formValues = { ...workflow.mergedData, ...formData }
     │
  clic « Valider et continuer (1/4) »
     │──────▶ handleNextWorkflowStep()
     │        fields = olgaForm.schema["x-order"]
     │        stepData = Object.fromEntries(fields.map(f => [f, formValues[f] ?? ""]))
     │                            ↑ SEULS les champs du schéma courant
     │        workflow.saveCurrentStep(stepData, true)
     │          PUT /extractions/12/workflow/steps/prelevement ──▶ save_workflow_step()
     │          { data, validated_by, validate_step:true }          router.py:52
     │                                                                    │
     │                                              service.save_step()   │
     │                                              ├─ step ∈ STEP_IDS ?     → 404
     │                                              ├─ data est un dict ?    → 422
     │                                              ├─ position ≤ reachable ?→ 409 ★
     │                                              ├─ _missing_required()   → 422
     │                                              ├─ target.data = data
     │                                              ├─ validated_at = now()
     │                                              ├─ validated_by = ...
     │                                              ├─ current_step = STEP_IDS[position]
     │                                              │    (ou completed_at si 4/4)
     │                                              └─ _mirror_to_columns() ★★
     │                                                   extractions.prelevement_type
     │                                                   extractions.fixation ...
     │        ◀──── WorkflowStateSchema complet ──────┘
     │        setState(updated); setFormData({})     ← la vérité redevient serveur
     │        currentIndex passe à 1
     │        → useOlgaForm recharge le formulaire « Préparation »
  ◀──┴─ frise : étape 1 ✓ avec le nom du valideur, étape 2 ouverte, 3 et 4 🔒
```

**★ Le blocage de transition**

```python
reachable = max_reached_position(state)   # consécutives validées + 1, plafonné à 4
if position > reachable:
    raise WorkflowError("step_locked",
        "Cette étape n'est pas encore accessible : validez d'abord les précédentes.",
        {"max_reached_position": reachable})
```

Le client ne peut **pas** contourner cette règle : elle vit côté serveur.
Un appel direct en `curl` sur `steps/diagnostic` depuis l'étape 1 reçoit un
`409`.

**★★ La double écriture**

```
data (JSONB)                       colonnes de `extractions`
────────────────                   ─────────────────────────
workflow_step_states.data          extractions.prelevement_type
= TOUT le formulaire               extractions.prelevement_date
  (même les champs sans colonne)   extractions.block_number
                                   extractions.fixation
```

Le JSONB préserve la saisie **intégrale** ; les colonnes maintiennent le contrat
des consommateurs existants (`/details`, carte patient, viewer).

### 6c — Retour arrière et achèvement

```
  clic sur une étape validée dans la frise
     │──────▶ workflow.goToStep("preparation")
     │        POST /extractions/12/workflow/goto  { step:"preparation" }
     │          ├─ position ≤ reachable ?        → 409 sinon
     │          └─ current_step = "preparation"  (RIEN d'autre n'est modifié)
     │        ◀── état à jour
  ◀──┴─ le formulaire « Préparation » se recharge, prérempli par mergedData

  … après validation de l'étape 4 :
        current_step = "diagnostic"
        completed_at = now()   →  is_complete = true
  ◀──┴─ encart vert : « Les quatre étapes sont validées. Vous pouvez encore
                        corriger une étape en la sélectionnant ci-dessus. »
        + bouton « Mettre à jour l'analyse » (POST /annotations/save)
```

**Le dossier terminé n'est pas verrouillé** — c'est un choix délibéré : une
correction reste possible, l'information est affichée sans bloquer.

---

## Le cycle de vie complet d'un dossier

```
                  POST /patients
                       │
                  ┌────▼─────┐
                  │ patients │
                  └────┬─────┘
        ┌──────────────┼──────────────┐
        │              │              │
POST upload-biopsy     │      POST upload-radiology
        │              │              │
   ┌────▼─────┐        │     ┌────────▼──────────┐
   │ biopsies │        │     │ radiology_studies │
   │ + MinIO  │        │     │ + Orthanc         │
   │ + tuiles │        │     └────────┬──────────┘
   └────┬─────┘        │              │
        │              │       GET/POST /radiology/{id}/report
   POST /extract-roi   │              │  (Cornerstone, PDF)
        │              │              ▼
   ┌────▼────────┐     │        report + annotations
   │ extractions │◀────┘
   └──┬───────┬──┘
      │       │
 POST /annotations/save    GET /extractions/{id}/workflow
      │                          │
 ┌────▼─────┐            ┌───────▼─────────┐
 │ drawings │            │ workflow_states │
 └──────────┘            └───────┬─────────┘
                                 │  PUT .../steps/{step}  ×4
                     ┌───────────▼──────────┐
                     │ workflow_step_states │──▶ _mirror_to_columns()
                     │  data JSONB          │       ↓
                     │  validated_at/by     │   extractions.*
                     └──────────────────────┘

           POST /analyze-ai  ──▶ InstanSeg  (lecture seule, rien n'est persisté)
```

> **Remarquez que `/analyze-ai` n'écrit rien en base.** Le résultat de l'IA vit
> uniquement dans l'état React du Viewer, et disparaît au rechargement. C'est
> cohérent avec son statut d'« aide à la lecture » — mais si vous devez conserver
> une trace d'analyse, c'est une fonctionnalité à créer.

---

## Auto-évaluation

Si vous savez répondre à ces questions sans relire, la prise en main est
acquise.

### Architecture
1. Pourquoi deux visionneuses distinctes plutôt qu'une seule ?
2. Que se passe-t-il exactement entre le dépôt d'un `.svs` et son affichage ?
3. Pourquoi le moteur de workflow vit-il chez Chiron et pas chez OLGA ?
4. Quel est le seul fichier du dépôt qui connaît le format d'OLGA ?
5. Que fait `image_seeder` à chaque démarrage, et que fait-il seulement sur une
   base vide ?

### Base de données
6. Pourquoi deux tables pour le workflow plutôt que des colonnes sur
   `extractions` ?
7. À quoi sert `folder_id`, et où le retrouve-t-on hors de PostgreSQL ?
8. Que supprime réellement `DELETE /patients/{id}` — et que conserve-t-il ?
9. Pourquoi `create_all` a-t-il été remplacé par Alembic ?
10. Quelles cascades sont ORM, lesquelles sont en base ?

### Backend
11. Quelle est la différence entre `def` et `async def` dans FastAPI, et pourquoi
    est-ce critique ici ?
12. Pourquoi la suppression des tuiles renomme-t-elle avant d'effacer ?
13. Où `ParentStudy` est-il disponible, et où ne l'est-il pas ?
14. Que fait `_mirror_to_columns()`, et pourquoi ?
15. Comment `max_reached_position()` est-il calculé ?

### Frontend
16. Que se passe-t-il si l'utilisateur fait F5 sur `/viewer` ?
17. Comment le calque SVG reste-t-il aligné pendant un zoom ?
18. Quelle est la différence entre `viewerElementToImageCoordinates` et
    `deltaPointsFromPixels` ?
19. Que fait `coerceToSchema`, et quel problème résout-il ?
20. Où l'identité de l'utilisateur est-elle stockée, et par quoi est-elle
    vérifiée ?

### Métier
21. Que signifient HE, HES, IHC — et quelle est la différence de nature entre
    les deux premières et la troisième ?
22. Qu'évalue le grade SBR, sur quels trois critères ?
23. Qu'est-ce que le pléomorphisme, et comment Chiron l'estime-t-il ?
24. Quels sont les trois types de prélèvement, du moins au plus invasif ?
25. Pourquoi les récepteurs hormonaux changent-ils la prise en charge ?

### Débogage
26. Pourquoi les statistiques du Dashboard restent-elles à zéro ?
27. Pourquoi « Dernière modification » affiche-t-il toujours « Aucun
    historique » ?
28. Que faire si une visionneuse de biopsie reste vide ?
29. Pourquoi un `409` à l'import d'un DICOM déjà présent est-il un bon
    comportement ?
30. Quels deux fichiers faut-il modifier pour ajouter une étape au workflow ?

**Les réponses sont dans les documents [01](01-architecture-generale.md) à
[09](09-pieges-et-bugs.md).**
