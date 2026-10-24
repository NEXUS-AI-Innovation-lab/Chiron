# 07 — Stack et librairies

Pour chaque librairie : **à quoi elle sert**, **où elle est utilisée dans le
projet**, et **comment l'utiliser**.

---

## Vue d'ensemble

### Frontend — `dependencies` (embarquées dans le bundle)

| Librairie | Version | Rôle |
|---|---|---|
| `react` / `react-dom` | 19.2 | Bibliothèque d'interface |
| `react-router-dom` | 7.11 | Routage côté client |
| `axios` | 1.13 | Client HTTP (avec progression d'upload) |
| `@mui/material` | 7.3 | Composants Material UI |
| `@mui/icons-material` | 7.3 | **~2 100 icônes** — le vrai usage de MUI ici |
| `@emotion/react` / `@emotion/styled` | 11.14 | Moteur CSS-in-JS **requis par MUI** |
| `openseadragon` | 5.0 | Visionneuse de pyramide de tuiles (lames) |
| `cornerstone-core` | 2.6 | Moteur de rendu d'images médicales |
| `cornerstone-tools` | 6.0 | Outils : fenêtrage, mesures, ROI, annotations |
| `cornerstone-math` | 0.1 | Utilitaires géométriques **requis par tools** |
| `cornerstone-wado-image-loader` | 4.13 | Chargeur DICOM via WADO |
| `dicom-parser` | 1.8 | Parseur binaire DICOM |
| `hammerjs` | 2.0 | Gestes tactiles **requis par tools** |
| `jspdf` | 3.0 | Génération de PDF |
| `dom-to-image` | 2.6 | Capture d'un nœud DOM en image |
| `recharts` | 3.6 | Graphiques du tableau de bord |

### Frontend — `devDependencies` (outillage)

| Librairie | Version | Rôle |
|---|---|---|
| `vite` | 7.2 | Serveur de dev + bundler |
| `@vitejs/plugin-react` | 5.1 | Fast Refresh + transformation JSX |
| `typescript` | 5.9 | Vérification de types |
| `tailwindcss` + `@tailwindcss/postcss` | 4.1 | CSS utilitaire |
| `postcss`, `autoprefixer` | | Chaîne de traitement CSS |
| `eslint` + `typescript-eslint` | 9.39 / 8.46 | Analyse statique |
| `eslint-plugin-react-hooks` | 7.0 | Vérifie les règles des hooks |
| `eslint-plugin-react-refresh` | 0.4 | Vérifie la compatibilité Fast Refresh |
| `@types/*` | | Déclarations de types |
| `globals` | 16.5 | Variables globales connues d'ESLint |

> `esbuild` est utilisé par le script `olga:schemas` sans figurer dans
> `package.json` : il est fourni **transitivement par Vite**. Fonctionnel, mais
> fragile — une mise à jour de Vite pourrait le déplacer.

### Backend — `requirements.txt` (versions épinglées)

| Paquet | Version | Rôle |
|---|---|---|
| `fastapi` | 0.128.8 | Framework web |
| `uvicorn` | 0.39.0 | Serveur ASGI |
| `sqlalchemy` | 2.0.49 | ORM |
| `psycopg2-binary` | 2.9.12 | Pilote PostgreSQL |
| `pydantic` | 2.13.4 | Validation et sérialisation |
| `python-multipart` | 0.0.20 | Parsing `multipart/form-data` (uploads) |
| `requests` | 2.32.5 | Client HTTP **synchrone** (Orthanc) |
| `httpx` | 0.28.1 | Client HTTP **asynchrone** (InstanSeg) |
| `pyvips` | 3.1.1 | Traitement d'images géantes |
| `minio` | 7.2.20 | Client S3 |
| `numpy` | 2.0.2 | Statistiques sur les instances |
| `alembic` | 1.16.5 | Migrations de schéma |

> *« Versions épinglées sur celles réellement validées en exécution : un build
> doit produire deux fois le même environnement. »*

### InstanSeg — `requirements.txt`

```
fastapi
uvicorn[standard]
python-multipart
torch --index-url https://download.pytorch.org/whl/cpu   ← variante CPU
Pillow
numpy<2.0.0                                              ← contrainte du modèle
instanseg-torch @ git+https://github.com/instanseg/instanseg.git
```

> ⚠️ **Aucune version épinglée ici**, et `instanseg-torch` vient directement de
> `main` sur GitHub. Deux builds à deux dates peuvent produire des
> environnements différents. À corriger si la reproductibilité compte.
>
> Notez aussi le conflit apparent : backend `numpy==2.0.2`, InstanSeg
> `numpy<2.0.0`. Ce n'est **pas** un problème : ce sont deux images Docker
> distinctes.

---

## FRONTEND — détail par librairie

### React 19

| | |
|---|---|
| **À quoi ça sert** | Décrire l'interface comme une fonction de l'état. React calcule les différences et met à jour le DOM. |
| **Où** | Partout. Point d'entrée : [`main.tsx`](../frontend/src/main.tsx) |

**Ce qui change en React 19** (par rapport à 18) :

- `ref` est une **prop normale** — plus besoin de `forwardRef` ;
- `<Context.Provider>` peut s'écrire `<Context>` ;
- meilleurs messages d'erreur pour les hydratations.

Chiron n'utilise aucune nouveauté de React 19 (ni `use()`, ni les Actions, ni les
Server Components). Le code reste du React 18 classique.

**Comment l'utiliser — les 5 hooks du projet**

```tsx
const [x, setX]   = useState<T>(initial);      // état local
useEffect(() => { … return cleanup; }, [deps]); // effet de bord
const ref         = useRef<T | null>(null);     // valeur persistante, sans rendu
const memo        = useMemo(() => calcul, [deps]);   // valeur mémoïsée
const cb          = useCallback(fn, [deps]);         // fonction mémoïsée
```

Voir [06 — Frontend, Partie A](06-frontend.md#3-les-concepts-react-indispensables)
pour les détails et les pièges.

---

### React Router 7

| | |
|---|---|
| **À quoi ça sert** | Associer une URL à un composant, sans rechargement de page. |
| **Où** | [`App.tsx`](../frontend/src/App.tsx) (définition) ; `useNavigate` / `useLocation` dans toutes les pages. |

**Comment l'utiliser**

```tsx
// 1. Déclarer les routes
<Router>
  <Routes>
    <Route path="/viewer" element={<Viewer />} />
    <Route path="*" element={<Navigate to="/dashboard" />} />
  </Routes>
</Router>

// 2. Naviguer avec de l'état invisible dans l'URL
const navigate = useNavigate();
navigate(`/viewer?url=${encodeURIComponent(url)}`, {
  state: { patientName, folderId, roi, extractionId }
});

// 3. Lire les paramètres
const location = useLocation();
const searchParams = new URLSearchParams(location.search);
const rawUrl = searchParams.get("url");         // query string
const roi    = location.state?.roi;              // state (invisible)
```

**Query string vs `location.state`**

| | Query string | `location.state` |
|---|---|---|
| Visible dans l'URL | ✅ | ❌ |
| Partageable / marque-page | ✅ | ❌ |
| Survit à F5 | ✅ | **❌** |
| Types acceptés | chaînes uniquement | objets JS |

> ⚠️ **Chiron dépend fortement de `location.state`.** Recharger la page
> `/viewer?url=…` perd `patientName`, `folderId`, `roi` et `extractionId` : la
> page retombe sur `"Patient"` / `"X-00"` et **quitte le mode annotation**.
> C'est un des bugs les plus faciles à reproduire.

---

### axios 1.13

| | |
|---|---|
| **À quoi ça sert** | Client HTTP à API promise, avec intercepteurs, transformation JSON automatique et **suivi de progression**. |
| **Où** | [`services/api.ts`](../frontend/src/services/api.ts) — toutes les fonctions ; [`UploadMedicalImage.tsx`](../frontend/src/components/UploadMedicalImage.tsx) et [`PatientCard.tsx`](../frontend/src/components/PatientCard.tsx) pour `isAxiosError`. |

**Pourquoi axios et pas `fetch` ici :** le suivi de progression d'upload.
`fetch` ne l'expose pas (il faut passer par `XMLHttpRequest` ou les streams).

```ts
export const uploadMedicalImage = async (patientId, type, file, onProgress) => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await axios.post(
    `${API_URL}/patients/${patientId}/upload-${type}`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (event) => {
        if (event.total) onProgress(Math.round((event.loaded * 100) / event.total));
      } },
  );
  return response.data;
};
```

**Lire proprement une erreur du backend** — le pattern à reproduire :

```ts
const messageErreur = (cause: unknown, repli: string): string =>
  axios.isAxiosError(cause) && typeof cause.response?.data?.detail === 'string'
    ? cause.response.data.detail
    : repli;
```

> **Le projet mélange `axios` et `fetch`.** `services/api.ts` et les composants
> de suppression utilisent axios ; `workflowApi.ts`, `olgaClient.ts`,
> `Viewer.tsx` et `RadiologyViewer.tsx` utilisent `fetch`. Ce n'est pas grave,
> mais ça impose de connaître les deux styles de gestion d'erreur :
> **axios lève** sur un statut ≥ 400, **`fetch` ne lève pas** — il faut tester
> `response.ok`.

---

### MUI 7 + Emotion

| | |
|---|---|
| **À quoi ça sert** | Bibliothèque de composants Material Design. |
| **Ce que Chiron en utilise** | **Uniquement `@mui/icons-material`.** Aucun composant `@mui/material` (ni `Button`, ni `Dialog`, ni `TextField`) n'est importé. |
| **Où** | Toutes les pages et composants. |

**Pourquoi `@mui/material` et Emotion sont quand même dans `package.json` :**
ce sont des **peer dependencies** de `@mui/icons-material`. Elles ne peuvent pas
être retirées sans casser l'installation, même inutilisées.

**Comment l'utiliser**

```tsx
// Import NOMMÉ PAR FICHIER — jamais depuis l'index
import DeleteIcon from '@mui/icons-material/Delete';
import PersonIcon from '@mui/icons-material/Person';

<DeleteIcon fontSize="small" />
<PersonIcon className="text-cyan-400" />
<MedicalServicesIcon style={{ fontSize: 40 }} />
```

> **Toujours importer icône par icône.** `import { Delete } from '@mui/icons-material'`
> charge le module d'index qui référence ~2 100 icônes : en dev, Vite les
> transforme toutes, et le premier chargement devient interminable.

**Les icônes utilisées dans le projet**

| Fichier | Icônes |
|---|---|
| `Dashboard.tsx` | SmartToy, FolderShared, Person, Analytics, AccessTime, Logout, Add, CloudUpload |
| `PatientCard.tsx` | Visibility, Edit, Description, Person, CalendarToday, MedicalServices, Assignment, Delete, DeleteOutline |
| `Viewer.tsx` | ArrowBack, DeleteForever, CheckCircle, CropSquare, RadioButtonUnchecked, Polyline, TextFields, PanTool, Undo, CameraAlt, Description, SmartToy, Visibility, VisibilityOff, ZoomIn, ZoomOut, Person |
| `RadiologyViewer.tsx` | ArrowBack, CheckCircle, PictureAsPdf, Brush, Description, Contrast, OpenWith, Straighten, CropSquare, RadioButtonUnchecked, TextFormat, DeleteOutline, DeleteSweep, Person |
| `Login.tsx` | MedicalServices |
| `AddPatientModal.tsx` | Close, PersonAdd |
| `UploadMedicalImage.tsx` | Close, CloudUpload |

Catalogue : https://mui.com/material-ui/material-icons/

---

### OpenSeadragon 5

| | |
|---|---|
| **À quoi ça sert** | Visionneuse à **zoom continu** sur des images gigantesques découpées en pyramide de tuiles. C'est la référence du domaine WSI. |
| **Où** | [`Viewer.tsx`](../frontend/src/pages/Viewer.tsx) uniquement. |

**Comment l'utiliser — l'initialisation de Chiron**

```tsx
const viewer = OpenSeadragon({
  id: "openseadragon-viewer",                    // id du div conteneur
  prefixUrl: "https://openseadragon.github.io/openseadragon/images/",
  tileSources: `${baseUrl}/dzi_data/${rawUrl}`,  // URL du manifeste .dzi
  showNavigator: !isAnnotationMode,              // mini-carte
  animationTime: 0.5,
  blendTime: 0.1,
  maxZoomPixelRatio: 10,                         // zoom au-delà de 1:1
  gestureSettingsMouse: { clickToZoom: false },  // le clic sert à dessiner
  crossOriginPolicy: "Anonymous",                // CORS pour les tuiles
  showHomeControl: false,
  visibilityRatio: 0,
  constrainDuringPan: false,
  minZoomImageRatio: 0,
});
viewerRef.current = viewer;
```

> **`prefixUrl` pointe vers un CDN externe.** Les boutons de l'interface OSD
> (zoom, plein écran) sont des images téléchargées depuis
> `openseadragon.github.io`. **Sans connexion Internet, ils ne s'affichent
> pas.** Ce n'est pas bloquant ici (`showHomeControl: false` et les contrôles
> personnalisés du projet), mais c'est à savoir.

**Les événements**

```tsx
viewer.addHandler("animation",       updateOverlay);  // pendant le zoom/pan
viewer.addHandler("update-viewport", updateOverlay);
viewer.addHandler("resize",          updateOverlay);
viewer.addHandler("open", () => { /* l'image est chargée */ });
```

**Les conversions de coordonnées — la partie critique**

```tsx
// ÉCRAN → IMAGE  (à la création d'une forme, pour persister)
const p = viewer.viewport.viewerElementToImageCoordinates(
  new OpenSeadragon.Point(screenX, screenY));

// IMAGE → ÉCRAN  (à chaque rendu SVG)
const s = viewer.viewport.imageToViewerElementCoordinates(
  new OpenSeadragon.Point(imgX, imgY));

// IMAGE → VIEWPORT normalisé (pour fitBounds)
const rect = viewer.viewport.imageToViewportRectangle(x, y, w, h);
viewer.viewport.fitBounds(rect, true);      // true = immédiat, sans animation

// DISTANCES (pas des points !) — un rayon, une épaisseur
viewer.viewport.deltaPointsFromPixels(new OpenSeadragon.Point(px, 0)).x;  // écran→image
viewer.viewport.deltaPixelsFromPoints(new OpenSeadragon.Point(pt, 0)).x;  // image→écran
```

> **Trois repères, pas deux.** *Image* (pixels de la lame), *viewport*
> (normalisé 0-1 sur la largeur), *viewer element* (pixels écran). Confondre
> viewport et viewer element est le bug le plus fréquent.

**Contrôle programmatique**

```tsx
viewer.viewport.zoomBy(1.15, viewer.viewport.getCenter());
viewer.viewport.applyConstraints();
viewer.setMouseNavEnabled(canPan);       // désactive le pan pendant le dessin
viewer.destroy();                        // ⚠️ OBLIGATOIRE au nettoyage
```

**Le nettoyage n'est pas optionnel**

```tsx
useEffect(() => {
  if (viewerRef.current) viewerRef.current.destroy();   // avant de recréer
  const viewer = OpenSeadragon({ … });
  viewerRef.current = viewer;
  return () => { viewerRef.current?.destroy(); };       // au démontage
}, [rawUrl, isAnnotationMode, initialROI]);
```

Sans `destroy()`, chaque navigation laisse un viewer vivant qui continue de
télécharger des tuiles.

Documentation : https://openseadragon.github.io/docs/

---

### Cornerstone.js (5 paquets)

| | |
|---|---|
| **À quoi ça sert** | Afficher et manipuler des images médicales **DICOM** dans un navigateur, avec les gestes attendus par un radiologue. |
| **Où** | [`RadiologyViewer.tsx`](../frontend/src/pages/RadiologyViewer.tsx) uniquement. |

**Qui fait quoi**

| Paquet | Rôle |
|---|---|
| `cornerstone-core` | Moteur de rendu : `enable`, `loadImage`, `displayImage`, `updateImage` |
| `cornerstone-tools` | Les outils interactifs et leur état |
| `cornerstone-math` | Géométrie (vecteurs, matrices) — **dépendance de tools** |
| `cornerstone-wado-image-loader` | Récupère un DICOM par HTTP (`wadouri:`) et le décode |
| `dicom-parser` | Parse le format binaire DICOM — **dépendance du loader** |
| `hammerjs` | Gestes tactiles — **dépendance de tools** |

**L'injection de dépendances manuelle — obligatoire**

Cornerstone est une bibliothèque **impérative** d'avant les modules ES. Il faut
câbler les paquets entre eux à la main :

```tsx
let isConfigured = false;
function configureCornerstone() {
  if (isConfigured) return;
  cornerstoneTools.external.cornerstone       = cornerstone;
  cornerstoneTools.external.Hammer            = Hammer;
  cornerstoneTools.external.cornerstoneMath   = cornerstoneMath;
  cornerstoneWADOImageLoader.external.cornerstone = cornerstone;
  cornerstoneWADOImageLoader.external.dicomParser = dicomParser;
  cornerstoneWADOImageLoader.configure({ useWebWorkers: false });
  cornerstoneTools.init({ showSVGCursors: true });
  isConfigured = true;
}
```

> **`useWebWorkers: false`** simplifie la configuration (pas de fichier worker à
> servir) mais **décode le DICOM sur le thread principal**. Pour une seule
> coupe, c'est acceptable. Pour une série complète, l'interface gèlerait.

**Le cycle de vie**

```tsx
cornerstone.enable(element);                              // 1. activer le div
const image = await cornerstone.loadImage(dicomUrl);      // 2. charger
cornerstone.displayImage(element, image);                 // 3. afficher
cornerstone.updateImage(element);                         // 4. redessiner
cornerstone.disable(element);                             // 5. nettoyer (cleanup)
```

**L'URL `wadouri:`**

```tsx
const dicomUrl = `wadouri:${window.location.origin}/orthanc/instances/${id}/file`;
//                ↑ schéma reconnu par le loader
```

Le préfixe indique à `cornerstone-wado-image-loader` de télécharger l'URL puis de
la parser avec `dicom-parser`.

**Enregistrer et activer des outils**

```tsx
// 1. Enregistrer sur l'élément
[cornerstoneTools.WwwcTool, cornerstoneTools.ZoomTool, cornerstoneTools.PanTool,
 cornerstoneTools.ZoomMouseWheelTool, cornerstoneTools.LengthTool,
 cornerstoneTools.RectangleRoiTool, cornerstoneTools.EllipticalRoiTool,
 cornerstoneTools.EraserTool
].forEach((ToolClass) => {
  try { cornerstoneTools.addToolForElement(element, ToolClass); }
  catch { /* déjà enregistré : sans conséquence */ }
});

// 2. Activer
cornerstoneTools.setToolActiveForElement(element, "Wwwc", { mouseButtonMask: 1 });
//   mouseButtonMask : 1 = bouton gauche, 2 = droit, 4 = milieu, 0 = molette

// 3. Désactiver (passif = visible mais non interactif)
cornerstoneTools.setToolPassiveForElement(element, "Length");
```

**Un outil avec configuration** (`ArrowAnnotate` demande le texte) :

```tsx
const arrowConfig = {
  getTextCallback: (done: (text: string) => void) => {
    setTimeout(() => {
      const text = window.prompt("Entrez votre annotation :");
      if (text !== null && text.trim() !== "") done(text);
    }, 10);
  },
  changeTextCallback: (data, _eventData, done) => { /* idem, pré-rempli */ },
};
cornerstoneTools.addToolForElement(element, cornerstoneTools.ArrowAnnotateTool,
                                   { configuration: arrowConfig });
```

> Le `setTimeout(…, 10)` évite que `window.prompt` (bloquant) ne s'exécute au
> milieu d'un cycle d'événement Cornerstone.

**La persistance de l'état des outils**

```tsx
// Sauvegarder
const rawState = cornerstoneTools.globalImageIdSpecificToolStateManager.toolState;
const annotationsStr = JSON.stringify(rawState);

// Restaurer
cornerstoneTools.globalImageIdSpecificToolStateManager.toolState = JSON.parse(str);
cornerstone.updateImage(element);

// Tout effacer
["Length", "RectangleRoi", "EllipticalRoi", "ArrowAnnotate"]
  .forEach((tool) => cornerstoneTools.clearToolState(element, tool));
cornerstone.updateImage(element);
```

> ⚠️ **`globalImageIdSpecificToolStateManager` est GLOBAL.** L'état est indexé
> par `imageId` (l'URL WADO). Écraser `toolState` entièrement, comme le fait la
> restauration, **remplace l'état de toutes les images chargées** dans la
> session. Avec une seule étude à la fois, ça passe.

> ⚠️ **Ces paquets n'ont pas de types** — ils sont déclarés `any` dans
> [`declarations.d.ts`](../frontend/src/declarations.d.ts). Aucune vérification
> TypeScript : une faute de frappe sur un nom d'outil ne se voit qu'à
> l'exécution.

Documentation (version legacy utilisée ici) :
https://github.com/cornerstonejs/cornerstoneTools

---

### Recharts 3.6

| | |
|---|---|
| **À quoi ça sert** | Graphiques déclaratifs construits sur D3, en composants React. |
| **Où** | [`Dashboard.tsx`](../frontend/src/pages/Dashboard.tsx) — un seul `BarChart` (activité hebdomadaire). La répartition des diagnostics n'utilise plus Recharts : c'est une barre part-à-tout en HTML, voir l'encadré ci-dessous. |

**Comment l'utiliser**

```tsx
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
         ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

// Diagramme en barres
<div className="h-64">                          {/* ⚠️ hauteur EXPLICITE */}
  <ResponsiveContainer width="100%" height="100%">
    <BarChart data={activityData}>
      <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
      <XAxis dataKey="name" stroke="#94a3b8" tick={{fontSize: 12}} />
      <YAxis stroke="#94a3b8" allowDecimals={false} />
      <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155' }} />
      <Bar dataKey="analyses" fill="#0ea5e9" radius={[4, 4, 0, 0]} barSize={40} />
    </BarChart>
  </ResponsiveContainer>
</div>

// Camembert avec couleur par tranche
<PieChart>
  <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={80}
       paddingAngle={5} dataKey="value">
    {pieData.map((entry, i) => (
      <Cell key={i} fill={entry.name === 'Sains' ? '#10b981' : '#ef4444'} />
    ))}
  </Pie>
  <Tooltip /><Legend verticalAlign="bottom" height={36} iconType="circle" />
</PieChart>
```

> **Le camembert a été supprimé lors de la refonte graphique.** Trois raisons,
> toutes vérifiables :
>
> 1. **Deux parts ne se comparent pas en angles.** Une barre empilée
>    horizontale se lit d'un seul coup d'œil ; un camembert oblige à estimer
>    deux secteurs.
> 2. **Il faisait doublon** avec la tuile « Taux de cas sains », qui affiche
>    déjà le même ratio en clair.
> 3. **Vert et rouge sont le pire couple possible** pour un daltonien
>    deutéranope : l'écart perceptuel mesuré entre les deux teintes plafonne à
>    6,1 (ΔE OKLab ×100), là où 8 est le minimum recommandé. La barre actuelle
>    reste lisible parce que chaque part porte son **libellé écrit, son nombre
>    de cas et son pourcentage**. Ne retirez jamais ces étiquettes au profit de
>    la seule couleur.
>
> Le remplacement est du HTML et du CSS, sans dépendance : une rangée de deux
> `div` dont la largeur est le pourcentage, séparées par un interstice de 2 px,
> suivie d'une liste de définitions. Recharts n'est plus chargé que pour le
> graphique en barres.


**Format des données** — un tableau d'objets plats :

```ts
const activityData = [{ name: 'Lun', analyses: 3 }, { name: 'Mar', analyses: 7 }];
const pieData      = [{ name: 'Sains', value: 12 }, { name: 'Anomalies', value: 4 }];
```

> **`ResponsiveContainer` a besoin d'un parent de hauteur définie.** D'où le
> `className="h-64"`. Sans hauteur explicite, le graphique ne s'affiche pas —
> piège classique de Recharts.

> ⚠️ Dans Chiron, ces graphiques **ne s'affichent jamais** : `hasActivity` reste
> `false` car aucun statut de biopsie ne correspond aux valeurs testées. Voir
> [09 — Pièges](09-pieges-et-bugs.md).

Documentation : https://recharts.org/

---

### jsPDF 3.0

| | |
|---|---|
| **À quoi ça sert** | Générer un PDF côté client, sans serveur. |
| **Où** | [`RadiologyViewer.tsx` `handleExportPDF()`](../frontend/src/pages/RadiologyViewer.tsx#L355-L383) |

```tsx
import jsPDF from "jspdf";

const doc = new jsPDF();                            // A4 portrait, unité = mm
doc.setFontSize(22);
doc.setTextColor(15, 23, 42);                       // RGB
doc.text("Compte-Rendu Radiologique", 20, 20);      // (texte, x, y)

doc.setDrawColor(203, 213, 225);
doc.line(20, 49, 190, 49);                          // (x1, y1, x2, y2)

// Retour à la ligne automatique sur 170 mm de large
const splitText = doc.splitTextToSize(report || "Aucune observation saisie.", 170);
doc.text(splitText, 20, 72);

doc.save(`Compte_Rendu_${patientId}.pdf`);          // déclenche le téléchargement
```

**Les méthodes utiles**

| Méthode | Rôle |
|---|---|
| `text(str, x, y)` | Écrire |
| `splitTextToSize(str, largeur)` | Découper en lignes |
| `setFontSize(n)` / `setTextColor(r,g,b)` | Style |
| `line(x1,y1,x2,y2)` / `setDrawColor(r,g,b)` | Traits |
| `addImage(data, 'JPEG', x, y, w, h)` | **Insérer une image** (non utilisé ici) |
| `addPage()` | Nouvelle page |
| `save(nom)` | Télécharger |

> L'export actuel ne contient **que du texte**. Pour y ajouter la capture de
> l'image DICOM, on pourrait combiner `dom-to-image` et `addImage` — ce que fait
> déjà le Viewer pour son export JPEG.

---

### dom-to-image 2.6

| | |
|---|---|
| **À quoi ça sert** | Capturer un nœud DOM (avec son CSS) en image. |
| **Où** | [`Viewer.tsx` `handleDownloadSnapshot()`](../frontend/src/pages/Viewer.tsx#L370-L391) |

```tsx
// @ts-expect-error   ← aucun type disponible pour ce paquet
import domtoimage from "dom-to-image";

domtoimage.toJpeg(containerRef.current, {
  quality: 0.95,
  filter: (node: Node) =>
    !(node instanceof HTMLElement && node.classList.contains("ui-layer")),
  //   ↑ EXCLUT la barre d'outils flottante de la capture
}).then((dataUrl: string) => {
  const link = document.createElement("a");
  link.download = `annotation_${patientName}.jpg`;
  link.href = dataUrl;
  link.click();
});
```

**Le mécanisme du `filter`** : la barre d'outils porte `className="… ui-layer"`.
Le filtre la rejette, ce qui produit une capture propre de la lame **avec ses
annotations SVG** mais sans l'interface.

**Méthodes disponibles :** `toPng`, `toJpeg`, `toBlob`, `toSvg`, `toPixelData`.

> ⚠️ **Bibliothèque non maintenue et sans types** (d'où le `@ts-expect-error`).
> Elle ne capture pas toujours le contenu d'un `<canvas>` avec CORS. Alternative
> moderne : `html-to-image` ou `html2canvas`.

---

### Tailwind CSS 4

Voir [06 — Frontend §5](06-frontend.md#5-tailwind-css-4-en-3-minutes).

**Configuration du projet** — trois fichiers seulement :

```css
/* src/index.css */
@import "tailwindcss";

@theme {
  --color-med-dark:  #0f172a;
  --color-med-light: #1e293b;
  --color-neon-blue: #0ea5e9;
}

body { @apply bg-med-dark text-slate-200 font-sans; }
```

```js
// postcss.config.js
export default { plugins: { '@tailwindcss/postcss': {}, autoprefixer: {} } }
```

> **Pas de `tailwind.config.js`.** C'est normal en v4 : la configuration passe
> par le bloc `@theme` en CSS. Le token `--color-med-dark` devient
> automatiquement les classes `bg-med-dark`, `text-med-dark`, etc.

---

## BACKEND — détail par librairie

### FastAPI 0.128

| | |
|---|---|
| **À quoi ça sert** | Framework web ASGI : routage, validation via Pydantic, documentation OpenAPI automatique. |
| **Où** | [`main.py`](../backend/main.py), [`workflow/router.py`](../backend/workflow/router.py) |

```python
# Route avec injection de session
@app.post("/patients", response_model=PatientSchema, status_code=201)
def create_patient(payload: PatientCreate, db: Session = Depends(database.get_db)):
    ...

# Upload de fichier
@app.post("/patients/{patient_id}/upload-biopsy")
async def upload_biopsy(patient_id: int, file: UploadFile = File(...), ...):
    while chunk := await file.read(8 * 1024 * 1024): ...

# Paramètre de requête obligatoire
@app.delete("/extractions/{extraction_id}")
def delete_extraction(extraction_id: int, username: str, ...):
    #                                     ↑ pas de défaut = query param requis

# Tâche de fond
@app.delete("/patients/{patient_id}")
def delete_patient(patient_id: int, taches: BackgroundTasks, ...):
    taches.add_task(_effacer_en_arriere_plan, differes)

# Routeur modulaire
router = APIRouter(prefix="/extractions", tags=["workflow"])
app.include_router(router)
```

**`def` vs `async def` — la règle cruciale**

| Signature | Où FastAPI l'exécute | Conséquence |
|---|---|---|
| `def` | dans un **threadpool** | Le code bloquant est sans danger |
| `async def` | sur la **boucle d'événements** | Tout appel bloquant **gèle l'API entière** |

```python
# Dans une route async, tout appel synchrone passe par run_in_threadpool
from starlette.concurrency import run_in_threadpool
await run_in_threadpool(minio_client.fput_object, bucket, name, path)
```

Documentation : https://fastapi.tiangolo.com/

---

### SQLAlchemy 2.0

| | |
|---|---|
| **À quoi ça sert** | ORM : mapper des classes Python sur des tables. |
| **Où** | [`models.py`](../backend/models.py), [`database.py`](../backend/database.py), toutes les routes. |

```python
# Modèle
class Patient(Base):
    __tablename__ = "patients"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    biopsies = relationship("Biopsy", back_populates="patient", cascade="all, delete")

# Requêtes (style 1.x, encore supporté en 2.0)
db.query(models.Patient).filter(models.Patient.id == pid).first()
db.query(models.Patient).all()
db.query(models.Patient).count()
db.query(models.Drawing).filter(models.Drawing.extraction_id == eid).delete()

# Écriture
db.add(objet); db.commit(); db.refresh(objet)
db.delete(objet); db.commit()
db.rollback()

# SQL brut (pour /health)
from sqlalchemy import text
connection.execute(text("SELECT 1"))
```

**Options de relation utilisées**

| Option | Effet |
|---|---|
| `back_populates="patient"` | Relation bidirectionnelle explicite |
| `cascade="all, delete"` | Supprimer le parent supprime les enfants (**ORM seulement**) |
| `cascade="all, delete-orphan"` | + un enfant détaché est supprimé |
| `uselist=False` | Relation 1-1 (`Extraction.workflow`) |
| `order_by="WorkflowStepState.position"` | Tri de la collection |

> Le projet utilise l'API **1.x** (`db.query(...)`), pas le style 2.0
> (`select(...)` + `db.execute(...)`). Les deux fonctionnent ; ne les mélangez
> pas dans un même fichier.

---

### Pydantic 2.13

| | |
|---|---|
| **À quoi ça sert** | Valider les entrées, sérialiser les sorties, générer le schéma OpenAPI. |
| **Où** | Schémas de [`main.py`](../backend/main.py#L90-L132), [`workflow/schemas.py`](../backend/workflow/schemas.py), [`instanseg_client.py`](../backend/instanseg_client.py) |

```python
class PatientCreate(BaseModel):
    name: str                              # obligatoire
    age: int                               # obligatoire
    birth_date: Optional[str] = None       # optionnel

class BiopsySchema(BaseModel):
    id: int
    status: str
    class Config:
        from_attributes = True             # construction depuis un objet SQLAlchemy

class StepSavePayload(BaseModel):
    data: Dict[str, Any] = Field(default_factory=dict)
    validate_step: bool = True
```

**Deux comportements à connaître absolument**

1. **Les champs inconnus sont ignorés par défaut.** Le frontend peut envoyer
   `filename` ou `lastModifiedBy` : Pydantic les jette sans erreur. C'est
   exactement ce qui masque le bug de `lastModifiedBy`.
   Pour l'interdire : `model_config = ConfigDict(extra="forbid")`.
2. **`from_attributes`** (ex-`orm_mode` de v1) autorise `return patient` avec un
   `response_model`.

> Le projet utilise `class Config` (style v1, toléré). Le style v2 moderne est
> `model_config = ConfigDict(from_attributes=True)`.

---

### PyVips 3.1

| | |
|---|---|
| **À quoi ça sert** | Traiter des images de plusieurs Go **en flux**, sans les charger en mémoire. C'est ce qui rend le tuilage possible. |
| **Où** | [`main.py`](../backend/main.py) (upload, `/analyze-ai`, `/extract-roi`), [`seed_images.py`](../backend/seed_images.py) |
| **Dépendance système** | `libvips-dev`, installée dans le `Dockerfile` |

```python
import pyvips

# Ouvrir EN FLUX — indispensable pour une lame de plusieurs Go
image = pyvips.Image.new_from_file(str(chemin), access="sequential")
image.width, image.height

# Générer la pyramide DZI
image.dzsave(str(destination_SANS_extension),
             tile_size=256, overlap=1, suffix=".jpg")

# Découper une région
region = image.extract_area(x, y, largeur, hauteur)

# Encoder en mémoire (pour l'envoi à InstanSeg)
png_bytes = region.write_to_buffer(".png")

# Sauver en TIFF pyramidal (extraction)
region.tiffsave(chemin, compression="jpeg", Q=90,
                tile=True, pyramid=True, bigtiff=True)
```

**Les paramètres, expliqués**

| Paramètre | Valeur | Pourquoi |
|---|---|---|
| `access="sequential"` | — | Lecture en flux. Sans ça, PyVips charge tout en RAM |
| `tile_size=256` | 256 px | Compromis standard nombre de requêtes / taille |
| `overlap=1` | 1 px | Évite les liserés entre tuiles adjacentes |
| `suffix=".jpg"` | JPEG | Poids réduit ; le PNG multiplierait la taille par ~5 |
| `bigtiff=True` | — | **Obligatoire au-delà de 4 Go** (limite du TIFF classique) |
| `pyramid=True` | — | Génère les niveaux de zoom dans le TIFF |
| `Q=90` | qualité 90 | Compromis qualité / poids |

> **`dzsave` attend un chemin SANS extension.** Il ajoute `.dzi` et crée le
> dossier `_files`. Le code le commente explicitement.

> **PyVips est SYNCHRONE.** Dans une route `async def`, encapsulez toujours :
> `await run_in_threadpool(lambda: image.dzsave(...))`.

Documentation : https://libvips.github.io/pyvips/

---

### MinIO Python 7.2

| | |
|---|---|
| **À quoi ça sert** | Client S3 pour le stockage objet. |
| **Où** | [`main.py`](../backend/main.py#L80-L82), [`storage.py`](../backend/storage.py), [`seed_images.py`](../backend/seed_images.py) |

```python
from minio import Minio

client = Minio("minio:9000", access_key="minioadmin",
               secret_key="minioadmin", secure=False)   # secure=False = HTTP

client.bucket_exists("biopsie")
client.make_bucket("biopsie")

client.fput_object(bucket, "dossier/fichier.svs", "/chemin/local")   # envoyer
client.fget_object(bucket, "dossier/fichier.svs", "/chemin/local")   # récupérer
client.stat_object(bucket, cle)          # EXISTE ? (ne télécharge RIEN)
client.remove_object(bucket, cle)
client.list_objects(bucket, prefix="dossier/", recursive=True)
```

> **`stat_object` est la méthode clé** de `storage.find_object_key` : elle teste
> l'existence sans rapatrier plusieurs centaines de Mo. Elle **lève** si l'objet
> n'existe pas — d'où le `try/except` en boucle.

> **Ces appels sont SYNCHRONES.** Dans une route `async def` :
> `await run_in_threadpool(client.fput_object, …)`.

---

### httpx 0.28 vs requests 2.32

Le backend utilise **les deux**, délibérément :

| | `httpx` | `requests` |
|---|---|---|
| Style | **asynchrone** (`AsyncClient`) | synchrone |
| Utilisé pour | **InstanSeg** | **Orthanc** |
| Où | [`instanseg_client.py`](../backend/instanseg_client.py) | [`main.py`](../backend/main.py), [`seed_images.py`](../backend/seed_images.py) |
| Encapsulation | `await client.post(...)` directement | `await run_in_threadpool(lambda: requests.post(...))` |

```python
# httpx — asynchrone, pool réutilisé, timeout 300 s
self.client = httpx.AsyncClient(base_url="http://instanseg:7000", timeout=300.0)
response = await self.client.post("/segment", files=files, params=params)
response.raise_for_status()
await self.client.aclose()          # ⚠️ à fermer (@app.on_event("shutdown"))

# requests — synchrone, donc déporté dans un thread
orthanc_response = await run_in_threadpool(
    lambda: requests.post("http://orthanc:8042/instances",
                          data=file.file, auth=("orthanc", "orthanc"), timeout=300)
)
```

> Harmoniser sur `httpx` (qui fait aussi du synchrone) serait une simplification
> légitime.

---

### Alembic 1.16

Voir [02 — Base de données §5](02-base-de-donnees.md#5-migrations-alembic).

```bash
docker exec p6_backend sh -c 'cd /app && alembic revision --autogenerate -m "message"'
docker exec p6_backend sh -c 'cd /app && alembic upgrade head'
docker exec p6_backend sh -c 'cd /app && alembic downgrade -1'
docker exec p6_backend sh -c 'cd /app && alembic current'
docker exec p6_backend sh -c 'cd /app && alembic history'
```

---

### NumPy 2.0

| | |
|---|---|
| **À quoi ça sert** | Statistiques sur les instances renvoyées par InstanSeg. |
| **Où** | [`main.py:617-629`](../backend/main.py#L617-L629) uniquement (côté backend) |

```python
cell_areas = [inst.area_px for inst in instances]
avg_size = int(np.mean(cell_areas))
max_size = int(np.max(cell_areas))
```

Trois lignes. Côté InstanSeg, NumPy fait en revanche tout le travail lourd :
`np.unique`, `np.where`, `np.pad`, `np.arctan2`, `np.argsort`.

---

## Le service InstanSeg

### PyTorch (CPU)

| | |
|---|---|
| **Où** | [`instanseg/api.py`](../instanseg/api.py) |
| **Variante** | CPU — `--index-url https://download.pytorch.org/whl/cpu` |

```python
def _get_device() -> str:
    if torch.cuda.is_available(): return "cuda"
    if hasattr(torch.backends, "mps") and torch.backends.mps.is_available(): return "mps"
    return "cpu"
```

Le code détecte CUDA et MPS (Apple Silicon), mais **la variante CPU installée ne
les fournit pas** : `_get_device()` retourne toujours `"cpu"`. Pour exploiter un
GPU, il faudrait changer l'index PyTorch **et** ajouter la configuration
`deploy.resources` dans le compose.

### instanseg-torch

```python
from instanseg import InstanSeg

_cache: dict[str, InstanSeg] = {}
def _load(model_name: str) -> InstanSeg:
    if model_name not in _cache:
        _cache[model_name] = InstanSeg(model_name, device=_get_device(), verbosity=1)
    return _cache[model_name]

labeled_out, _ = model.eval_small_image(img, target="nuclei")
```

**Modèles disponibles** : `brightfield_nuclei` (fond clair — le seul utilisé),
`fluorescence_nuclei_and_cells`.
**Cibles** : `nuclei`, `cells`, `all_outputs`.

**Le format d'entrée attendu** — normalisé par `_prepare()` :

```python
# CHW float32 dans [0, 1], 1 ou 3 canaux
# Gère : HW (gris), HWC avec 1, 2, 3 ou 4 canaux (RGBA → RGB)
mn, mx = out.min(), out.max()
if mx > mn: out = (out - mn) / (mx - mn)
```

**La sortie** — `_to_label_2d()` normalise les formes `(H,W)`, `(1,H,W)` ou
`(1,1,H,W)` en une matrice 2D d'entiers où chaque noyau porte un label unique
et `0` est le fond.

### Pillow

`Image.open(io.BytesIO(upload))` pour décoder le PNG reçu,
`Image.fromarray(...)` pour produire le masque de `/segment/mask`.

---

## Récapitulatif : où trouver quoi

| Je veux… | Fichier |
|---|---|
| Ajouter une icône | `@mui/icons-material/<Nom>` |
| Appeler l'API backend | `services/api.ts` (axios) ou `fetch` direct |
| Afficher une lame | `pages/Viewer.tsx` — OpenSeadragon |
| Afficher un DICOM | `pages/RadiologyViewer.tsx` — Cornerstone |
| Ajouter un graphique | `pages/Dashboard.tsx` — Recharts |
| Générer un PDF | `RadiologyViewer.handleExportPDF` — jsPDF |
| Capturer l'écran | `Viewer.handleDownloadSnapshot` — dom-to-image |
| Traiter une grande image | `backend/main.py` — PyVips |
| Lire/écrire dans MinIO | `backend/storage.py` + client dans `main.py` |
| Appeler InstanSeg | `backend/instanseg_client.py` — httpx |
| Appeler Orthanc | `backend/main.py` — requests |
| Modifier le schéma | `backend/models.py` + Alembic |
| Changer les étapes | `backend/workflow/constants.py` **et** `frontend/.../steps.ts` |
