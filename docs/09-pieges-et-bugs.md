# 09 — Pièges, dettes et bugs identifiés

> **Pourquoi ce document.** Un développeur qui doit corriger un bug a besoin de
> savoir ce qui est **déjà cassé**, ce qui est **volontairement ainsi**, et où
> se cachent les pièges. Chaque entrée est **vérifiée dans le code**, avec le
> fichier et la ligne.

**Légende**

| Symbole | Sens |
|---|---|
| 🐛 | **Bug confirmé** — comportement incorrect, reproductible |
| ⚠️ | **Piège** — fonctionne, mais surprend et se casse facilement |
| 🏗️ | **Dette assumée** — choix conscient, documenté dans le code |
| 🔒 | **Sécurité** — limite connue et revendiquée (diapositive 13) |

---

## Sommaire

- [A. Bugs confirmés](#a--bugs-confirmés)
- [B. Pièges à la modification](#b--pièges-à-la-modification)
- [C. Dettes techniques assumées](#c--dettes-techniques-assumées)
- [D. Sécurité](#sécurité)
- [E. Méthode de débogage](#e--méthode-de-débogage)

---

## A — Bugs confirmés

### 🐛 A1. Les statistiques du Dashboard restent toujours à zéro

**Symptôme.** Les tuiles « Analyses Terminées », « Cas Critiques » et « Taux Cas
Sains » affichent `0`. Les deux graphiques ne s'affichent jamais — l'encart
« Prêt pour l'analyse » les remplace en permanence.

**Cause.** Le Dashboard teste trois valeurs de statut que le backend n'écrit
jamais.

```tsx
// Dashboard.tsx:87
if (biopsy.status === "termine" || biopsy.status === "archive" || biopsy.status === "Validé") {
```

Or les deux seuls endroits qui écrivent `Biopsy.status` posent la même valeur :

```python
# main.py:232   et   seed_images.py:118
status="Non analysé"
```

**Aucun code ne met jamais à jour ce statut.** La condition est donc toujours
fausse → `analyzedCount = 0` → `hasActivity = false`.

**Correctifs possibles**

| Approche | Détail |
|---|---|
| **Recommandée** | Faire dériver le statut du workflow : `workflow_states.completed_at IS NOT NULL` → « Validé ». Supprimer la colonne `biopsies.status`, redondante |
| Minimale | Mettre à jour `Biopsy.status` quand la dernière étape est validée (dans `workflow/service.py:save_step`) |

---

### 🐛 A2. Les diagnostics du camembert sont inventés

```tsx
// Dashboard.tsx:91
if (biopsy.id % 2 === 0) criticalCases++; else healthyCases++;
```

**Un cas est classé « critique » ou « sain » selon la parité de son
identifiant.** C'est une donnée entièrement fabriquée, alimentant le camembert
« Diagnostics » et la tuile « Taux Cas Sains ».

**C'est une violation directe de la convention n° 2 du projet :**

> *Aucune donnée inventée. Une valeur absente s'affiche « non renseigné », jamais
> une valeur plausible générée. **Sur un dossier patient, une donnée fabriquée
> est indiscernable d'une donnée réelle.***

**Le code est actuellement inerte** à cause de [A1](#-a1-les-statistiques-du-dashboard-restent-toujours-à-zéro) —
mais **corriger A1 sans corriger A2 rendra le dashboard activement trompeur.**

**Correctif.** Compter les vrais diagnostics :

```sql
SELECT diagnosis, COUNT(*) FROM extractions
WHERE diagnosis IS NOT NULL AND diagnosis <> '' GROUP BY diagnosis;
-- benin / malin / suspect
```

> **Traitez A1 et A2 ensemble.** C'est un excellent premier exercice de
> correction sur ce projet.

---

### 🐛 A3. « Dernière modification » affiche toujours « Aucun historique »

**Symptôme.** En radiologie, on sauvegarde le compte rendu, le panneau affiche
bien la signature. On recharge la page : « Aucun historique ».

**Cause — une chaîne cassée en trois endroits.**

```tsx
// 1. Le frontend ENVOIE le champ  (RadiologyViewer.tsx:250-254)
body: JSON.stringify({ report, annotations: annotationsStr,
                       lastModifiedBy: doctorSignature })
```

```python
# 2. Le schéma serveur NE LE DÉCLARE PAS  (main.py:420-422)
class ReportPayload(BaseModel):
    report: str
    annotations: Optional[str] = ""
    # lastModifiedBy absent → Pydantic v2 l'IGNORE SILENCIEUSEMENT
```

```python
# 3. Il n'y a NI COLONNE pour le stocker, NI CLÉ dans la réponse  (main.py:435)
return {"report": radio.report or "", "annotations": radio.annotations or ""}
```

```tsx
// 4. Donc côté client, c'est toujours undefined  (RadiologyViewer.tsx:97)
if (dbData.lastModifiedBy) setLastModifiedBy(dbData.lastModifiedBy);   // jamais vrai
```

L'état local est bien mis à jour après une sauvegarde — d'où l'illusion que ça
marche jusqu'au rechargement.

**Correctif complet (4 étapes)**

```python
# 1. models.py — nouvelle colonne
last_modified_by = Column(String, nullable=True)

# 2. alembic revision --autogenerate -m "radiology last_modified_by"

# 3. main.py — schéma + lecture + écriture
class ReportPayload(BaseModel):
    report: str
    annotations: Optional[str] = ""
    lastModifiedBy: Optional[str] = None

# dans save_radiology_report :
radio.last_modified_by = payload.lastModifiedBy
# dans get_radiology_report :
return {"report": ..., "annotations": ..., "lastModifiedBy": radio.last_modified_by or None}
```

> **La leçon générale :** Pydantic v2 **ignore les champs inconnus par défaut**.
> Un champ mal orthographié dans le corps d'une requête part dans le vide sans le
> moindre avertissement. Pour l'interdire :
> `model_config = ConfigDict(extra="forbid")`.

---

### 🐛 A4. `RadiologyViewer` ignore `VITE_API_URL`

Trois appels codent l'URL en dur, contrairement à **tout le reste** du frontend :

| Ligne | Appel |
|---|---|
| [92](../frontend/src/pages/RadiologyViewer.tsx#L92) | `fetch("http://localhost:8002/radiology/${studyId}/report")` |
| [246](../frontend/src/pages/RadiologyViewer.tsx#L246) | `fetch("http://localhost:8002/radiology/${studyId}/report", {POST})` |
| [303](../frontend/src/pages/RadiologyViewer.tsx#L303) | idem, dans `handleClearAll` |

**Conséquence.** Déployer ailleurs que sur `localhost` casse **toute** la
radiologie, alors que le reste de l'application suit correctement
`VITE_API_URL`.

**Correctif.** En haut du composant :

```tsx
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8002";
// puis remplacer les 3 occurrences par `${API_URL}/radiology/...`
```

---

### 🐛 A5. Le champ `url` des extractions pointe vers un fichier inexistant

```python
# main.py:858
"url": f"http://localhost:8002/dzi_data/{e.dzi_url}",
```

**Deux problèmes cumulés :**

1. **`localhost:8002` est codé en dur** dans le backend — inutilisable ailleurs.
2. **Le fichier n'existe pas sur disque.** `POST /extract-roi` écrit le TIFF,
   le pousse dans MinIO, puis **l'efface** :

```python
# main.py:736-741
minio_client.fput_object(bucket_name=BUCKET_NAME, object_name=minio_object_name,
                         file_path=output_path)
if os.path.exists(output_path):
    os.remove(output_path)          # ← le fichier local disparaît
```

Cette URL renvoie donc systématiquement `404`.

**Pourquoi personne ne s'en aperçoit :** le frontend **n'utilise jamais ce
champ**. `openViewer()` rouvre la **lame complète** zoomée sur le `roi`.

**Correctifs possibles**

| Option | Détail |
|---|---|
| **Supprimer le champ** | Le plus honnête : il ne sert à rien et induit en erreur |
| Servir depuis MinIO | Générer une URL présignée MinIO à la volée |
| Rendre configurable | `os.getenv("PUBLIC_API_URL", "http://localhost:8002")` |

---

### 🐛 A6. « Motif » affiche toujours « Non renseigné »

```tsx
// PatientCard.tsx:38 — l'interface locale déclare le champ
interface Patient { …; motif?: string; }

// PatientCard.tsx:68
const motifConsultation = patient.motif || "Non renseigné";
```

Mais **`motif` n'existe ni dans la table `patients`, ni dans `PatientSchema`**.
Le champ est donc toujours `undefined`.

Ce n'est pas grave — le repli respecte la convention « pas de donnée inventée » —
mais **le code suggère une fonctionnalité qui n'existe pas**.

**Correctif :** soit ajouter la colonne `patients.motif` (+ migration + schéma +
formulaire de création), soit retirer le champ de l'interface TypeScript.

---

### 🐛 A7. `hasExtractions` ne se met pas à jour après une création

```tsx
// PatientCard.tsx:53
const [hasExtractions, setHasExtractions] = useState(false);
```

Il est renseigné **une seule fois**, par l'effet de montage. Si l'utilisateur
crée une extraction depuis le Viewer puis revient au Dashboard, le bouton
« Dossiers » n'apparaît pas tant que le Dashboard n'est pas complètement
rechargé.

**Pourquoi :** l'effet dépend de `[patient.folder_id]`, qui ne change pas.

**Correctif.** Ajouter un compteur de rafraîchissement propagé depuis le
Dashboard, ou remonter le chargement des extractions au niveau du Dashboard.

---

### 🐛 A8. `POST /extract-roi` avale les erreurs de découpage

```python
# main.py:718-748
if source_path.exists():
    try:
        image = pyvips.Image.new_from_file(...)
        region.tiffsave(output_path, ...)
        try:
            minio_client.fput_object(...)
        except Exception as minio_err:
            print(f"❌ Erreur MinIO : {minio_err}")      # ← avalé
    except Exception as e:
        print(f"⚠️ Erreur PyVips: {e}")                  # ← avalé
    finally:
        source_path.unlink(missing_ok=True)

# … puis, quoi qu'il arrive :
new_ext = models.Extraction(...)
db.add(new_ext); db.commit()
```

**L'extraction est créée en base même si le découpage a totalement échoué.**
L'utilisateur voit « Extraction Créée ! » alors qu'aucun fichier n'existe.

**C'est une violation de la convention n° 3 :** *« Les erreurs se voient. Pas de
`catch` vide, pas de message générique. »*

**Correctif.** Propager l'erreur, comme le fait déjà `upload_biopsy` :

```python
except Exception as error:
    db.rollback()
    raise HTTPException(status_code=500,
                        detail=f"Échec du découpage de la région : {error}")
```

---

### 🐛 A9. `DELETE /extractions/{id}` nettoie le mauvais chemin

```python
# main.py:928-940
try:
    minio_client.remove_object(BUCKET_NAME, ext.dzi_url)
except Exception:
    pass                              # ← except NU

try:
    file_path = os.path.join(DZI_FOLDER, ext.dzi_url)
    if os.path.exists(file_path):     # ← n'existe JAMAIS (voir A5)
        os.remove(file_path)
        files_dir = file_path.replace(".svs", "_files").replace(".dzi", "_files")
        if os.path.exists(files_dir):
            shutil.rmtree(files_dir)
except:
    pass                              # ← except NU, sans même Exception
```

Trois problèmes :

1. Le fichier disque **n'existe jamais** (il a été effacé par `/extract-roi`) —
   ce bloc entier est mort ;
2. Deux `except` nus qui masquent **tout**, y compris `KeyboardInterrupt` ;
3. `except:` sans `Exception` est proscrit par toutes les conventions Python.

**Correctif.** Reprendre le modèle de `delete_biopsy` : un rapport avec des
`warnings`, et supprimer le code mort.

---

### 🐛 A10. Le repli `"biopsie_cmu_1.dzi"` est un nom de fichier fantôme

```tsx
// PatientCard.tsx:127-129
const mainImageUrl = (patient.biopsies && patient.biopsies.length > 0)
    ? patient.biopsies[0].image_url
    : "biopsie_cmu_1.dzi";
```

```tsx
// Viewer.tsx:319 et 1152 — le même nom, en dur
filename: defaultDziFilename || "biopsie_cmu_1.dzi",
```

Ce nom correspond à une lame de démonstration d'une ancienne version. Un patient
sans lame ouvre un viewer **vide**, sans message d'erreur.

**Correctif.** Le bouton « Biopsie » est déjà correctement désactivé quand
`mainBiopsyUrl` est vide ([PatientCard.tsx:321](../frontend/src/components/PatientCard.tsx#L321)) —
il suffit de supprimer le repli et de laisser `openViewer()` refuser.

---

## B — Pièges à la modification

### ⚠️ B1. `location.state` est perdu au rechargement (F5)

C'est le piège n° 1 à l'usage.

```tsx
// PatientCard.tsx:131-139
navigate(`/viewer?url=${encodeURIComponent(mainImageUrl)}`, {
  state: { patientName, folderId, image_url, roi, extractionId }
});
```

```tsx
// Viewer.tsx:69-74 — les replis
const patientName = location.state?.patientName || "Patient";
const folderId    = location.state?.folderId    || "X-00";
const extractionId = location.state?.extractionId;
const isAnnotationMode = !!extractionId;         // ← devient false !
```

**Après F5 sur `/viewer?url=…` :**

| | Avant F5 | Après F5 |
|---|---|---|
| `patientName` | « Marie Dupont » | **« Patient »** |
| `folderId` | `Marie-Dupont-a3f9c1e2` | **`X-00`** |
| `extractionId` | `12` | **`undefined`** |
| Mode | annotation | **création** |
| Workflow | affiché | **disparu** |

Et `folderId = "X-00"` fait échouer `/analyze-ai` et `/extract-roi` avec un
`404` « Dossier patient introuvable ».

**Correctif.** Mettre `extractionId` et `folderId` dans la **query string** :

```tsx
navigate(`/viewer?url=${encodeURIComponent(url)}&folder=${folderId}&extraction=${id}`);
```
puis recharger le reste depuis l'API au montage.

---

### ⚠️ B2. Il faut modifier DEUX fichiers pour changer les étapes

| Fichier | Contenu |
|---|---|
| [`backend/workflow/constants.py:11`](../backend/workflow/constants.py#L11) | `STEP_IDS`, `STEP_LABELS`, `FIELD_TO_COLUMN` |
| [`frontend/.../steps.ts:11`](../frontend/src/features/workflow/steps.ts#L11) | `WORKFLOW_STEPS` (+ `olgaFormId`, `schemaId`) |

**Les identifiants doivent être strictement identiques.** Rien ne le vérifie
automatiquement.

**Ce qui casse en cas de désynchronisation**

| Écart | Symptôme |
|---|---|
| Étape en trop côté front | `PUT .../steps/{step}` → `404 unknown_step` |
| Étape en trop côté back | `useOlgaForm` déborde du tableau → affiche la dernière étape |
| Ordre différent | Le formulaire affiché ne correspond pas à l'étape enregistrée |

> La route `GET /extractions/workflow/steps` existe **précisément** pour
> permettre à un client de récupérer l'ordre de référence. Le frontend ne
> l'utilise pas encore — ce serait une bonne amélioration.

---

### ⚠️ B3. Les deux repères de coordonnées d'OpenSeadragon

| Repère | Unité | Usage |
|---|---|---|
| **Image** | pixel de la lame | **persisté** en base |
| **Viewer element** | pixel écran | **dessiné** dans le SVG |
| **Viewport** | normalisé 0-1 | `fitBounds` |

```tsx
// ÉCRAN → IMAGE (création)
viewport.viewerElementToImageCoordinates(new OpenSeadragon.Point(x, y))
// IMAGE → ÉCRAN (rendu)
viewport.imageToViewerElementCoordinates(new OpenSeadragon.Point(x, y))
// DISTANCES — surtout PAS les fonctions ci-dessus
viewport.deltaPointsFromPixels(new OpenSeadragon.Point(px, 0)).x
viewport.deltaPixelsFromPoints(new OpenSeadragon.Point(pt, 0)).x
```

**Symptômes d'une confusion**

| Erreur | Symptôme |
|---|---|
| Repère inversé | Annotations dans un coin, ou hors écran |
| `Point` au lieu de `delta` pour un rayon | Cercles minuscules ou gigantesques |
| Oubli de `+ cropX/cropY` | Contours IA décalés de l'origine du crop |

---

### ⚠️ B4. `Drawing.w` / `.h` changent de sens selon `type`

| `type` | `x`, `y` | `w`, `h` | `radius` | `points` |
|---|---|---|---|---|
| `rect` | coin haut-gauche | **dimensions** | — | — |
| `circle` | centre | — | rayon | — |
| `polygon` | `0`, `0` | `0`, `0` | — | sommets |
| **`text`** | **point d'ancrage** | **position du libellé** | — | — |

```tsx
// Viewer.tsx:889-894 — la détection
const isTextMoved = shape.w != null && shape.h != null && (shape.w !== 0 || shape.h !== 0);
const tX = isTextMoved ? shape.w! : shape.x;
const tY = isTextMoved ? shape.h! : shape.y;
```

Toute modification de la géométrie doit tenir compte de cette surcharge.

---

### ⚠️ B5. `POST /annotations/save` écrase avec des valeurs vides

```python
# main.py:807-823 — tous les champs, sans condition
ext.prelevement_type = data.prelevement_type   # "" par défaut Pydantic
ext.histo_type       = data.histo_type
ext.sbr_grade        = data.sbr_grade
…
```

Un client qui n'envoie pas `histo_type` transmet `""` et **efface** la valeur en
base. Cette route **court-circuite complètement le moteur de workflow** — sans
vérifier les transitions, sans mettre à jour `workflow_step_states`.

De plus, les `drawings` sont **entièrement remplacés** : deux praticiens
sauvegardant en même temps s'écrasent mutuellement, alors que le projet met en
avant l'annotation « collaborative ».

**Recommandation.** Restreindre cette route aux `drawings` et au `label`,
laisser le formulaire au moteur de workflow.

---

### ⚠️ B6. `def` vs `async def` dans FastAPI

| Signature | Exécution | Conséquence |
|---|---|---|
| `def` | threadpool | code bloquant **sans danger** |
| `async def` | boucle d'événements | code bloquant **gèle toute l'API** |

`POST /extract-roi` est une route **`def`** qui fait du tuilage lourd sans
`run_in_threadpool`. C'est correct **par accident de signature**.

> **Si vous la passez en `async def`, vous DEVEZ ajouter les
> `run_in_threadpool`** — sinon vous réintroduisez le
> `ERR_CONNECTION_RESET` corrigé sur les autres routes.

---

### ⚠️ B7. `noUnusedLocals` casse `build`, pas `dev`

```json
// tsconfig.app.json
"noUnusedLocals": true,
"noUnusedParameters": true,
```

Une variable inutilisée passe inaperçue en développement et **fait échouer**
`npm run build`.

```bash
docker exec p6_frontend npm run build   # à lancer AVANT de livrer
```

---

### ⚠️ B8. Le volume anonyme `node_modules`

```yaml
volumes:
  - ./frontend:/app
  - /app/node_modules      # préserve les deps de l'IMAGE
```

Ajouter une dépendance dans `package.json` **ne suffit pas** :

```bash
docker compose build frontend && docker compose up -d frontend
# ou, plus rapide :
docker exec p6_frontend npm install <paquet>
```

---

### ⚠️ B9. `<StrictMode>` monte les composants deux fois

En développement, chaque effet s'exécute **deux fois** au montage. C'est
volontaire : ça révèle les nettoyages manquants.

**Ce qui protège le projet**

```tsx
// RadiologyViewer.tsx:30 — drapeau au niveau MODULE, survit aux remontages
let isConfigured = false;

// Viewer.tsx:140 — destruction avant recréation
if (viewerRef.current) viewerRef.current.destroy();
```

Si vous ajoutez un effet qui crée une ressource externe, prévoyez le nettoyage.

---

### ⚠️ B10. Le proxy Orthanc n'existe qu'en mode conteneur

```ts
proxy: { '/orthanc': { target: 'http://p6_orthanc:8042', … } }
```

`p6_orthanc` ne résout **que** dans le réseau Docker. Lancer `npm run dev` sur
l'hôte casse la radiologie. Il faut alors changer le `target` en
`http://localhost:8042`.

Et un **build de production n'a pas de proxy du tout** : il faudrait un vrai
reverse-proxy (Nginx, Traefik).

---

### ⚠️ B11. Une course possible au démarrage du seeder

```python
# seed_images.py:260 — teste la CONNEXION, pas les TABLES
wait_for("PostgreSQL", lambda: database.engine.connect().close())
```

Les tables sont créées par Alembic au démarrage du **backend**. `depends_on` sans
`condition` n'attend pas la disponibilité. Sur une base neuve, le seeder peut
lancer `db.query(models.Biopsy).all()` avant l'existence des tables →
`UndefinedTable`.

**Contournement :** `docker compose up -d --force-recreate image_seeder`
**Correctif :** tester une table plutôt que la connexion —
`database.engine.connect().execute(text("SELECT 1 FROM patients LIMIT 1"))`.

---

### ⚠️ B12. Variables d'environnement déclarées mais jamais lues

| Variable | Déclarée | Lue par |
|---|---|---|
| `DATABASE_URL` | compose | ✅ `database.py:17` |
| `VITE_API_URL` | compose | ✅ (sauf `RadiologyViewer` — [A4](#-a4-radiologyviewer-ignore-vite_api_url)) |
| `VITE_OLGA_API_URL` | compose | ✅ `olgaClient.ts:14` |
| **`MINIO_ENDPOINT`** | compose | ❌ **personne** |
| **`MINIO_BUCKET_NAME`** | compose | ❌ **personne** |
| `MINIO_ACCESS_KEY` | compose | ⚠️ seeder uniquement |
| `MINIO_SECRET_KEY` | compose | ⚠️ seeder uniquement |
| `MINIO_HOST` | ❌ **absente** du compose | seeder (repli `minio:9000`) |
| `SEED_BASE_DIR`, `DZI_FOLDER`, `ORTHANC_URL/USER/PASSWORD` | absentes | seeder (replis) |
| `ALEMBIC_URL` | absente | `alembic/env.py:35` |

`main.py` **ignore complètement** l'environnement MinIO :

```python
# main.py:75-78
MINIO_HOST  = "minio:9000"
ACCESS_KEY  = "minioadmin"
SECRET_KEY  = "minioadmin"
BUCKET_NAME = "biopsie"
```

**C'est une violation de la convention n° 1** (« Configuration par
l'environnement »). Changer le mot de passe MinIO dans le compose **ne changerait
rien** au backend — et casserait le seeder.

**Correctif**

```python
MINIO_HOST  = os.getenv("MINIO_ENDPOINT", "minio:9000")
ACCESS_KEY  = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
SECRET_KEY  = os.getenv("MINIO_SECRET_KEY", "minioadmin")
BUCKET_NAME = os.getenv("MINIO_BUCKET_NAME", "biopsie")
```

Et aligner le seeder sur `MINIO_ENDPOINT`.

---

## C — Dettes techniques assumées

### 🏗️ C1. `main.py` fait 1 150 lignes

Routes, schémas, helpers et logique métier dans un seul fichier. **Le projet en
est conscient** et a créé `workflow/` comme structure cible.

> *« Le nouveau code va dans les modules dédiés, pas dans les fichiers
> historiques. »*

### 🏗️ C2. `Viewer.tsx` fait 1 732 lignes

Cinq responsabilités dans un composant : OpenSeadragon, dessin SVG, IA, workflow,
sauvegarde. Découpage naturel : `useOpenSeadragon`, `useAnnotations`,
`useAiAnalysis`, `<AnnotationLayer />`, `<ViewerToolbar />`, `<ViewerSidebar />`.

### 🏗️ C3. `AnalysisPayload` sert trois routes

26 champs optionnels partagés par `/analyze-ai` (qui en lit 5), `/extract-roi` et
`/annotations/save`. Le contrat est illisible dans Swagger.

### 🏗️ C4. Trois `alert()` et un `confirm()` subsistent

| Fichier | Ligne | Appel |
|---|---|---|
| `Viewer.tsx` | [404](../frontend/src/pages/Viewer.tsx#L404) | `confirm("Voulez-vous supprimer VOS annotations ?")` |
| `Viewer.tsx` | [1206](../frontend/src/pages/Viewer.tsx#L1206) | `alert("✅ Dossier mis à jour !")` |
| `Viewer.tsx` | [1218](../frontend/src/pages/Viewer.tsx#L1218) | `alert("Échec de l'enregistrement : …")` |
| `Viewer.tsx` | [1221](../frontend/src/pages/Viewer.tsx#L1221) | `alert("Serveur injoignable : …")` |
| `RadiologyViewer.tsx` | [276](../frontend/src/pages/RadiologyViewer.tsx#L276) | `window.confirm(...)` |
| `RadiologyViewer.tsx` | [136](../frontend/src/pages/RadiologyViewer.tsx#L136), [147](../frontend/src/pages/RadiologyViewer.tsx#L147) | `window.prompt(...)` (config Cornerstone) |

**C'est exactement le problème que `PatientCard` a corrigé** en passant à une
modale applicative :

> *Le dialogue natif est supprimé par le navigateur dès que l'utilisateur coche
> « Empêcher cette page de créer des boîtes de dialogue supplémentaires ».
> `confirm()` renvoie alors `false` immédiatement : le clic ne produisait plus
> rien, sans le moindre message.*

Les deux `confirm()` restants sont donc **silencieusement inopérants** si
l'utilisateur a coché cette case.

### 🏗️ C5. `RadiologyViewer` avale ses erreurs

```tsx
} else {
  console.error("Le serveur a renvoyé une erreur lors de la sauvegarde.");
}   // ← rien à l'écran
} catch (err) {
  console.error("Erreur réseau :", err);
}   // ← rien à l'écran
```

Un échec de sauvegarde du compte rendu est **invisible pour l'utilisateur**.
Comparez avec `UploadMedicalImage.tsx:56-60`, qui fait ce qu'il faut.

### 🏗️ C6. `labeled_array` transféré inutilement

`InstanSeg /segment` renvoie la matrice **complète** des labels. Pour un patch
1500×1500, c'est un JSON de plusieurs dizaines de Mo — sérialisé, transféré,
désérialisé, validé par Pydantic… puis **jeté**. Le backend ne lit que
`instances` et `instance_count`.

**Correctif :** un paramètre `include_labeled_array: bool = False`.

### 🏗️ C7. `@app.on_event("shutdown")` est déprécié

FastAPI moderne utilise le `lifespan` :

```python
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    await instanseg_client.close()

app = FastAPI(lifespan=lifespan)
```

### 🏗️ C8. Aucun test automatisé

Pas de `pytest`, pas de `vitest`, pas de CI. Or `workflow/service.py` est
**parfaitement testable** — il ne dépend ni de HTTP ni de FastAPI. C'est le point
de départ évident.

### 🏗️ C9. Le mélange axios / fetch

| Style | Fichiers |
|---|---|
| **axios** | `services/api.ts`, `UploadMedicalImage`, `PatientCard` |
| **fetch** | `workflowApi.ts`, `olgaClient.ts`, `Viewer.tsx`, `RadiologyViewer.tsx`, `PatientCard` (partiellement) |

**Attention :** axios **lève** sur un statut ≥ 400 ; `fetch` **ne lève pas** — il
faut tester `response.ok`. Deux styles de gestion d'erreur à maîtriser.

### 🏗️ C10. Colonnes redondantes

| Colonne | Doublon de |
|---|---|
| `extractions.pathologist` | champ OLGA `pathologist` **et** `workflow_step_states.validated_by` |
| `extractions.validation_date` | champ OLGA `validationDate` **et** `.validated_at` |
| `extractions.status` | `workflow_states.completed_at` |
| `biopsies.status` | jamais mis à jour ([A1](#-a1-les-statistiques-du-dashboard-restent-toujours-à-zéro)) |

---

## Sécurité

> Cette section décrit **l'état réel** du projet, pas un objectif. Elle est
> revendiquée telle quelle sur la diapositive 13 et dans le README racine.

### 🔒 S1. Aucune authentification

```tsx
// Login.tsx:14 — le mot de passe n'est NI LU NI TRANSMIS
localStorage.setItem("biopsie_user", username);
navigate('/dashboard');
```

```tsx
// App.tsx:8 — constante littérale
const isAuthenticated = true;
```

Les gardes de route ne protègent rien : `/dashboard` est accessible directement.
Le champ mot de passe est `required` (validation HTML) mais **purement
décoratif**.

### 🔒 S2. La signature des validations est falsifiable

`validated_by`, `owner`, `author` viennent tous du `localStorage`, sans
vérification. N'importe qui peut se déclarer n'importe qui.

> *« La traçabilité n'a donc pas de valeur médico-légale. »*

### 🔒 S3. Aucun contrôle d'accès par rôle

Un technicien peut valider l'étape Diagnostic. Le modèle est prêt à recevoir la
distinction (les acteurs sont identifiés diapositive 5), mais rien n'est
implémenté.

### 🔒 S4. Le seul contrôle d'autorisation est déclaratif

```python
# main.py:926-927
if ext.owner != username:
    raise HTTPException(status_code=403)
```

`username` est un **paramètre de requête** fourni par le client. Il suffit de
passer le nom du propriétaire.

### 🔒 S5. Les tuiles sont servies sans contrôle

```python
app.mount("/dzi_data", StaticFiles(directory=DZI_FOLDER), name="dzi_data")
```

Toute personne connaissant le chemin lit les tuiles d'un patient.

### 🔒 S6. CORS ouvert à toutes les origines

```python
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, …)
```

> **`allow_origins=["*"]` avec `allow_credentials=True` est une combinaison que
> la spécification CORS interdit** — les navigateurs la rejettent. Fonctionne ici
> uniquement parce qu'aucun cookie n'est utilisé.

Même configuration côté InstanSeg (`allow_credentials=False`, donc valide).

### 🔒 S7. Identifiants par défaut, en clair

| Service | Identifiants | Où |
|---|---|---|
| PostgreSQL | `user` / `password` | compose + `database.py` |
| MinIO | `minioadmin` / `minioadmin` | compose + `main.py` (en dur) |
| Orthanc | `orthanc` / `orthanc` | **en dur** dans `main.py` |

### 🔒 S8. Aucun chiffrement

Tous les services communiquent en HTTP clair sur le réseau conteneurisé.
`Minio(..., secure=False)`.

### 🔒 S9. Mention HDS mensongère

```tsx
// Login.tsx:52
<div>Système certifié HDS (Hébergeur Données Santé) v2.4</div>
```

Chiron n'est pas certifié HDS. Cette mention devrait être retirée — elle pourrait
induire un utilisateur en erreur sur la conformité réglementaire.

### 🔒 Conséquence

> **Ne jamais déposer de données de patients réels.**

**Prochaines étapes prévues** (diapositive 13) : authentification par jeton,
rôles (technicien / pathologiste / radiologue), contrôle d'accès sur les tuiles.

---

## E — Méthode de débogage

### Où regarder selon le symptôme

| Symptôme | Piste n° 1 | Piste n° 2 |
|---|---|---|
| « Aucun patient trouvé » | `curl localhost:8002/health` | `VITE_API_URL` |
| Viewer biopsie vide | Tuiles manquantes → `docker logs p6_image_seeder` | `image_url` incohérent |
| Écran noir en radiologie | Étude absente d'Orthanc (`:8042`) | Proxy Vite ([B10](#-b10-le-proxy-orthanc-nexiste-quen-mode-conteneur)) |
| Bandeau « OLGA injoignable » | **Normal** si la stack OLGA est arrêtée | Instantanés servis |
| Formulaire workflow vide | `steps.ts` désynchronisé ([B2](#-b2-il-faut-modifier-deux-fichiers-pour-changer-les-étapes)) | `olgaFormId` obsolète |
| Étape refusée (409) | **Comportement correct** — étapes précédentes non validées | |
| Annotations décalées | Repères de coordonnées ([B3](#-b3-les-deux-repères-de-coordonnées-dopenseadragon)) | Retranslation IA |
| Suppression sans effet | Rechargez sans cache (Ctrl+Maj+R) | `confirm()` désactivé ([C4](#-c4-trois-alert-et-un-confirm-subsistent)) |
| Statistiques à zéro | **Bug connu** — [A1](#-a1-les-statistiques-du-dashboard-restent-toujours-à-zéro) | |
| Modif `.tsx` invisible | `docker compose restart frontend` | Polling |
| Modif `.py` invisible | `docker compose restart backend` (pas de `--reload`) | |
| Perte de contexte après F5 | **`location.state`** — [B1](#-b1-locationstate-est-perdu-au-rechargement-f5) | |
| Import refusé (409) | **Comportement correct** — un seul élément par type | |
| `ERR_CONNECTION_RESET` pendant un import | `run_in_threadpool` manquant ([B6](#-b6-def-vs-async-def-dans-fastapi)) | |

### Les commandes qui servent vraiment

```bash
# État global
docker compose ps
curl -s http://localhost:8002/health | jq

# Journaux
docker compose logs -f backend
docker logs p6_image_seeder
docker logs p6_instanseg

# Base
docker exec -it p6_postgres psql -U user -d p6_db
docker exec p6_backend sh -c 'cd /app && alembic current'

# Objets MinIO
docker exec p6_minio mc alias set local http://localhost:9000 minioadmin minioadmin
docker exec p6_minio mc ls --recursive local/biopsie

# Orthanc
curl -u orthanc:orthanc http://localhost:8042/studies | jq

# Tuiles présentes
docker exec p6_backend ls -la /app/dzi_data

# Vérification statique
docker exec p6_frontend npm run lint
docker exec p6_frontend npm run build     # inclut le type-check
```

### Une règle avant chaque correction

1. **Reproduire** avant de modifier.
2. **Lire les commentaires du code** — ce projet documente ses corrections
   passées sur place ; la réponse y est souvent déjà.
3. **Vérifier les deux côtés** : une transition refusée peut venir du serveur
   *ou* d'une désynchronisation `steps.ts` / `constants.py`.
4. **`npm run build`** avant de livrer — `dev` ne vérifie pas les types.
5. **Ne pas étendre `main.py` ni `Viewer.tsx`** : créer un module dédié.
