# 08 — Lexique médical et technique

Tous les termes et abréviations à caractère médical présents **dans la
présentation** et **dans le code** (variables, entités, commentaires, libellés
d'interface). Pour chacun : la définition, et l'endroit exact où il apparaît.

> **Comment lire ce document.** La colonne « Où » donne les fichiers et
> identifiants réels. Si vous cherchez un terme croisé dans le code, utilisez la
> [table de correspondance rapide](#table-de-correspondance-rapide) en fin de
> document.

---

## 1. Spécialités et acteurs

### Anatomopathologie (« anapath »)
Spécialité médicale qui étudie les **tissus et cellules au microscope** pour
poser un diagnostic — notamment déterminer si une lésion est bénigne ou
maligne. C'est le métier central de Chiron côté biopsie.

| Où | |
|---|---|
| Commentaires | `models.py:109` « Avancement du workflow anatomopathologique d'une extraction » ; `workflow/service.py:1` « Machine à états du workflow anatomopathologique » |
| Interface | Titre du panneau latéral du Viewer : « Analyse Pathologique » ([Viewer.tsx:1584](../frontend/src/pages/Viewer.tsx#L1584)) |
| Présentation | Diapositives 2, 3, 5 |

### Pathologiste (anatomopathologiste)
Le **médecin spécialiste** qui lit les lames et **pose le diagnostic**. Dans
Chiron, c'est lui seul qui valide l'étape 4.

| Où | |
|---|---|
| Colonne SQL | `extractions.pathologist` ([models.py:78](../backend/models.py#L78)) |
| Champ OLGA | `pathologist` — libellé « **Pathologiste référent** » ([diagnostic.json:41-45](../frontend/src/features/workflow/schemas/diagnostic.json#L41-L45)) |
| Projection | `FIELD_TO_COLUMN["diagnostic"]["pathologist"]` ([constants.py:91](../backend/workflow/constants.py#L91)) |
| Présentation | Diapositive 5 (acteurs) |

### Radiologue
Médecin qui interprète les examens d'imagerie (scanner, IRM, radiographie) et
rédige le compte rendu radiologique.

| Où | |
|---|---|
| Interface | En-tête de `RadiologyViewer` : « DPI - Imagerie Radiologique » |
| Présentation | Diapositive 5 |
| Note | **Aucun rôle technique** : `RadiologyViewer.finalUser.profession` vaut `"Médecin"` par défaut, sans distinction |

### Technicien de laboratoire
Prépare les blocs, les lames et les colorations. Renseigne les étapes 1
(Prélèvement) et 2 (Préparation) — **il ne devrait pas avoir accès au
diagnostic**.

| Où | |
|---|---|
| Présentation | Diapositives 5 et 13 |
| Note | ⚠️ **Le contrôle d'accès par rôle n'existe pas.** Rien n'empêche un technicien de valider l'étape Diagnostic. Limite explicitement assumée (diapositive 13) |

### DPI — Dossier Patient Informatisé
Système regroupant l'ensemble des données médicales d'un patient.

| Où | |
|---|---|
| Interface | `RadiologyViewer.tsx:398` « DPI - Imagerie Radiologique » ; pied de page du PDF : « Document généré par le DPI Chiron / OncoCollab » ([ligne 381](../frontend/src/pages/RadiologyViewer.tsx#L381)) |

### HDS — Hébergeur de Données de Santé
Certification française **obligatoire** pour héberger des données de santé à
caractère personnel.

| Où | |
|---|---|
| Interface | `Login.tsx:52` — « Système certifié HDS (Hébergeur Données Santé) v2.4 » |
| ⚠️ | **Mention purement décorative et fausse.** Chiron n'est pas certifié HDS et ne doit héberger aucune donnée réelle |

---

## 2. Radiologie et DICOM

### DICOM — *Digital Imaging and Communications in Medicine*
**LE** standard mondial de l'imagerie médicale. Il définit à la fois un **format
de fichier** (`.dcm`, pixels + métadonnées) et un **protocole réseau**. Chaque
fichier porte des centaines de « tags » : identité, modalité, paramètres
d'acquisition, date…

| Où | |
|---|---|
| Extension | `.dcm` — seule acceptée par `POST /patients/{id}/upload-radiology` ([main.py:266](../backend/main.py#L266)) |
| Validation client | `/\.dcm$/i` ([UploadMedicalImage.tsx:25](../frontend/src/components/UploadMedicalImage.tsx#L25)) |
| Bibliothèques | `dicom-parser`, `cornerstone-wado-image-loader` |
| Images de démo | `backend/images_initiales/radiologie/*.DCM` |

### PACS — *Picture Archiving and Communication System*
Système d'archivage et de transmission d'images médicales. C'est le « serveur de
radiologie » d'un établissement.

| Où | |
|---|---|
| Conteneur | `orthanc` — `ORTHANC_NAME=Chiron PACS Radiologie` ([docker-compose.yml:44](../docker-compose.yml#L44)) |
| Commentaires | `main.py:957` et `main.py:1130` : « purger un PACS est une opération à part » |
| Présentation | Diapositives 7 et 8 |

### Orthanc
Serveur PACS **libre**, léger, avec API REST. Standard du domaine — évite de
réimplémenter le protocole DICOM.

| Où | |
|---|---|
| Image | `jodogne/orthanc-plugins:1.12.0` |
| Ports | `8042` (REST + web), `4242` (DICOM natif) |
| Identifiants | `orthanc` / `orthanc` — **en dur** dans `main.py` |
| Colonne | `radiology_studies.orthanc_study_id` |

### Modalité (*Modality*)
Le **type d'appareil** ayant produit l'image. Code DICOM à deux lettres.

| Code | Signification |
|---|---|
| `CT` | *Computed Tomography* — **scanner** (tomodensitométrie) |
| `MR` | *Magnetic Resonance* — **IRM** |
| `CR` / `DX` | *Computed / Digital Radiography* — radiographie numérique |
| `US` | *Ultrasound* — **échographie** |
| `MG` | *Mammography* — **mammographie** |
| `PT` | *Positron Emission Tomography* — **TEP** |
| `SM` | *Slide Microscopy* — lame de microscopie |
| `OT` | *Other* — valeur de repli |

| Où | |
|---|---|
| Colonne SQL | `radiology_studies.modality` ([models.py:29](../backend/models.py#L29)) |
| Lecture | **Au niveau de la SÉRIE** : `GET /series/{id}` → `MainDicomTags.Modality` ([main.py:310-323](../backend/main.py#L310-L323)) |
| Repli | `"Inconnue"` (API) / `"OT"` (seeder) |
| Affichage | `RadiologySchema.modality`, carte patient |

### Study / Series / Instance — la hiérarchie DICOM

```
Patient
  └── Study      une session d'examen (un passage au scanner)
        └── Series   une acquisition (une séquence, un plan de coupe)
              └── Instance   UNE image, UN fichier .dcm
```

**C'est la source de la difficulté n° 1 du module radiologie** (diapositive 10) :
chaque métadonnée vit à un niveau différent.

| Donnée | Niveau | Comment l'obtenir |
|---|---|---|
| `ParentStudy` | — | **Uniquement dans la réponse du `POST /instances`** |
| `StudyDescription`, `StudyDate` | Study | `GET /studies/{id}` → `MainDicomTags` |
| `Modality` | **Series** | `GET /series/{id}` → `MainDicomTags` |
| `PatientID`, `PatientName` | Study | `GET /studies/{id}` → `PatientMainDicomTags` |

| Où | |
|---|---|
| Commentaire | `main.py:286-288` : « `ParentStudy` figure dans la réponse du POST, pas dans le détail de l'instance (qui n'expose que `ParentSeries`) : le relire par GET renvoyait toujours None, donc un 502 systématique » |
| Frontend | `GET /orthanc/studies/{studyId}/instances` puis `instances[0].ID` ([RadiologyViewer.tsx:99-106](../frontend/src/pages/RadiologyViewer.tsx#L99-L106)) |

### WADO / WADO-URI — *Web Access to DICOM Objects*
Standard d'accès **HTTP** aux objets DICOM. `WADO-URI` en est la forme la plus
simple : une URL qui retourne le fichier.

| Où | |
|---|---|
| Construction | `` `wadouri:${window.location.origin}/orthanc/instances/${id}/file` `` ([RadiologyViewer.tsx:107](../frontend/src/pages/RadiologyViewer.tsx#L107)) |
| Chargeur | `cornerstone-wado-image-loader` — le préfixe `wadouri:` lui indique quoi faire |
| Présentation | Diapositive 10 |

### Fenêtrage (*windowing*) — `Wwwc`
**Le geste fondamental du radiologue.** Un DICOM contient bien plus de nuances
(12-16 bits, souvent en unités Hounsfield) qu'un écran ne peut en afficher
(8 bits, 256 niveaux). Le fenêtrage choisit **quelle plage de valeurs** est
étalée sur ces 256 niveaux.

- **Window Width (WW)** — la largeur de la plage retenue → le **contraste** ;
- **Window Center (WC)** — le centre de la plage → la **luminosité**.

Changer le fenêtrage fait apparaître les poumons, les os ou les tissus mous
**depuis la même image**, sans rien recalculer.

| Où | |
|---|---|
| Outil | `cornerstoneTools.WwwcTool` — **outil actif par défaut** (`DEFAULT_TOOL = "Wwwc"`, [RadiologyViewer.tsx:32](../frontend/src/pages/RadiologyViewer.tsx#L32)) |
| Interface | Bouton « **Contraste** » avec l'icône `ContrastIcon` |
| Présentation | Diapositives 3, 8, 10 |

### ROI — *Region Of Interest* (région d'intérêt)
Zone délimitée par le praticien sur une image, pour la mesurer ou l'analyser.

| Où | |
|---|---|
| Outils Cornerstone | `RectangleRoiTool`, `EllipticalRoiTool` |
| Route backend | `POST /extract-roi` ([main.py:685](../backend/main.py#L685)) |
| Colonnes SQL | `extractions.x`, `.y`, `.w`, `.h` |
| API | Champ `roi: {x, y, w, h}` de `GET /patients/{folder_id}/extractions` |
| Frontend | `initialROI`, `roiRect`, `location.state.roi` ([Viewer.tsx:73](../frontend/src/pages/Viewer.tsx#L73)) |
| Présentation | Diapositives 4, 8, 9, 12 |

### Compte rendu radiologique
Texte rédigé par le radiologue décrivant ses observations et sa conclusion.

| Où | |
|---|---|
| Colonne SQL | `radiology_studies.report` (`TEXT`) |
| Routes | `GET` / `POST /radiology/{study_id}/report` |
| Interface | `<textarea>` — « Tapez vos observations cliniques ici... » |
| Export | PDF via jsPDF — titre « Compte-Rendu Radiologique » |

---

## 3. Anatomopathologie et lames numérisées

### Biopsie
Prélèvement d'un **fragment de tissu vivant** en vue d'un examen microscopique.
Par extension dans Chiron : la lame numérisée issue de ce prélèvement.

| Où | |
|---|---|
| Table SQL | `biopsies` ([models.py:37-43](../backend/models.py#L37-L43)) |
| Modèle | `class Biopsy(Base)` |
| Bucket MinIO | **`biopsie`** (singulier, sans « s ») |
| Route | `POST /patients/{id}/upload-biopsy`, `DELETE /biopsies/{id}` |
| Interface | Bouton « Biopsie » sur la carte patient ; onglet « Biopsie WSI » |
| Dossier | `backend/images_initiales/biopsie/` |
| Clé localStorage | **`biopsie_user`** — l'identité de l'utilisateur |

**Type de prélèvement** — valeurs de l'énumération `prelevementType` :

| Code | Terme complet | Définition |
|---|---|---|
| `fine` | **Cytoponction à l'aiguille fine** | Aspiration de cellules par une aiguille très fine. Le moins invasif, mais ne donne que des cellules isolées — pas l'architecture du tissu |
| `biopsie` | **Biopsie** | Prélèvement d'un fragment de tissu, qui conserve l'**architecture** tissulaire |
| `exerese` | **Exérèse** | Ablation chirurgicale **complète** de la lésion. C'est à la fois un geste diagnostique et thérapeutique |

| Où | [prelevement.json:7-30](../frontend/src/features/workflow/schemas/prelevement.json#L7-L30) · colonne `extractions.prelevement_type` |

### WSI — *Whole Slide Imaging* / lame entière numérisée
Numérisation **complète** d'une lame de microscope à très haute résolution. Le
fichier pèse de **100 Mo à plusieurs Go** — c'est la contrainte n° 1 du projet.

| Où | |
|---|---|
| Interface | Onglet « **Biopsie WSI** » ([UploadMedicalImage.tsx:77](../frontend/src/components/UploadMedicalImage.tsx#L77)) |
| Extensions | `.svs`, `.tif`, `.tiff` |
| Présentation | Diapositives 3, 8, 11 |

### SVS — *ScanScope Virtual Slide*
Format de lame numérisée d'**Aperio** (Leica Biosystems), le plus répandu.
Techniquement un **TIFF pyramidal** avec des métadonnées propriétaires.

| Où | |
|---|---|
| Constante | `SLIDE_EXTENSIONS = (".svs", ".tif", ".tiff")` ([storage.py:22](../backend/storage.py#L22)) |
| Validation | `{".svs", ".tif", ".tiff"}` ([main.py:184](../backend/main.py#L184)) |
| Extractions | Nommées `extraction_{timestamp}.svs` — bien qu'écrites en **TIFF** par `tiffsave` |
| Présentation | Diapositives 3, 11, 14 |

### DZI — *Deep Zoom Image*
Format de **pyramide de tuiles** (Microsoft). Un manifeste XML `.dzi` + un
dossier `_files/` contenant les tuiles JPEG par niveau de zoom. C'est **la**
solution au problème de taille.

```
CMU-1.dzi          manifeste : dimensions, tile_size, overlap, format
CMU-1_files/
  ├── 0/  …  17/   un dossier par niveau de zoom
  └── 17/0_0.jpg   tuiles de 256 px
```

| Où | |
|---|---|
| Génération | `image.dzsave(chemin, tile_size=256, overlap=1, suffix=".jpg")` ([main.py:218-227](../backend/main.py#L218-L227), [seed_images.py:189-197](../backend/seed_images.py#L189-L197)) |
| Dossier | `DZI_FOLDER = "/app/dzi_data"` — monté en statique sur `/dzi_data` |
| Colonnes | `biopsies.image_url` (`{folder}/{nom}.dzi`), `extractions.dzi_url` |
| Réconciliation | `reconcilier_tuiles()` ([seed_images.py:200](../backend/seed_images.py#L200)) |
| Présentation | Diapositives 3, 7, 8, 11, 14 |

### Tuilage / pyramide de tuiles
Découpage d'une image géante en petits carrés (256 px), à plusieurs niveaux de
résolution. La visionneuse ne charge que les tuiles visibles au zoom courant.

| Où | `generer_tuiles()` ([seed_images.py:189](../backend/seed_images.py#L189)) · `tile_size=256, overlap=1` |

### Coloration (*staining*)
Les tissus sont **transparents** au microscope optique. Les colorants fixent
sélectivement certains composants pour les rendre visibles.

| Code | Nom complet | Ce qu'il colore |
|---|---|---|
| **`HE`** | **Hématoxyline-Éosine** | L'**hématoxyline** colore les noyaux en bleu-violet (acides nucléiques) ; l'**éosine** colore le cytoplasme et le collagène en rose. **La coloration standard universelle en anatomopathologie.** |
| **`HES`** | **Hématoxyline-Éosine-Safran** | HE + le **safran**, qui colore le collagène en jaune-orangé. Variante **française** classique, qui distingue mieux le tissu conjonctif. |
| **`IHC`** | **Immunohistochimie** | Technique différente : des **anticorps** marqués détectent une protéine précise (récepteurs hormonaux, HER2, Ki-67…). C'est l'IHC qui permet de typer une tumeur. |

| Où | |
|---|---|
| Colonne SQL | `extractions.staining` — **type `JSON`** (une liste) |
| Champ OLGA | `staining` — libellé « Coloration » ([preparation.json:12-35](../frontend/src/features/workflow/schemas/preparation.json#L12-L35)) |
| Conversion | `_to_list()` ([constants.py:39-45](../backend/workflow/constants.py#L39-L45)) — emballe un scalaire en liste |
| Fichier de démo | `backend/images_initiales/biopsie/HE_example.tif` |
| Note | Le code technique est extrait du libellé par `parseOption` : `"HE (Hématoxyline-Éosine)"` → `{value:"HE", label:"Hématoxyline-Éosine"}` |

### Fixation
Traitement chimique **immédiat** qui arrête la dégradation du tissu et le
durcit, pour permettre les coupes fines.

| Code | Terme | Définition |
|---|---|---|
| `formol` | **Formol** (formaldéhyde à 4 %) | Le fixateur **standard**, quasi universel. Bonne préservation, compatible avec la plupart des techniques (dont l'IHC et la biologie moléculaire) |
| `bouin` | **Liquide de Bouin** | Acide picrique + formol + acide acétique. Meilleure préservation des **détails nucléaires**, mais **dégrade l'ADN** — incompatible avec les analyses moléculaires |
| `etat_frais` | **État frais** | Aucune fixation : le tissu est analysé immédiatement, souvent congelé. Utilisé pour l'**examen extemporané** (résultat pendant l'opération) et certaines techniques spéciales |

| Où | |
|---|---|
| Colonne SQL | `extractions.fixation` |
| Champ OLGA | `fixation` — libellé « Type de fixation » ([prelevement.json:42-65](../frontend/src/features/workflow/schemas/prelevement.json#L42-L65)) |

### Bloc (numéro de bloc)
Après fixation, le fragment est inclus dans un **bloc de paraffine** qui permet
de le couper en tranches de quelques microns. Chaque bloc porte un numéro
d'identification qui assure la **traçabilité** prélèvement → lame → diagnostic.

| Où | |
|---|---|
| Colonne SQL | `extractions.block_number` |
| Champ OLGA | `blockNumber` — libellé « Numéro de bloc » |
| Présentation | Diapositive 5 : « Prépare les blocs, les lames et les colorations » |

### Nombre de lames (*slideCount*)
Nombre de lames confectionnées à partir d'un bloc. Plusieurs coupes à des
niveaux différents augmentent les chances de trouver la lésion.

| Où | |
|---|---|
| Colonne SQL | `extractions.slide_count` — **`INTEGER`** |
| Champ OLGA | `slideCount` — libellé « Nombre de lames », `x-control: number` |
| Conversion | `_to_int()` ([constants.py:29-36](../backend/workflow/constants.py#L29-L36)) — le formulaire HTML envoie une chaîne |

### Observations macroscopiques (*macroObs*)
Description du prélèvement **à l'œil nu** : dimensions, couleur, consistance,
aspect de la surface de section. C'est la première étape de tout examen
anatomopathologique.

| Où | |
|---|---|
| Colonne SQL | `extractions.macro_obs` (`TEXT`) |
| Champ OLGA | `macroObs` — « Observations macroscopiques », `x-control: textarea` |
| Étape | 2 — Préparation |

### Observations microscopiques (*microObs*)
Description de ce que le pathologiste voit **au microscope** : architecture du
tissu, aspect des cellules, des noyaux, mitoses, nécrose, invasion…

| Où | |
|---|---|
| Colonne SQL | `extractions.micro_obs` (`TEXT`) |
| Champ OLGA | `microObs` — « Observations microscopiques », `x-control: textarea` |
| Étape | 3 — Microscopie |

---

## 4. Diagnostic et classification

### Type histologique (*histoType*)
Classification de la tumeur selon le **tissu d'origine** et son architecture. Les
valeurs du projet correspondent aux carcinomes **mammaires**.

| Code | Libellé | Définition |
|---|---|---|
| `canalaire` | **Carcinome canalaire** | Naît dans les **canaux galactophores** (qui conduisent le lait). **Le plus fréquent : ~70-80 % des cancers du sein.** |
| `lobulaire` | **Carcinome lobulaire** | Naît dans les **lobules** (unités productrices de lait). ~10-15 %. Souvent multifocal et plus difficile à voir en imagerie. |
| `mucineux` | **Carcinome mucineux** (colloïde) | Cellules tumorales baignant dans du **mucus** abondant. Rare (~2 %), et de **meilleur pronostic**. |
| `autre` | Autre type | Médullaire, tubuleux, papillaire, métaplasique… |

| Où | |
|---|---|
| Colonne SQL | `extractions.histo_type` |
| Champ OLGA | `histoType` — « Type histologique » ([microscopie.json:12-40](../frontend/src/features/workflow/schemas/microscopie.json#L12-L40)) |
| Commentaire | L'exemple canonique de `parseOption` : `"canalaire (Carcinome canalaire)"` ([olgaAdapter.ts:22](../frontend/src/features/workflow/olga/olgaAdapter.ts#L22)) |

### Grade SBR — Scarff-Bloom-Richardson
**Le score de référence du cancer du sein.** Il évalue l'**agressivité** de la
tumeur en notant trois critères de 1 à 3 (total : 3 à 9 points) :

1. **Différenciation tubulo-glandulaire** — la tumeur reproduit-elle encore
   l'architecture normale des glandes ?
2. **Pléomorphisme nucléaire** — les noyaux sont-ils réguliers ou très
   irréguliers en taille et en forme ?
3. **Index mitotique** — combien de cellules sont en train de se diviser ?

| Grade | Total | Signification | Pronostic |
|---|---|---|---|
| **I** | 3-5 | Bien différencié, croissance lente | Favorable |
| **II** | 6-7 | Moyennement différencié | Intermédiaire |
| **III** | 8-9 | Peu différencié, très prolifératif | Défavorable |

> La version modernisée s'appelle **Elston-Ellis** ou **Nottingham Grading
> System** ; « SBR » reste le terme courant en France.

| Où | |
|---|---|
| Colonne SQL | `extractions.sbr_grade` — **`VARCHAR`** (les valeurs `"1"`, `"2"`, `"3"` sont des chaînes) |
| Champ OLGA | `sbrGrade` — « Grade SBR » ([microscopie.json:41-64](../frontend/src/features/workflow/schemas/microscopie.json#L41-L64)) |
| Libellés | `"1" → "Grade I"`, `"2" → "Grade II"`, `"3" → "Grade III"` |
| Commentaire | Exemple cité dans `olgaAdapter.ts:22` : `"1 (Grade I)"` |
| Lien avec l'IA | Le **pléomorphisme** calculé par InstanSeg est l'un des 3 critères du SBR |

### Marges (*margins*)
État des **limites de la pièce opératoire**. Question capitale : la tumeur
a-t-elle été **entièrement retirée** ?

- **Marges saines** (*negative / clear*) — pas de cellule tumorale au bord ; la
  distance en mm est précisée.
- **Marges envahies** (*positive*) — des cellules tumorales atteignent la limite
  → **reprise chirurgicale** généralement nécessaire.

| Où | |
|---|---|
| Colonne SQL | `extractions.margins` |
| Champ OLGA | `margins` — « Marges », **`x-control: text`** (saisie libre, pas d'énumération) |
| Étape | 3 — Microscopie |

### Récepteurs hormonaux (RH / RE / RP)
Protéines présentes à la surface de certaines cellules tumorales, détectées par
**immunohistochimie**.

| Sigle | Nom | Anglais |
|---|---|---|
| **RE** | Récepteurs aux **Œstrogènes** | ER — *Estrogen Receptor* |
| **RP** | Récepteurs à la **Progestérone** | PR — *Progesterone Receptor* |

**Pourquoi c'est décisif :** une tumeur **RE+** est sensible à
l'**hormonothérapie** (tamoxifène, anti-aromatases) — un traitement bien mieux
toléré que la chimiothérapie. Le résultat s'exprime en pourcentage de cellules
marquées, par exemple `RE+ 90%, RP+ 70%`.

> Le **HER2** (*Human Epidermal growth factor Receptor 2*) est le troisième
> marqueur systématique. Il **n'est pas** dans le formulaire actuel — le
> commentaire d'exemple « Compléter par HER2 » en rappelle l'importance.

| Où | |
|---|---|
| Colonne SQL | `extractions.hormonal_receptors` |
| Champ OLGA | `hormonalReceptors` — « Récepteurs hormonaux », `x-control: text` |
| Étape | 4 — Diagnostic |

### Diagnostic (*diagnosis*)
La conclusion du pathologiste.

| Code | Libellé | Définition |
|---|---|---|
| `benin` | **Bénin** | Lésion **non cancéreuse**. Croissance locale, pas d'invasion, pas de métastase. |
| `malin` | **Malin** | **Cancer.** Capacité à envahir les tissus voisins et à métastaser. |
| `suspect` | **Suspect / Atypique** | Anomalies présentes mais **insuffisantes** pour trancher. Impose des examens complémentaires ou une nouvelle biopsie. |

| Où | |
|---|---|
| Colonne SQL | `extractions.diagnosis` |
| Champ OLGA | `diagnosis` — « Diagnostic » ([diagnostic.json:12-35](../frontend/src/features/workflow/schemas/diagnostic.json#L12-L35)) |
| API | Renvoyé par `GET /patients/{folder_id}/extractions` |
| Interface | Camembert « Diagnostics » du Dashboard (⚠️ alimenté par une donnée inventée — voir [09](09-pieges-et-bugs.md)) |

### Date de validation
Date à laquelle le pathologiste **signe** le compte rendu, le rendant
définitif et opposable.

| Où | |
|---|---|
| Colonne SQL | `extractions.validation_date` |
| Champ OLGA | `validationDate` — « Date de validation », `x-control: date` |
| Conversion | `_to_str_or_none()` — `""` doit valoir `NULL` |
| Doublon | Fait doublon avec `workflow_step_states.validated_at`, plus fiable |

---

## 5. Aide au diagnostic par IA

### Segmentation d'instances (*instance segmentation*)
Tâche de vision par ordinateur qui identifie **chaque objet individuellement**,
avec son contour propre — par opposition à la segmentation sémantique qui dirait
seulement « ici il y a du noyau ». Ici : chaque noyau cellulaire reçoit son
propre identifiant.

| Où | |
|---|---|
| Service | `instanseg` — [`instanseg/api.py`](../instanseg/api.py) |
| Sortie | `labeled_array` — matrice où chaque noyau porte un entier unique, `0` = fond |
| Extraction | `_instances()` — parcourt `np.unique(labeled)` |

### InstanSeg
Modèle de segmentation d'instances **spécialisé en histologie**.

| Où | |
|---|---|
| Conteneur | `p6_instanseg`, port `7000` |
| Paquet | `instanseg-torch` (GitHub) |
| Modèles | `brightfield_nuclei` (**le seul utilisé**), `fluorescence_nuclei_and_cells` |
| Cibles | `nuclei`, `cells`, `all_outputs` |
| Client | [`backend/instanseg_client.py`](../backend/instanseg_client.py) |

### Fond clair (*brightfield*)
Mode d'éclairage standard du microscope optique : la lumière traverse
l'échantillon par en dessous. C'est le mode des lames colorées HE/HES — d'où le
modèle `brightfield_nuclei`.

À l'opposé, la **fluorescence** excite des marqueurs fluorescents (modèle
`fluorescence_nuclei_and_cells`).

### Noyau (*nucleus*, pl. *nuclei*)
Organite contenant l'ADN. **C'est la cible de l'analyse** : sa taille, sa forme
et sa régularité sont les critères visuels majeurs de l'atypie cellulaire.

| Où | |
|---|---|
| Paramètre | `target="nuclei"` |
| Message | « • Noyaux détectés : {cell_count} » ([main.py:633](../backend/main.py#L633)) |
| Présentation | Diapositives 1, 4, 8, 12 |

### Densité cellulaire
Nombre de noyaux rapporté à la surface analysée. Une **hypercellularité** est un
signe d'alerte.

```python
area_pixels = safe_w * safe_h
density = round((cell_count / area_pixels) * 1000000)   # cellules / Mpx
```

| Où | [main.py:628-629](../backend/main.py#L628-L629) · affiché « • Densité : {density} cellules / Mpx » |

### Pléomorphisme (nucléaire)
**Variabilité de taille et de forme** des noyaux au sein d'une même population
cellulaire. Un tissu sain a des noyaux **réguliers et homogènes** ; une tumeur
agressive présente des noyaux de tailles très disparates. **C'est l'un des trois
critères du grade SBR.**

Calcul dans Chiron — un **proxy** basé sur la dispersion des surfaces :

```python
avg_size = int(np.mean(cell_areas))
max_size = int(np.max(cell_areas))

pleomorphism = "Faible (Noyaux réguliers)"
if   max_size > avg_size * 3: pleomorphism = "Élevé (Atypies cytonucléaires marquées)"
elif max_size > avg_size * 2: pleomorphism = "Modéré"
```

| Où | [main.py:622-626](../backend/main.py#L622-L626) · Présentation diapositives 4 et 12 |

> ⚠️ **C'est une heuristique simple**, pas une mesure validée cliniquement : elle
> compare le maximum à la moyenne, ce qui est très sensible aux valeurs
> aberrantes (deux noyaux fusionnés comptent comme un gros noyau). La
> présentation le dit clairement : *« Ces valeurs sont une aide à la lecture. Le
> diagnostic reste posé par le praticien. »*

### Atypie cytonucléaire
Anomalies morphologiques du noyau et du cytoplasme : noyau volumineux,
hyperchromatique (très sombre), contours irréguliers, nucléole proéminent. **Un
signe majeur de malignité.**

| Où | Message de résultat : « Élevé (**Atypies cytonucléaires** marquées) » ([main.py:624](../backend/main.py#L624)) |

### Centroïde (*centroid*)
Centre géométrique d'un objet segmenté — la moyenne des coordonnées de ses
pixels.

| Où | |
|---|---|
| Schéma | `Instance.centroid_x`, `centroid_y` ([instanseg_client.py:12-13](../backend/instanseg_client.py#L12-L13)) |
| Calcul | `round(float(xs.mean()), 2)` ([instanseg/api.py:120-121](../instanseg/api.py#L120-L121)) |
| Curiosité | Le backend appelle `segment_points(mode="centroids")`, valeur hors énumération — sans effet, la branche « contour » s'applique. Voir [05](05-api-endpoints.md#12-post-analyze-ai) |

### Boîte englobante (*bounding box*)
Le plus petit rectangle contenant l'objet.

| Où | `Instance.bbox: List[int]` — **`[y_min, x_min, y_max, x_max]`**, convention NumPy (y d'abord) ([instanseg/api.py:58](../instanseg/api.py#L58)) |

### Surface en pixels (*area_px*)
Nombre de pixels appartenant au noyau : `int(mask.sum())`.

| Où | `Instance.area_px` · base des indicateurs « taille moyenne » et « pléomorphisme » |

### Patch
Petite région extraite d'une image géante, envoyée au modèle. **Borné à
1500 × 1500 px** dans Chiron, pour la mémoire et le temps de calcul CPU.

| Où | |
|---|---|
| Garde serveur | `if safe_w > 1500 or safe_h > 1500` ([main.py:576](../backend/main.py#L576)) |
| Garde client | `if (cropW > 1500 \|\| cropH > 1500)` ([Viewer.tsx:303](../frontend/src/pages/Viewer.tsx#L303)) |
| Message | « L'IA requiert un patch plus petit (zoom maximum) » |

---

## 6. Workflow et compte rendu

### Les quatre étapes

```
1 Prélèvement  →  2 Préparation  →  3 Microscopie  →  4 Diagnostic
```

| # | id | Libellé | Contenu | Acteur typique |
|---|---|---|---|---|
| 1 | `prelevement` | **Prélèvement** | Type, date, n° de bloc, fixation | Technicien / Chirurgien |
| 2 | `preparation` | **Préparation** | Nombre de lames, coloration, observations macroscopiques | Technicien |
| 3 | `microscopie` | **Microscopie** | Observations microscopiques, type histologique, grade SBR, marges | Pathologiste |
| 4 | `diagnostic` | **Diagnostic** | Récepteurs hormonaux, diagnostic, commentaires, pathologiste, date | Pathologiste |

| Où | |
|---|---|
| Backend | `STEP_IDS`, `STEP_LABELS` ([constants.py:11-18](../backend/workflow/constants.py#L11-L18)) |
| Frontend | `WORKFLOW_STEPS` ([steps.ts:11-40](../frontend/src/features/workflow/steps.ts#L11-L40)) |
| Base | `workflow_states.current_step`, `workflow_step_states.step` |
| Présentation | Diapositives 3 et 4 |

### OLGA
Service **externe** de l'écosystème qui héberge la **définition** des
formulaires. Chiron lit les champs, et rien de plus : ni les données de santé, ni
la logique de progression ne quittent l'établissement.

| Où | |
|---|---|
| Port | `9091` — `VITE_OLGA_API_URL` |
| Endpoint | `GET /forms/getFromID/{formId}` |
| Frontière | [`features/workflow/olga/`](../frontend/src/features/workflow/olga/) |
| Registre | `olgaFormId` dans `steps.ts` (4 UUID) |
| Repli | `schemas/*.json` — instantanés versionnés |

### Extraction
Dans Chiron : **une région d'intérêt promue en dossier d'analyse autonome**. Elle
porte sa propre géométrie, ses annotations et son compte rendu en 4 étapes.

| Où | Table `extractions` · `POST /extract-roi` · interface « Dossiers » sur la carte patient |

### Traçabilité
Enregistrement de **qui** a fait **quoi** et **quand**. Exigence
médico-légale fondamentale : un compte rendu engage la responsabilité de son
signataire.

| Où | |
|---|---|
| Colonnes | `workflow_step_states.validated_by`, `.validated_at` |
| Interface | Nom affiché sous chaque étape validée ([WorkflowStepper.tsx:73-77](../frontend/src/features/workflow/components/WorkflowStepper.tsx#L73-L77)) |
| ⚠️ | **La signature est falsifiable** : l'identité vient du `localStorage`, sans vérification. *« La traçabilité n'a donc pas de valeur médico-légale »* (diapositive 13) |

---

## 7. Termes d'interface

| Terme affiché | Où | Signification |
|---|---|---|
| **File d'attente** | Dashboard | La liste des dossiers patients à traiter |
| **Patients en File** | StatCard | Nombre total de dossiers |
| **Analyses Terminées** | StatCard | Biopsies au statut « terminé » ⚠️ toujours 0 |
| **Cas Critiques** | StatCard | ⚠️ **donnée inventée** (`biopsy.id % 2 === 0`) |
| **Taux Cas Sains** | StatCard | ⚠️ dérivé de la même donnée inventée |
| **Motif** | Carte patient | Motif de consultation — **toujours « Non renseigné »** (`patient.motif` n'existe pas en base) |
| **Antécédents familiaux** | Modale patient | `patients.family_history` — maladies chez les apparentés |
| **Historique médical** | Modale patient | `patients.medical_history` — antécédents personnels |
| **Dossiers** | Carte patient | Les extractions du dossier |
| **Collaboration** | Viewer | Légende : vert = mes annotations, orange = celles des collègues |
| **Nouvelle Extraction** / **Analyse Pathologique** | Viewer | Les deux modes du panneau latéral |
| **Portail Médecin** | Login | — |
| **Identifiant Médecin** | Login | Le champ stocké dans `biopsie_user` |
| **Observations cliniques** | RadiologyViewer + PDF | Le compte rendu radiologique |
| **Dernière modification** | RadiologyViewer | ⚠️ toujours « Aucun historique » — voir [09](09-pieges-et-bugs.md) |
| **OncoCollab** | Pied de page du PDF | Nom apparenté (oncologie collaborative) — pas d'autre trace dans le code |

---

## Table de correspondance rapide

### Champ OLGA → colonne SQL → terme médical

| Champ OLGA | Colonne SQL | Étape | Terme |
|---|---|---|---|
| `prelevementType` | `prelevement_type` | 1 | Type de prélèvement (fine / biopsie / exérèse) |
| `prelevementDate` | `prelevement_date` | 1 | Date de prélèvement |
| `blockNumber` | `block_number` | 1 | Numéro de bloc de paraffine |
| `fixation` | `fixation` | 1 | Fixateur (formol / Bouin / état frais) |
| `slideCount` | `slide_count` | 2 | Nombre de lames |
| `staining` | `staining` | 2 | Coloration (HE / HES / IHC) |
| `macroObs` | `macro_obs` | 2 | Observations macroscopiques |
| `microObs` | `micro_obs` | 3 | Observations microscopiques |
| `histoType` | `histo_type` | 3 | Type histologique (canalaire / lobulaire / mucineux) |
| `sbrGrade` | `sbr_grade` | 3 | Grade Scarff-Bloom-Richardson (I / II / III) |
| `margins` | `margins` | 3 | Marges d'exérèse |
| `hormonalReceptors` | `hormonal_receptors` | 4 | Récepteurs hormonaux (RE / RP) |
| `diagnosis` | `diagnosis` | 4 | Diagnostic (bénin / malin / suspect) |
| `comments` | `comments` | 4 | Commentaires |
| `pathologist` | `pathologist` | 4 | Pathologiste référent |
| `validationDate` | `validation_date` | 4 | Date de validation |

### Toutes les abréviations

| Abrév. | Développé | Domaine |
|---|---|---|
| **CT** | Computed Tomography (scanner) | Radiologie |
| **DICOM** | Digital Imaging and Communications in Medicine | Radiologie |
| **DPI** | Dossier Patient Informatisé | Général |
| **DZI** | Deep Zoom Image | Technique |
| **HDS** | Hébergeur de Données de Santé | Réglementaire |
| **HE** | Hématoxyline-Éosine | Anapath |
| **HER2** | Human Epidermal growth factor Receptor 2 | Anapath |
| **HES** | Hématoxyline-Éosine-Safran | Anapath |
| **IHC** | Immunohistochimie | Anapath |
| **IRM / MR** | Imagerie par Résonance Magnétique | Radiologie |
| **MG** | Mammography | Radiologie |
| **OT** | Other (modalité) | Radiologie |
| **PACS** | Picture Archiving and Communication System | Radiologie |
| **RE / ER** | Récepteurs aux Œstrogènes | Anapath |
| **RH** | Récepteurs Hormonaux | Anapath |
| **ROI** | Region Of Interest | Technique |
| **RP / PR** | Récepteurs à la Progestérone | Anapath |
| **SBR** | Scarff-Bloom-Richardson | Anapath |
| **SVS** | ScanScope Virtual Slide | Technique |
| **US** | Ultrasound (échographie) | Radiologie |
| **WADO** | Web Access to DICOM Objects | Radiologie |
| **WC** | Window Center | Radiologie |
| **WSI** | Whole Slide Imaging | Anapath |
| **WW** | Window Width | Radiologie |
| **Wwwc** | Window Width / Window Center (outil) | Radiologie |
