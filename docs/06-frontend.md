# 06 — Architecture frontend

**Stack :** React 19.2 · TypeScript 5.9 · Vite 7.2 · Tailwind CSS 4.1 ·
React Router 7.11 · MUI 7.3 · OpenSeadragon 5 · Cornerstone.js · Recharts 3.6

> **Vous n'avez jamais fait de React ni de Vite ?** Lisez d'abord
> [11 - React + Vite de zéro](11-react-vite-de-zero.md) : cours complet et
> illustré (composants, JSX, hooks, état et « stores », routage, TypeScript,
> Tailwind, débogage), avec tous les exemples pris dans Chiron. La partie A
> ci-dessous en est le résumé.

---

## PARTIE A — Comprendre un projet React + Vite

*Si vous connaissez déjà React et Vite, sautez à la [Partie B](#partie-b--larchitecture-de-chiron).*

### 1. Ce que fait Vite

**Vite** est l'outil de build. Il joue deux rôles très différents :

| Mode | Commande | Ce qui se passe |
|---|---|---|
| **Développement** | `npm run dev` | Serveur HTTP sur `:5173`. Sert les fichiers **quasiment tels quels** en modules ES natifs. Transforme le TSX à la volée, à la demande, fichier par fichier. **Ne bundle rien.** D'où un démarrage instantané. |
| **Production** | `npm run build` | `tsc -b` (vérification de types) puis bundling par Rollup → `dist/` : quelques fichiers minifiés, hachés, optimisés. |

**Chiron tourne en mode développement dans Docker** — pas de build de production
(`Dockerfile` : `CMD ["npm", "run", "dev", "--", "--host"]`).

**Le HMR (Hot Module Replacement).** Quand vous sauvegardez un `.tsx`, Vite
recompile **ce seul module** et le pousse au navigateur par WebSocket. React
Fast Refresh remplace le composant **en conservant son état**. Vous ne perdez ni
le scroll, ni les champs saisis.

### 2. La chaîne de démarrage

```
index.html                       ← la SEULE page HTML de tout le site
  └── <div id="root"></div>
  └── <script type="module" src="/src/main.tsx">
        │
        ▼
src/main.tsx                     ← point d'entrée JavaScript
  createRoot(document.getElementById('root')!).render(
    <StrictMode><App /></StrictMode>
  )
        │
        ▼
src/App.tsx                      ← routeur : quelle page pour quelle URL
        │
        ▼
src/pages/Dashboard.tsx | Viewer.tsx | RadiologyViewer.tsx | Login.tsx
```

C'est une **SPA** (Single Page Application) : une seule page HTML, et
JavaScript remplace le contenu selon l'URL. Le serveur ne renvoie jamais de HTML
différent.

**`<StrictMode>`** est un mode de développement de React qui **monte chaque
composant deux fois** pour révéler les effets de bord mal nettoyés. C'est
volontaire, et ça n'arrive jamais en production. Si vous voyez un `useEffect`
s'exécuter deux fois, c'est ça.

### 3. Les concepts React indispensables

#### Le composant

Une fonction qui retourne du JSX. Le nom commence par une **majuscule**.

```tsx
function Bonjour({ nom }: { nom: string }) {
  return <p>Bonjour {nom}</p>;
}
// utilisation :  <Bonjour nom="Marie" />
```

#### Les props — données descendantes, en lecture seule

```tsx
// PatientCard.tsx:49
const PatientCard = ({ patient, onDeleted }: { patient: Patient; onDeleted?: () => void }) => {
```

`patient` est une donnée, `onDeleted` est un **callback** : c'est ainsi qu'un
enfant remonte une information à son parent. React n'a pas de flux montant
natif — on passe une fonction vers le bas, l'enfant l'appelle.

#### `useState` — l'état local

```tsx
const [patients, setPatients] = useState<Patient[]>([]);
//     ↑ valeur   ↑ setter                      ↑ valeur initiale
```

Appeler le setter déclenche un **nouveau rendu**. Deux règles absolues :

```tsx
// ❌ MUTATION — React ne détecte rien, l'écran ne change pas
shapes.push(nouvelleForme);
setShapes(shapes);

// ✅ NOUVEL OBJET
setShapes([...shapes, nouvelleForme]);

// ✅ Forme fonctionnelle : obligatoire quand la nouvelle valeur dépend de l'ancienne
setFormData((previous) => ({ ...previous, [key]: value }));
```

La forme fonctionnelle évite de capturer un état **périmé** (*stale closure*) —
piège n° 1 de React. Le code de Chiron la commente explicitement :

```tsx
/** Écrit une valeur de formulaire sans capturer un `formData` périmé. */
const handleFieldChange = (key: string, value: unknown) => {
  setFormData((previous) => ({ ...previous, [key]: value }));
};
```
[Viewer.tsx:128-131](../frontend/src/pages/Viewer.tsx#L128-L131)

#### `useEffect` — les effets de bord

Tout ce qui n'est pas du calcul de rendu : appels réseau, abonnements,
manipulation directe du DOM, initialisation de bibliothèques.

```tsx
useEffect(() => {
  //  ↓ le code de l'effet
  const viewer = OpenSeadragon({ ... });
  viewerRef.current = viewer;

  return () => {
    //  ↓ le NETTOYAGE : exécuté au démontage ET avant chaque réexécution
    viewerRef.current?.destroy();
  };
}, [rawUrl, isAnnotationMode, initialROI]);
//  ↑ tableau de dépendances
```

| Tableau de dépendances | Quand l'effet s'exécute |
|---|---|
| absent | **à chaque rendu** — presque toujours un bug |
| `[]` | une seule fois, au montage |
| `[a, b]` | au montage, puis dès que `a` ou `b` change |

**Le nettoyage n'est pas optionnel.** Sans `viewer.destroy()`, chaque navigation
laisserait une instance OpenSeadragon vivante — fuite mémoire garantie.

**Le pattern anti-course**, utilisé partout dans Chiron :

```tsx
useEffect(() => {
  let active = true;                       // ← drapeau local
  getWorkflow(extractionId)
    .then((fresh) => {
      if (!active) return;                 // ← la réponse est obsolète : on jette
      setState(fresh);
    });
  return () => { active = false; };        // ← invalidé au nettoyage
}, [extractionId, attempt]);
```
[useWorkflow.ts:58-81](../frontend/src/features/workflow/useWorkflow.ts#L58-L81)

Sans ça, si l'utilisateur change vite d'extraction, une réponse lente de la
première requête pourrait écraser celle de la seconde.

#### `useRef` — une valeur qui survit sans déclencher de rendu

```tsx
const viewerRef = useRef<OpenSeadragon.Viewer | null>(null);
const containerRef = useRef<HTMLDivElement>(null);
```

Deux usages :

1. **Garder un objet impératif** (un viewer, un timer). Modifier `.current` **ne
   provoque aucun rendu** — c'est exactement ce qu'on veut pour une
   bibliothèque qui gère son propre DOM.
2. **Référencer un nœud DOM** via `ref={containerRef}`.

#### `useMemo` et `useCallback` — la mémoïsation

```tsx
// Recalcule seulement si `patients` change
const { stats, pieData } = useMemo(() => { /* calcul */ }, [patients]);

// Conserve la MÊME référence de fonction entre les rendus
const reload = useCallback(() => setAttempt((n) => n + 1), []);
```

`useCallback` est indispensable quand une fonction est une **dépendance
d'un `useEffect`** : sans lui, elle serait recréée à chaque rendu et l'effet
tournerait en boucle infinie.

#### Les règles des hooks

1. **Toujours au niveau racine** du composant — jamais dans un `if`, une boucle,
   une fonction imbriquée.
2. **Seulement dans un composant ou un hook personnalisé** (nom commençant par
   `use`).

ESLint les vérifie via `eslint-plugin-react-hooks`.

### 4. Ce que Vite ajoute à React

#### Les variables d'environnement

```ts
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8002';
```

| Règle | Détail |
|---|---|
| Préfixe obligatoire | **`VITE_`** — sinon la variable n'est pas exposée au client |
| Moment de résolution | **au démarrage du serveur Vite**, pas à l'exécution |
| Visibilité | **publique** — elle finit dans le bundle. Jamais de secret ici |
| Résolue par | le **navigateur** → d'où `localhost` et non un nom de service Docker |

Changer une `VITE_*` dans `docker-compose.yml` impose
`docker compose up -d frontend` (redémarrage du conteneur).

#### Le proxy de développement

```ts
// vite.config.ts
proxy: { '/orthanc': { target: 'http://p6_orthanc:8042',
                       changeOrigin: true,
                       rewrite: (p) => p.replace(/^\/orthanc/, '') } }
```

`fetch('/orthanc/studies/x/instances')` → Vite appelle
`http://p6_orthanc:8042/studies/x/instances`. Contourne le CORS et masque les
identifiants. **N'existe qu'en mode dev** — un build de production nécessiterait
un vrai reverse-proxy.

#### `resolveJsonModule`

Activé dans `tsconfig.app.json`, il permet :

```ts
import prelevement from "./prelevement.json";
```

C'est ce qui rend possible l'import des instantanés JSON Schema.

### 5. Tailwind CSS 4 en 3 minutes

Pas de fichier CSS par composant : les classes utilitaires sont écrites
directement dans le JSX.

```tsx
<div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 hover:border-cyan-500/50 transition-all">
//              ↑ fond        ↑ bordure          ↑ arrondi   ↑ padding  ↑ au survol
```

| Élément | Où |
|---|---|
| Import | `@import "tailwindcss";` dans [`index.css`](../frontend/src/index.css) |
| Jetons de couleur | `:root` (thème clair) et `[data-theme="dark"]` (thème sombre), exposés à Tailwind par `@theme inline` |
| Classes de composants | `@layer components` : `.wg-btn`, `.wg-card`, `.wg-input`, `.wg-modal`, `.wg-note`, `.wg-overlay-*` |
| Plugin PostCSS | `@tailwindcss/postcss` dans [`postcss.config.js`](../frontend/postcss.config.js) |

**Tailwind v4 diffère de v3 :** plus de `tailwind.config.js` obligatoire, la
configuration passe par `@theme` en CSS. Le projet n'a d'ailleurs pas de
`tailwind.config.js`.

**Conventions de couleur du projet**

Depuis la refonte graphique, le code ne nomme plus une teinte mais un **rôle**.
La valeur derrière chaque rôle change avec le thème ; aucun `.tsx` n'écrit de
couleur en dur.

| Jeton | Usage | Clair | Sombre |
|---|---|---|---|
| `canvas` | Fond de page | `#f4f6f8` | `#141c26` |
| `surface` | Cartes, panneaux, modales | `#ffffff` | `#1e2a3a` |
| `raised` | Survol, remplissage discret | `#eef1f5` | `#26344a` |
| `line` / `line-strong` | Bordures | `#dfe4ea` / `#c3ccd7` | `#2f3f54` / `#46586f` |
| `ink` | Texte principal | `#1e2a3a` | `#eef2f7` |
| `muted` | Libellés, texte secondaire | `#46586f` | `#a9b7c9` |
| `nav` | Barre supérieure | `#1e2a3a` | `#16202c` |
| `accent` | Action principale, validation | `#10b981` | `#10b981` |
| `danger` / `warn` | Erreur / avertissement | `#c94b4b` / `#b8791f` | `#d05a5a` / `#d1913a` |
| `imaging` | Zone d'affichage des images | `#0c1117` | `#0c1117` |

Deux exceptions assumées, détaillées dans
[11 - React + Vite de zéro](11-react-vite-de-zero.md#83-les-jetons-et-ce-quils-signifient) :
`imaging` et les barres flottantes restent sombres dans les deux thèmes
(convention radiologique), et les couleurs des tracés (vert = moi,
`#f59e0b` = collègues) sont des **données**, pas du style.

---

## PARTIE B — L'architecture de Chiron

### 6. Arborescence commentée

```
frontend/
├── index.html                    Coquille HTML unique (SPA)
├── package.json                  Dépendances et scripts
├── vite.config.ts                Port, polling, proxy Orthanc
├── tsconfig.json                 Racine — références de projets
├── tsconfig.app.json             Règles pour src/  (strict: true)
├── tsconfig.node.json            Règles pour vite.config.ts
├── postcss.config.js             Tailwind + autoprefixer
├── eslint.config.js              Flat config ESLint 9
├── Dockerfile                    node:20-alpine, npm run dev --host
│
├── public/                       Servi tel quel à la racine
│   └── vite.svg                  Favicon (référencé par index.html)
│
├── scripts/                      HORS de src/ : outillage, pas application
│   └── generate-olga-schemas.ts  Régénère les instantanés JSON Schema
│
└── src/
    ├── main.tsx                  Point d'entrée : createRoot + StrictMode
    ├── App.tsx                   Routeur React Router
    ├── index.css                 Tailwind + thème + styles du body
    ├── declarations.d.ts         Types manquants des libs Cornerstone
    ├── assets/react.svg          (inutilisé)
    │
    ├── pages/                    Une page = une route
    │   ├── Login.tsx             55 l.   Saisie du nom → localStorage
    │   ├── Dashboard.tsx        225 l.   Statistiques + liste des dossiers
    │   ├── Viewer.tsx         1 732 l.   Lame + annotations + IA + workflow
    │   └── RadiologyViewer.tsx  557 l.   DICOM + outils + compte rendu + PDF
    │
    ├── components/               Composants partagés
    │   ├── PatientCard.tsx      464 l.   Carte patient + modales
    │   ├── AddPatientModal.tsx   61 l.   Formulaire de création
    │   └── UploadMedicalImage.tsx 91 l.  Import avec glisser-déposer
    │
    ├── services/
    │   └── api.ts               111 l.   Client axios (patients, uploads, suppressions)
    │
    └── features/workflow/        ← MODULE AUTONOME — la structure cible
        ├── steps.ts              45 l.   Registre des 4 étapes + UUID OLGA
        ├── useWorkflow.ts       165 l.   Hook : état serveur du parcours
        ├── useOlgaForm.ts        94 l.   Hook : chargement du formulaire courant
        ├── workflowApi.ts       126 l.   Client HTTP du moteur d'étapes
        ├── olga/                         FRONTIÈRE avec le service externe
        │   ├── types.ts         109 l.   Contrats OLGA + JSON Schema
        │   ├── olgaClient.ts    107 l.   fetch, timeout, erreurs typées
        │   └── olgaAdapter.ts   219 l.   ★ SEUL fichier qui connaît OLGA
        ├── schemas/                      Instantanés versionnés (repli)
        │   ├── index.ts          22 l.
        │   ├── prelevement.json
        │   ├── preparation.json
        │   ├── microscopie.json
        │   └── diagnostic.json
        └── components/
            ├── WorkflowStepper.tsx  84 l.  Frise d'avancement
            ├── OlgaFormPanel.tsx    90 l.  États de chargement + repli
            └── JsonSchemaForm.tsx  200 l.  Rendu générique d'un JSON Schema
```

### 7. Rôle de chaque dossier

| Dossier | Rôle | Règle |
|---|---|---|
| `public/` | Fichiers servis **tels quels** à la racine. Jamais traités par Vite. | Y mettre ce qui doit garder son nom exact |
| `src/assets/` | Fichiers **importés** dans le code — Vite les hache et les optimise | Préférer à `public/` pour les images de composants |
| `src/pages/` | Un composant par **route** de `App.tsx` | Ne pas y mettre de composant réutilisable |
| `src/components/` | Composants **partagés entre pages** | |
| `src/services/` | Accès réseau **transverse** | |
| `src/features/` | **Modules métier autonomes** : hooks + composants + client + types du même domaine | **C'est ici que va tout nouveau code** |
| `scripts/` | Outillage Node, **hors de `src/`** | N'est jamais compilé dans l'application |

**Pourquoi `features/` et pas `components/` ?** Parce qu'un module métier
regroupe *tout* ce qui concerne un domaine : ses types, son client HTTP, ses
hooks, ses composants. On peut le lire, le tester, le supprimer d'un bloc. C'est
un découpage **vertical** (par domaine) plutôt qu'**horizontal** (par nature
technique).

---

### 8. Chaque fichier `.tsx` en détail

#### `src/main.tsx` — 10 lignes

```tsx
createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>,
)
```

Point d'entrée. Le `!` est l'assertion non-null de TypeScript : on affirme que
`#root` existe (il est dans `index.html`).

---

#### `src/App.tsx` — 25 lignes · le routeur

```tsx
const isAuthenticated = true;   // ⚠️ constante en dur

<Router>
  <Routes>
    <Route path="/login"     element={<Login />} />
    <Route path="/dashboard" element={isAuthenticated ? <Dashboard />       : <Navigate to="/login" />} />
    <Route path="/viewer"    element={isAuthenticated ? <Viewer />          : <Navigate to="/login" />} />
    <Route path="/radiology" element={isAuthenticated ? <RadiologyViewer /> : <Navigate to="/login" />} />
    <Route path="*"          element={<Navigate to="/dashboard" />} />
  </Routes>
</Router>
```

| Route | Page | Paramètres |
|---|---|---|
| `/login` | Login | — |
| `/dashboard` | Dashboard | — |
| `/viewer` | Viewer | `?url=` + `location.state` |
| `/radiology` | RadiologyViewer | `?patient=` `&study=` |
| `*` | → `/dashboard` | |

> ⚠️ **`isAuthenticated = true` est une constante littérale.** Les gardes de
> route ne protègent rien : `/dashboard` est accessible sans être passé par
> `/login`. C'est cohérent avec « l'authentification n'est pas implémentée »,
> mais le code **suggère** une protection qui n'existe pas.

---

#### `src/pages/Login.tsx` — 55 lignes

| | |
|---|---|
| **Rôle** | Saisir un nom et le stocker |
| **État** | `username: string` |
| **Effet** | `localStorage.setItem("biopsie_user", username)` puis `navigate('/dashboard')` |

> ⚠️ **Le champ « Mot de passe » est purement décoratif.** Il est `required`
> (validation HTML) mais sa valeur **n'est ni lue ni transmise**. La mention
> « Système certifié HDS (Hébergeur Données Santé) v2.4 » qui figurait en pied
> de page était fictive : elle a été remplacée lors de la refonte graphique par
> un avertissement honnête (« Environnement de démonstration. Ne déposez aucune
> donnée de patient réel. »). Afficher une certification que le système n'a pas
> est trompeur dans un contexte médical.

**`biopsie_user` est LA clé d'identité de toute l'application.** Elle est relue
dans :

| Fichier | Usage |
|---|---|
| `Dashboard.tsx:47` | Nom affiché + initiales de l'avatar |
| `PatientCard.tsx:64` | `doctorName` — pilote l'affichage du bouton supprimer |
| `Viewer.tsx:65` | `currentUser` — auteur des tracés, couleur verte/orange |
| `RadiologyViewer.tsx:64` | Signature du compte rendu (préfixé `Dr.` si besoin) |

---

#### `src/pages/Dashboard.tsx` — 225 lignes

| | |
|---|---|
| **Rôle** | Liste de travail : dossiers en tête, puis 4 tuiles de statistiques et 2 graphiques |
| **État** | `patients`, `loading`, `error`, `showAddPatient`, `showUpload` |
| **Effet** | `fetchPatients()` au montage et quand `username` change |
| **Enfants** | `AppShell`, `StatCard` (local), `PatientCard`, `AddPatientModal`, `UploadMedicalImage` |

**Structure**

```
AppShell ─ barre : logo, thème clair/sombre, praticien, déconnexion
           bandeau : titre, « Importer une imagerie », « Nouveau patient »
liste   ─ FILE D'ATTENTE EN PREMIER : grille de PatientCard,
          ou l'encart vide qui invite à créer un dossier
grille  ─ 4 StatCard : Dossiers suivis, Analyses terminées, Cas critiques,
          Taux de cas sains
section ─ si au moins une analyse : BarChart (activité hebdo)
          + barre part-à-tout étiquetée (Sains / Anomalies), voir 07
modales ─ AddPatientModal | UploadMedicalImage
```

> **Le logo existe en deux fichiers**, et le choix ne dépend pas du thème mais
> du **fond** sur lequel il est posé :
> `chiron-logo-sombre.png` (corps blanc, aplats verts) pour les fonds sombres,
> `chiron-logo-clair.png` (entièrement vert) pour les fonds clairs. La barre de
> navigation restant sombre dans les deux thèmes, elle demande toujours la
> première ; l'écran de connexion suit le thème. Le composant
> [`Logo.tsx`](../frontend/src/components/Logo.tsx) porte cette règle.
> Un `filter: invert()` sur un fichier unique ne conviendrait pas : le dessin
> n'est pas monochrome, le vert virerait au magenta.

> **Pourquoi la liste passe avant les statistiques ?** Un pathologiste ouvre
> l'outil pour savoir quels dossiers l'attendent, pas pour consulter des
> indicateurs. Ouvrir sur une rangée de quatre nombres puis deux graphiques
> était la disposition par défaut d'un tableau de bord analytique, applicable
> à n'importe quel sujet. Les statistiques sont descendues à la place qu'elles
> occupent réellement dans le travail : un pied de page.

**Le calcul des statistiques est mémoïsé :**

```tsx
const { stats, pieData, activityData, hasActivity } = useMemo(() => {
  patients.forEach(patient => {
    patient.biopsies?.forEach(biopsy => {
      if (biopsy.status === "termine" || biopsy.status === "archive" || biopsy.status === "Validé") {
        analyzedCount++;
        weekActivity[todayIndex].analyses += 1;
        if (biopsy.id % 2 === 0) criticalCases++; else healthyCases++;   // ⚠️
      }
    });
  });
  …
}, [patients]);
```

> ⚠️ **Deux problèmes ici, à connaître absolument.**
>
> 1. **Les trois statuts testés ne sont jamais écrits.** Le backend n'écrit que
>    `"Non analysé"`. `analyzedCount` reste donc toujours à 0, `hasActivity` à
>    `false`, et les graphiques ne s'affichent jamais.
> 2. **`biopsy.id % 2 === 0` classe les cas en « critique » ou « sain » selon la
>    parité de l'identifiant.** C'est une donnée **inventée**, en contradiction
>    directe avec la convention n° 2 du projet (« Aucune donnée inventée »). Le
>    code est actuellement inerte à cause du problème 1 — mais si quelqu'un
>    corrige les statuts, le dashboard se mettra à afficher des diagnostics
>    fabriqués.

**Le flux de rafraîchissement :** `PatientCard` reçoit `onDeleted={fetchPatients}`.
Après une suppression, l'enfant appelle le callback et le parent recharge tout.
Simple, un peu brutal, mais fiable.

---

#### `src/components/PatientCard.tsx` — 464 lignes

Le composant le plus dense après les viewers.

| | |
|---|---|
| **Props** | `patient: Patient`, `onDeleted?: () => void` |
| **État** | `extractions`, `showModal`, `hasExtractions`, `deleting`, `busy`, `erreur`, `confirmation` |
| **Effet** | Charge `GET /patients/{folder_id}/extractions` au montage |

**Structure visuelle**

```
 ┃ ← LISERÉ DE LAME, bord gauche, 3 px
 ┃┌─────────────────────────────────────────────┐
 ┃│ 👤 Marie Dupont             [🗑 supprimer]   │
 ┃│    P-0042                                   │
 ┃├─────────────────────────────────────────────┤
 ┃│ [message d'erreur, si présent]        [✕]   │
 ┃├─────────────────────────────────────────────┤
 ┃│ Motif     Non renseigné                     │
 ┃│ Naissance 12/04/1971                        │
 ┃│ Âge       54 ans                            │
 ┃├─────────────────────────────────────────────┤
 ┃│ [👁 Lame]                       [🗑]         │  désactivé si absente
 ┃│ [👁 Radiologie]                 [🗑]         │  si étude présente
 ┃├─────────────────────────────────────────────┤
 ┃│ [✏ Dossiers d'analyse (2)]                  │  si extractions présentes
 ┃└─────────────────────────────────────────────┘

   Liseré  vert  : au moins un dossier d'analyse est ouvert
           gris  : de l'imagerie est rattachée, l'analyse n'a pas commencé
           pâle  : dossier vide
```

**Le liseré de lame.** Emprunté à l'objet du métier : sur une lame de verre,
la bande dépolie porte la référence, et c'est elle qu'on lit en premier dans un
rack. Ici elle encode la composition du dossier, lisible d'un coup d'œil sur
une grille de douze cartes. **La couleur ne porte jamais l'information seule :**
les boutons « Lame » et « Radiologie » sont désactivés quand la pièce est
absente, et le bouton d'analyse annonce son nombre en toutes lettres.

> ⚠️ **La ligne « Médecin » a été retirée lors de la refonte graphique.** Elle
> affichait `localStorage["biopsie_user"]`, c'est-à-dire **l'utilisateur
> connecté**, et non le médecin référent du dossier, qui n'existe dans aucune
> table. Sur une liste de travail, toutes les cartes portaient donc le même
> nom, celui du lecteur : information nulle, et trompeuse. Le champ reste
> disponible dans le composant (`doctorName`), où il sert toujours à décider
> qui a le droit de supprimer un dossier d'analyse.

**Le système de confirmation — à comprendre en détail**

```tsx
const demanderConfirmation = (titre, message, libelle, action) => {
  setErreur(null);
  setConfirmation({ titre, message, libelle, action });
};

const executerConfirmation = async () => {
  if (!confirmation || busy) return;
  setBusy(true);
  try {
    await confirmation.action();   // la modale reste affichée pendant l'opération
    setConfirmation(null);
  } finally { setBusy(false); }
};
```

Le commentaire du code explique pourquoi c'est une modale applicative et non
`window.confirm` :

> *Le dialogue natif est supprimé par le navigateur dès que l'utilisateur coche
> « Empêcher cette page de créer des boîtes de dialogue supplémentaires ».
> `confirm()` renvoie alors `false` immédiatement : le clic ne produisait plus
> rien, sans le moindre message, et aucune requête n'atteignait le serveur.*

Trois actions passent par ce mécanisme : `supprimerDossier`, `supprimerLame`,
`supprimerRadiologie`, `supprimerExtraction`.

**Le détail du `pointer-events-none`**

```tsx
{/* Halo decoratif. `pointer-events-none` est indispensable : etant
    positionne en absolu, il est peint AU-DESSUS de l'en-tete et
    interceptait les clics sur le bouton de suppression. */}
<div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 … pointer-events-none" />
```

Un bug CSS classique, corrigé et documenté sur place. Le bouton porte aussi un
`style={{ position: 'relative', zIndex: 10 }}` pour repasser devant.

**La navigation vers le viewer**

```tsx
const openViewer = (extractionData?: Extraction) => {
  const mainImageUrl = patient.biopsies?.[0]?.image_url ?? "biopsie_cmu_1.dzi";
  navigate(`/viewer?url=${encodeURIComponent(mainImageUrl)}`, {
    state: { patientName, folderId: patient.folder_id, image_url: mainImageUrl,
             roi: extractionData?.roi ?? null,
             extractionId: extractionData?.id ?? null }
  });
};
```

**`location.state` de React Router** transporte des objets JavaScript entre
pages sans les mettre dans l'URL. Pratique, mais **perdu au rechargement (F5)** :
le Viewer retombe alors sur ses valeurs par défaut (`"Patient"`, `"X-00"`).

> ⚠️ Le repli `"biopsie_cmu_1.dzi"` est un nom de fichier en dur qui n'existe
> probablement plus. Un patient sans lame ouvre un viewer vide.

> ⚠️ **`hasExtractions` n'est jamais remis à `true`.** Il est initialisé à
> `false`, mis à `true` par l'effet de montage, mais si le dossier n'avait
> aucune extraction et que l'utilisateur en crée une depuis le Viewer, la carte
> ne le sait pas avant un rechargement complet du Dashboard.

---

#### `src/components/AddPatientModal.tsx` — 61 lignes

| | |
|---|---|
| **Props** | `onClose`, `onCreated: (patient: Patient) => void` |
| **État** | `form` (5 champs), `saving`, `error` |
| **Action** | `createPatient()` puis `onCreated(patient)` |

Un **formulaire contrôlé** : chaque `<input>` a `value={form.x}` et
`onChange={...}`. React est la source de vérité, pas le DOM.

```tsx
const update = (field: keyof typeof form, value: string) =>
  setForm((current) => ({ ...current, [field]: value }));
```

`keyof typeof form` : TypeScript déduit les clés autorisées de l'objet `form` —
une faute de frappe est une erreur de compilation.

> ⚠️ Le `catch` est vide et affiche un message générique
> (`'Impossible de créer le patient.'`), sans lire le `detail` du serveur.
> Contrairement à `UploadMedicalImage` qui, lui, le fait correctement.

---

#### `src/components/UploadMedicalImage.tsx` — 91 lignes

| | |
|---|---|
| **Props** | `patients: Patient[]`, `onClose`, `onUploaded` |
| **État** | `patientId`, `type`, `file`, `progress`, `dragging`, `error`, `sending` |

**Glisser-déposer** — trois gestionnaires :

```tsx
onDragOver ={(e) => { e.preventDefault(); setDragging(true); }}
onDragLeave={() => setDragging(false)}
onDrop     ={(e) => { e.preventDefault(); setDragging(false);
                      chooseFile(e.dataTransfer.files[0]); }}
```

`e.preventDefault()` sur `dragOver` est **obligatoire** : sans lui, le navigateur
ouvre le fichier au lieu de laisser le `drop` se produire.

**Validation client**, doublée côté serveur :
```tsx
const valid = type === 'biopsy' ? /\.(svs|tif|tiff)$/i.test(candidate.name)
                                : /\.dcm$/i.test(candidate.name);
```

**Barre de progression** — `onUploadProgress` d'axios :
```ts
onUploadProgress: (event) => {
  if (event.total) onProgress(Math.round((event.loaded * 100) / event.total));
}
```

> ✅ **Ce composant respecte le principe « les erreurs se voient »** — c'est le
> modèle à suivre :
> ```tsx
> const detail = axios.isAxiosError(cause) && typeof cause.response?.data?.detail === 'string'
>   ? cause.response.data.detail
>   : "L'envoi a échoué. Vérifiez que le service concerné répond.";
> setError(detail);
> ```
> C'est ainsi que les `409` du backend (« Ce dossier contient déjà une lame »)
> parviennent à l'utilisateur.

---

#### `src/pages/Viewer.tsx` — 1 732 lignes · la page centrale

Le fichier le plus gros. Il combine **cinq responsabilités** — c'est une dette
reconnue.

| | |
|---|---|
| **Route** | `/viewer?url={image_url}` + `location.state` |
| **Deux modes** | `isAnnotationMode = !!extractionId` |

| | Mode création (`extractionId` absent) | Mode annotation (`extractionId` présent) |
|---|---|---|
| Outils | déplacer, zoom, **rectangle** | + cercle, polygone, texte, masquer les libellés |
| Panneau | nom de l'extraction | frise + formulaire OLGA + résultat IA |
| Bouton IA | ❌ | ✅ |
| Bouton final | « Créer l'extraction » → `POST /extract-roi` | « Valider et continuer » → `PUT .../workflow/steps/{step}` |
| Navigateur OSD | affiché | masqué |
| Zoom | libre | **borné à la ROI** |

**Les blocs d'état (par ordre dans le fichier)**

```tsx
// Contexte
currentUser, patientName, folderId, defaultDziFilename, extractionId, initialROI

// Interface
loading, showSidebar, showSuccessModal, newExtractionId, showTexts, redrawToken

// IA
aiSuggestion, aiContours, showAiPoints

// Workflow            ← délégué aux hooks
workflow  = useWorkflow(extractionId, currentUser)
olgaForm  = useOlgaForm(currentStep, isAnnotationMode)
formData  = saisie en cours uniquement

// Dessin
currentTool, shapes, dragStart, currentDragShape, movingShapeIndex,
movingTextIndex, polyPoints, pendingTextPos, editingShapeIndex, textValue,
selectedShapeIndex, labelInput

// Références impératives
viewerRef (OpenSeadragon), containerRef (DOM)
```

**La superposition de valeurs de formulaire — un pattern élégant**

```tsx
const formValues = {
  ...workflow.mergedData,   // état SERVEUR (toutes étapes fusionnées)
  ...formData,              // saisie EN COURS (recouvre)
};
```

`formData` est vidé après chaque validation réussie (`if (saved) setFormData({})`)
— la source de vérité redevient le serveur.

**Le calque SVG d'annotation — le mécanisme central**

```
┌─────────────────────────────────────────────────┐
│ <div id="osd-container" ref={containerRef}>     │
│   ┌───────────────────────────────────────────┐ │
│   │ <div id="openseadragon-viewer">  z-0      │ │  ← OSD gère ce DOM
│   │      (canvas des tuiles)                  │ │
│   └───────────────────────────────────────────┘ │
│   ┌───────────────────────────────────────────┐ │
│   │ <div>  z-10   onMouseDown/Move/Up         │ │
│   │   <svg>                                   │ │
│   │     renderShapesBackground()  formes      │ │
│   │     renderAiPoints()          contours IA │ │
│   │     renderTextOverlays()      libellés    │ │
│   │   </svg>                                  │ │
│   └───────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

**Le problème à résoudre :** OpenSeadragon dessine dans son propre canvas, le SVG
est un calque indépendant. Quand l'utilisateur zoome, il faut **redessiner tout
le SVG** aux nouvelles positions écran.

**La solution :**

```tsx
const [, setRedrawToken] = useState(0);        // état dont on ignore la valeur
const updateOverlay = () => setRedrawToken((n) => n + 1);
viewer.addHandler("animation",       updateOverlay);
viewer.addHandler("update-viewport", updateOverlay);
viewer.addHandler("resize",          updateOverlay);
```

`setRedrawToken` ne sert **qu'à forcer un rendu React**. Les fonctions
`render*()` recalculent alors toutes les coordonnées.

**Les deux systèmes de coordonnées**

| Repère | Unité | Conversion |
|---|---|---|
| **Image** | pixel de la lame — **c'est ce qui est persisté** | `viewerElementToImageCoordinates(pt)` |
| **Écran** | pixel du navigateur — **c'est ce qui est dessiné** | `imageToViewerElementCoordinates(pt)` |

```tsx
// À la création d'une forme : ÉCRAN → IMAGE
const p1 = viewer.viewport.viewerElementToImageCoordinates(
  new OpenSeadragon.Point(currentDragShape.x, currentDragShape.y));

// À chaque rendu : IMAGE → ÉCRAN
const p1 = viewer.viewport.imageToViewerElementCoordinates(
  new OpenSeadragon.Point(shape.x, shape.y));

// Pour un rayon (une distance, pas un point) : fonctions delta
deltaPointsFromPixels(...)   // écran → image
deltaPixelsFromPoints(...)   // image → écran
```

> **Si vous devez corriger un bug de position d'annotation, c'est ici.** Une
> confusion entre les deux repères, ou l'usage de `Point` au lieu de `delta`
> pour une distance, produit des formes décalées ou de taille aberrante.

**Le bornage à la ROI en mode annotation**

```tsx
viewer.addHandler("open", function () {
  const roiRect = viewer.viewport.imageToViewportRectangle(roi.x, roi.y, roi.w, roi.h);
  viewer.viewport.fitBounds(roiRect, true);

  if (isAnnotationMode) setTimeout(() => {
    const homeZoom = viewer.viewport.getZoom();
    const zoomBounds = viewer.viewport as OpenSeadragon.Viewport &
                       { minZoomLevel: number; maxZoomLevel: number };
    zoomBounds.minZoomLevel = homeZoom;
    zoomBounds.maxZoomLevel = Math.max(2.5, homeZoom * 8);

    viewer.addHandler("animation", () => { /* recentre si on sort de la ROI */ });
  }, 100);
});
```

L'assertion de type est commentée : *« `minZoomLevel`/`maxZoomLevel` sont
documentées comme options du constructeur ; OpenSeadragon les lit aussi sur le
viewport, mais ses types ne les déclarent pas. »*

> ⚠️ Le `setTimeout(…, 100)` est fragile — il attend que le viewport soit stable.
> Et un `addHandler("animation")` est ajouté **à l'intérieur** du handler
> `open` : si `open` se déclenche plusieurs fois, les handlers s'accumulent.

**Le rendu des contours IA — la retranslation**

```tsx
const contours = (data.contour_points || [])
  .filter((blob) => Array.isArray(blob.points) && blob.points.length > 2)
  .map((blob) => ({
    color: blob.color || "#10b981",
    points: blob.points.map((p) => ({ x: p.x + cropX, y: p.y + cropY })),
    //                                     ↑ InstanSeg raisonne dans le repère
    //                                       du PATCH, pas de la lame
  }));
```

**Le code couleur des annotations**

```tsx
const isMe = shape.author === currentUser;
const strokeColor = isMe ? "#10b981" : "#f59e0b";   // vert / orange
const fillColor   = isMe ? "rgba(16,185,129,0.3)" : "rgba(245,158,11,0.3)";
```

Et les protections : on ne peut ni déplacer ni éditer le tracé d'un collègue.

```tsx
if (shapes[index].author && shapes[index].author !== currentUser) return;
```

> ⚠️ **Trois `alert()` et un `confirm()` subsistent** dans ce fichier
> ([lignes 404](../frontend/src/pages/Viewer.tsx#L404),
> [1206](../frontend/src/pages/Viewer.tsx#L1206),
> [1218](../frontend/src/pages/Viewer.tsx#L1218),
> [1221](../frontend/src/pages/Viewer.tsx#L1221)) — exactement ce que
> `PatientCard` a corrigé en passant à une modale applicative.

---

#### `src/pages/RadiologyViewer.tsx` — 557 lignes

| | |
|---|---|
| **Route** | `/radiology?patient={folder_id}&study={orthanc_study_id}` |
| **État** | `report`, `isSaving`, `savedSource`, `isLoading`, `activeTool`, `lastModifiedBy` |
| **Référence** | `viewerRef` — le `<div>` que Cornerstone pilote |

**L'initialisation globale, une seule fois**

```tsx
let isConfigured = false;          // module-level, PAS un état React

function configureCornerstone() {
  if (isConfigured) return;
  cornerstoneTools.external.cornerstone      = cornerstone;
  cornerstoneTools.external.Hammer           = Hammer;
  cornerstoneTools.external.cornerstoneMath  = cornerstoneMath;
  cornerstoneWADOImageLoader.external.cornerstone  = cornerstone;
  cornerstoneWADOImageLoader.external.dicomParser  = dicomParser;
  cornerstoneWADOImageLoader.configure({ useWebWorkers: false });
  cornerstoneTools.init({ showSVGCursors: true });
  isConfigured = true;
}
```

Cornerstone est une bibliothèque **impérative** à dépendances injectées
manuellement. Le drapeau au niveau module survit aux remontages — nécessaire à
cause de `<StrictMode>` qui monte deux fois.

**Le chargement d'une étude**

```
1. GET http://localhost:8002/radiology/{studyId}/report     ← ⚠️ URL EN DUR
2. GET /orthanc/studies/{studyId}/instances                 ← proxy Vite
3. dicomUrl = `wadouri:${origin}/orthanc/instances/${id}/file`
4. cornerstone.enable(element)
5. addToolForElement × 9  (Wwwc, Zoom, Pan, ZoomMouseWheel, Length,
                           RectangleRoi, EllipticalRoi, Eraser, ArrowAnnotate)
6. cornerstone.loadImage(dicomUrl) → displayImage
7. setToolActive : ZoomMouseWheel (molette) + Wwwc (bouton gauche)
8. Restaurer les annotations depuis dbData.annotations
```

**`wadouri:`** est le préfixe de schéma de `cornerstone-wado-image-loader` : il
lui indique de télécharger l'URL puis de la parser avec `dicom-parser`.

**Les 8 outils exposés**

| Bouton | Outil Cornerstone | Rôle médical |
|---|---|---|
| Contraste | `Wwwc` | **Window Width / Window Center** — le fenêtrage. Voir [08 — Lexique](08-lexique-medical.md#fenêtrage-windowing--wwwc) |
| Déplacer | `Pan` | Translation |
| Mesurer | `Length` | Distance en mm (via l'espacement des pixels DICOM) |
| Rect. | `RectangleRoi` | ROI rectangulaire + statistiques |
| Cercle | `EllipticalRoi` | ROI elliptique + statistiques |
| Texte | `ArrowAnnotate` | Flèche + libellé |
| Gomme | `Eraser` | Efface une annotation |
| Tout effacer | *(bouton, pas un outil)* | `clearToolState` sur les 4 outils annotants |

Plus `ZoomMouseWheel` en permanence sur la molette (`mouseButtonMask: 0`).

**La persistance des annotations**

```tsx
const rawState = cornerstoneTools.globalImageIdSpecificToolStateManager.toolState;
annotationsStr = JSON.stringify(rawState);
// → POST /radiology/{studyId}/report  { report, annotations, lastModifiedBy }
```

Et à la restauration :
```tsx
if (dbData.annotations && dbData.annotations.length > 5 && dbData.annotations !== "{}") {
  const parsedState = JSON.parse(dbData.annotations);
  cornerstoneTools.globalImageIdSpecificToolStateManager.toolState = parsedState;
  setTimeout(() => cornerstone.updateImage(viewerRef.current), 100);
}
```

> ⚠️ **Trois défauts à connaître ici.**
> 1. **`http://localhost:8002` est codé en dur** aux lignes
>    [92](../frontend/src/pages/RadiologyViewer.tsx#L92),
>    [246](../frontend/src/pages/RadiologyViewer.tsx#L246) et
>    [303](../frontend/src/pages/RadiologyViewer.tsx#L303) — `VITE_API_URL` est
>    ignoré, contrairement à toutes les autres pages.
> 2. **`lastModifiedBy` n'existe pas côté serveur** → « Dernière modification »
>    affiche toujours « Aucun historique » après rechargement.
> 3. **Les erreurs sont avalées** dans des `console.error` : un échec de
>    sauvegarde est invisible pour l'utilisateur.

**La séparation des deux effets** est en revanche exemplaire :

```tsx
useEffect(() => { /* chargement DICOM */ },   [studyId]);
useEffect(() => { /* activation d'outil */ }, [activeTool]);
```

*« Changer d'outil ne doit pas relancer le chargement DICOM ni la restauration
des annotations. »* C'est exactement la bonne granularité de dépendances.

**L'export PDF** — `jsPDF` compose un document texte : titre, ID patient, date,
dernier auteur, observations (`splitTextToSize` pour le retour à la ligne), pied
de page. **L'image DICOM n'y figure pas.**

---

### 9. Le module `features/workflow/`

#### `steps.ts` — le registre

```ts
export const WORKFLOW_STEPS = [
  { id: "prelevement", order: 1, label: "Prélèvement",
    olgaFormId: "a44b3f32-1e4c-4686-9705-6ca67a381c88",
    schemaId: "wigo:workflow:prelevement" },
  { id: "preparation", order: 2, label: "Préparation",
    olgaFormId: "a42b3f12-1e4c-7636-9705-6ca87a381c93", … },
  { id: "microscopie", order: 3, … olgaFormId: "a13b3f32-1e4c-0000-2189-6ca67a381c03" },
  { id: "diagnostic",  order: 4, … olgaFormId: "a81b3f32-1e4c-8888-2222-9ca27a381c03" },
] as const;
```

**`as const`** rend le tableau immuable et permet à TypeScript de déduire un type
littéral : `WorkflowStepId = "prelevement" | "preparation" | "microscopie" | "diagnostic"`.

> **C'est le seul endroit à modifier si un formulaire est recréé côté OLGA.**
> Un formulaire *renommé* garde son identifiant ; seul un formulaire *recréé*
> impose de mettre à jour la ligne.

Les `id` doivent rester **strictement identiques** à
[`STEP_IDS`](../backend/workflow/constants.py#L11) côté backend.

#### `workflowApi.ts` — le client HTTP

Utilise `fetch` (pas axios), avec une gestion d'erreur typée :

```ts
export class WorkflowApiError extends Error {
  readonly code: WorkflowErrorCode;   // step_locked | missing_fields | unknown_step
  readonly details: unknown;          // | invalid_payload | network | unexpected
}
```

```ts
if (!response.ok) {
  const detail = (payload as { detail?: unknown })?.detail;
  if (detail && typeof detail === "object" && "code" in detail) {
    throw new WorkflowApiError(detail.code, detail.message, detail.details);
  }
  throw new WorkflowApiError("unexpected", …);
}
```

> **Le commentaire d'en-tête résume la philosophie :** *« L'avancement est une
> donnée serveur : le client la lit et demande des transitions, il ne la décide
> jamais. Un refus (409) est une réponse légitime à afficher, pas une erreur
> technique. »*

#### `useWorkflow.ts` — le hook d'état

```ts
const workflow = useWorkflow(extractionId, currentUser);
```

| Champ retourné | Type | Rôle |
|---|---|---|
| `state` | `WorkflowState \| null` | L'état serveur brut |
| `status` | `"idle"\|"loading"\|"ready"\|"saving"\|"error"` | |
| `error` | `string \| null` | Message à afficher |
| `currentIndex` | `number` | Index **0-based** (pour `useOlgaForm`) |
| `isComplete` | `boolean` | |
| `canGoBack` | `boolean` | `currentIndex > 0` |
| `mergedData` | `Record<string, unknown>` | Toutes les étapes fusionnées |
| `saveCurrentStep(data, validate)` | `Promise<boolean>` | |
| `goBack()`, `goToStep(id)` | `Promise<void>` | |
| `clearError()`, `reload()` | `void` | |

**Attention à la conversion d'index :** le serveur parle en positions **1-based**,
le hook expose un index **0-based**.

```ts
const currentIndex = state ? Math.max(0, state.current_position - 1) : 0;
```

#### `useOlgaForm.ts` — le chargement du formulaire

```ts
const olgaForm = useOlgaForm(currentStep, isAnnotationMode);
```

| Champ | Rôle |
|---|---|
| `step` | L'entrée de `WORKFLOW_STEPS` |
| `schema` | Le `WorkflowJsonSchema`, ou `null` |
| `status` | `"loading"` \| **`"live"`** (OLGA a répondu) \| **`"snapshot"`** (repli) |
| `warning` | Message quand on est retombé sur l'instantané |
| `unsupported` | Champs qu'OLGA expose mais que Chiron ne sait pas rendre |
| `reload()` | Relance la tentative |

**Le pattern de la clé de requête** — plus robuste que le simple drapeau
`active` :

```ts
const requestKey = `${step.id}#${attempt}`;
// … la réponse est stockée AVEC sa clé
setLoaded({ requestKey, schema, status: "live", … });
// … et à l'affichage :
const isCurrent = loaded?.requestKey === requestKey;
return { schema: isCurrent ? loaded.schema : null,
         status: isCurrent ? loaded.status : "loading", … };
```

*« Un résultat d'une requête précédente ne s'affiche jamais à la place de
l'étape courante. »*

#### `olga/olgaAdapter.ts` — la couche anti-corruption ★

**Le fichier le plus important à comprendre du module.** Fonctions **pures**,
sans I/O, donc trivialement testables.

**`parseOption(raw)` — l'extraction du code technique**

OLGA encode souvent le code dans le libellé :

```
"canalaire (Carcinome canalaire)"  →  { value: "canalaire", label: "Carcinome canalaire" }
"1 (Grade I)"                      →  { value: "1",         label: "Grade I" }
"HE (Hématoxyline-Éosine)"         →  { value: "HE",        label: "Hématoxyline-Éosine" }
```

```ts
const CODE_IN_LABEL = /^(\S+)\s*\((.+)\)\s*$/;
```

> **Pourquoi c'est indispensable :** les colonnes PostgreSQL stockent le **code
> seul** (`'canalaire'`, `'1'`). Sans cette séparation, le `<select>` ne
> retrouverait jamais la valeur chargée, et enregistrerait le libellé
> d'affichage à la place du code.

**`toControlType(field)` — la traduction des types**

| `field_type` OLGA | `ControlType` |
|---|---|
| `input:text`, `text`, `input` | `text` |
| `input:number`, `number` | `number` |
| `textarea`, `input:textarea` | `textarea` |
| `datepicker`, `date`, `input:date` | `date` |
| `select`, `dropdown` | `select` ou `multiselect` |
| **tout le reste** | **`null`** → listé dans `unsupported` |

> *« OLGA préfixe ses champs de saisie par `input:`. L'ancien rendu testait
> `"text"` / `"number"` et faisait disparaître ces champs sans un mot. »*
> Désormais un type inconnu est **signalé à l'écran**, pas masqué.

**`olgaToJsonSchema(raw, schemaId)`** produit un `WorkflowJsonSchema` avec trois
annotations non standard :

| Annotation | Rôle |
|---|---|
| `x-order` | Ordre d'affichage — `properties` ne garantit pas l'ordre des clés |
| `x-control` | Widget à rendre |
| `x-enumLabels` | Paires `{value, label}` alignées sur `enum` |
| `x-source` | Traçabilité : `provider`, `formId`, `formVersion`, `lastUpdated` |

*« JSON Schema décrit la donnée, pas l'interface : les `x-` portent l'intention
d'affichage. »*

**`coerceToSchema(value, property)`** aligne une valeur chargée sur le type
attendu — c'est ce qui règle le cas `staining` (colonne JSON ↔ contrôle simple).

#### `olga/olgaClient.ts` — le fetch défensif

```ts
const timeout = new AbortController();
const timer = setTimeout(() => timeout.abort(), 10_000);
signal?.addEventListener("abort", () => timeout.abort());   // annule si l'appelant annule
```

**Deux particularités d'OLGA, gérées explicitement :**

```ts
// 1. OLGA sert du JSON avec Content-Type text/plain
const text = await response.text();
try { payload = JSON.parse(text); }
catch { throw new OlgaError("invalid", "Réponse OLGA non JSON."); }

// 2. OLGA renvoie ses erreurs applicatives en HTTP 200
if (payload && typeof payload === "object" && "error" in payload) {
  throw new OlgaError("http", String(payload.error), 200);
}
```

`OlgaError` expose un getter `userMessage` qui produit un message **sans détail
d'infrastructure** — pas de fuite de nom d'hôte vers l'utilisateur.

#### `components/JsonSchemaForm.tsx` — le rendu générique

**Aucun nom de champ métier n'apparaît dans ce fichier.** Il itère sur
`schema["x-order"]` et rend le widget indiqué par `x-control` :

```tsx
switch (property["x-control"]) {
  case "textarea":    return <textarea rows={3} … />;
  case "select":      return <select><option value="">Sélectionner…</option>…</select>;
  case "multiselect": return <select multiple …>…</select>;
  case "number":      return <input type="number" … />;
  case "date":        return <input type="date" … />;
  case "text":
  default:            return <input type="text" … />;
}
```

**Conséquence directe :** ajouter un champ dans OLGA suffit à le voir apparaître
dans l'interface. Zéro ligne de code à écrire.

Et les champs non gérés sont **affichés**, pas cachés :

```tsx
{unsupported.length > 0 && (
  <p className="text-[11px] text-amber-400/80 mt-2">
    {unsupported.length} champ(s) définis dans OLGA ne sont pas encore gérés par Chiron : …
  </p>
)}
```

#### `components/OlgaFormPanel.tsx` — les trois états

| État | Rendu |
|---|---|
| `loading` sans schéma | Squelettes animés (`animate-pulse`) |
| Pas de schéma du tout | Message rouge + bouton « Réessayer » |
| `snapshot` | Bandeau ambre + date de l'instantané + « Réessayer la connexion », **puis le formulaire** |
| `live` | Le formulaire seul |

Le point clé : **même en repli, la saisie reste possible**.

#### `components/WorkflowStepper.tsx` — la frise

Trois états visuels par étape :

```tsx
const isValidated = step.validated_at !== null;
const isCurrent   = step.step === state.current_step;
const isReachable = step.position <= state.max_reached_position;
const isLocked    = !isReachable;
const canOpen     = Boolean(onSelect) && isReachable && !isCurrent && !disabled;
```

| État | Couleur | Marqueur | Cliquable |
|---|---|---|---|
| Courante | `emerald-500` | — | non (déjà ouverte) |
| Validée | `emerald-700/60` | **✓** | ✅ |
| Accessible non validée | `slate-700` | — | ✅ |
| Verrouillée | `slate-800` | **🔒** | non |

Accessibilité soignée : `<ol aria-label>`, `aria-current="step"`, `title`
explicatif sur chaque état.

#### `schemas/` — les instantanés

Régénérés par `npm run olga:schemas`, **versionnés volontairement** :

1. ils servent de **repli** quand OLGA est indisponible ;
2. ils rendent tout changement de formulaire **visible en revue de code**.

Le script [`generate-olga-schemas.ts`](../frontend/scripts/generate-olga-schemas.ts)
**réutilise exactement l'adaptateur de l'application** — aucune logique de
conversion n'est dupliquée. Il est bundlé à la volée par esbuild :

```json
"olga:schemas": "esbuild scripts/generate-olga-schemas.ts --bundle --format=esm --platform=node --target=node20 --outfile=node_modules/.cache/olga-gen.mjs --log-level=warning && node node_modules/.cache/olga-gen.mjs"
```

En cas d'échec, il conserve les instantanés précédents et sort en code 1.

---

### 10. Le flux de données complet du workflow

```
                       ┌──────────────────────────┐
                       │  Viewer.tsx              │
                       │  (mode annotation)       │
                       └────┬────────────────┬────┘
                            │                │
              useWorkflow(id, user)     useOlgaForm(index, enabled)
                            │                │
                  ┌─────────▼──────┐  ┌──────▼──────────┐
                  │ workflowApi.ts │  │ olgaClient.ts   │
                  └─────────┬──────┘  └──────┬──────────┘
                            │                │ échec
                    fetch   │                │   ▼
                            │                │ SCHEMA_SNAPSHOTS[step.id]
                            ▼                ▼
             ┌──────────────────────┐  ┌──────────────────┐
             │ BACKEND Chiron :8002   │  │ OLGA :9091       │
             │ /extractions/…/      │  │ /forms/getFromID │
             │        workflow      │  └──────────────────┘
             └──────────────────────┘

                            RENDU
    ┌───────────────────────────────────────────────────┐
    │ WorkflowStepper   state (frise, cadenas)          │
    │ OlgaFormPanel     status + warning + schema       │
    │   └─ JsonSchemaForm   x-order → widgets           │
    │        values = { ...workflow.mergedData,         │
    │                   ...formData }                   │
    └───────────────────────────────────────────────────┘
```

---

### 11. Configuration TypeScript

`tsconfig.json` est un fichier de **références de projets** :

```json
{ "files": [], "references": [ { "path": "./tsconfig.app.json" },
                               { "path": "./tsconfig.node.json" } ] }
```

`tsconfig.app.json` couvre `src/`. Les options notables :

| Option | Effet |
|---|---|
| `"strict": true` | Toutes les vérifications strictes |
| `"noUnusedLocals"` / `"noUnusedParameters"` | Une variable inutilisée **casse le build** |
| `"verbatimModuleSyntax": true` | Impose `import type { X }` pour les types purs |
| `"erasableSyntaxOnly": true` | Interdit `enum`, `namespace`, les paramètres-propriétés |
| `"resolveJsonModule": true` | Autorise l'import de `.json` |
| `"noEmit": true` | TS vérifie, Vite compile |
| `"jsx": "react-jsx"` | Pas besoin d'`import React` |

> ⚠️ **`noUnusedLocals` casse `npm run build`, pas `npm run dev`.** Une variable
> oubliée passe inaperçue en développement et fait échouer la compilation de
> production. Lancez `npm run build` avant de livrer.

**`declarations.d.ts`** déclare les modules Cornerstone sans types :

```ts
declare module 'cornerstone-core';
declare module 'cornerstone-tools';
declare module 'cornerstone-math';
declare module 'hammerjs';
declare module 'cornerstone-wado-image-loader';
declare module 'dicom-parser';
```

Ils deviennent `any` — aucune sécurité de type sur ces API. C'est pour ça que
`RadiologyViewer.tsx` est le fichier le plus risqué à modifier.

---

### 12. Commandes

```bash
npm run dev            # serveur de développement (port 5173)
npm run build          # tsc -b && vite build → dist/  (VÉRIFIE LES TYPES)
npm run lint           # ESLint
npm run preview        # sert dist/ localement
npm run olga:schemas   # régénère les instantanés JSON Schema

# depuis l'hôte, sur le conteneur
docker exec p6_frontend npm run lint
docker exec p6_frontend npm run build
```
