# 11 - React + Vite de zéro, expliqué avec Chiron

> **Pour qui.** Un développeur qui sait programmer (Java, Python, PHP...) mais
> qui **n'a jamais écrit une ligne de React ni utilisé Vite**. Aucun prérequis
> front au-delà de HTML/CSS/JavaScript de base.
>
> **Promesse.** À la fin, vous savez lire n'importe quel fichier `.tsx` de
> Chiron, dire où vit chaque donnée, et ajouter une fonctionnalité sans casser
> le reste.
>
> **Méthode.** Chaque concept est présenté trois fois : le **schéma**, le
> **principe**, puis le **code réel de Chiron** qui l'utilise. Aucun exemple
> inventé de type « TodoList » : tout vient du dépôt.

Ce document complète [06 - Architecture frontend](06-frontend.md), qui est un
inventaire fichier par fichier. Ici on explique **les mécanismes**. Lisez
celui-ci en premier si React vous est étranger.

---

## Sommaire

| # | Chapitre | Ce que vous saurez faire après |
|---|---|---|
| 1 | [Le problème que React résout](#1--le-problème-que-react-résout) | Expliquer pourquoi une SPA, et ce que ça coûte |
| 2 | [Vite : l'atelier](#2--vite--latelier) | Démarrer, configurer, comprendre le HMR et le proxy |
| 3 | [Le modèle mental React](#3--le-modèle-mental-react) | Lire du JSX, dessiner l'arbre de composants |
| 4 | [Les hooks, un par un](#4--les-hooks-un-par-un) | Utiliser `useState`, `useEffect`, `useRef`, `useMemo` sans piège |
| 5 | [Où vit la donnée : états et « stores »](#5--où-vit-la-donnée--états-et--stores-) | Choisir le bon emplacement pour chaque donnée |
| 6 | [Le routage](#6--le-routage--une-url-un-composant) | Naviguer, passer des paramètres, éviter le piège du `state` |
| 7 | [TypeScript dans React](#7--typescript-dans-react--le-strict-nécessaire) | Typer des props, un état, un contrat d'API |
| 8 | [Tailwind CSS](#8--tailwind-css--le-style-dans-le-jsx) | Écrire du style sans fichier CSS |
| 9 | [Un parcours complet commenté](#9--un-parcours-complet-de-bout-en-bout) | Suivre un clic jusqu'à la base de données |
| 10 | [Ajouter une fonctionnalité](#10--recette--ajouter-une-fonctionnalité) | Savoir quels fichiers créer et où |
| 11 | [Déboguer](#11--déboguer--symptômes-et-causes) | Diagnostiquer les erreurs classiques |
| 12 | [Glossaire et aide-mémoire](#12--glossaire-et-aide-mémoire) | Traduire le jargon |

---

## 1 - Le problème que React résout

### 1.1 Le web « classique » (MPA)

Dans un site PHP ou Django traditionnel, **le serveur fabrique le HTML**. Chaque
clic est une navigation complète : requête, page HTML entière, rechargement.

```
   MPA (Multi Page Application)         le modèle PHP / JSP / Django templates

   Navigateur                                   Serveur
       |                                            |
       |  GET /patients                             |
       |-------------------------------------------)|  requete SQL
       |                                            |  + rendu du template
       |(-------------------------------------------|
       |  <html> ... page COMPLETE ... </html>      |
       |                                            |
   [ ECRAN BLANC, puis repeint entierement ]        |
       |                                            |
       |  clic « voir patient 3 »                   |
       |  GET /patients/3                           |
       |-------------------------------------------)|
       |(-------------------------------------------|
   [ ECRAN BLANC, tout l'etat JS est perdu ]        |
```

Le point bloquant pour Chiron : **l'état du client est détruit à chaque
navigation**. Or une visionneuse de lame garde en mémoire un zoom, une position,
une pyramide de tuiles en cours de chargement, un calque d'annotations.
Impossible de repartir de zéro à chaque clic.

### 1.2 La SPA

Une **SPA** (Single Page Application) charge **une seule fois** un document HTML
vide et un paquet JavaScript. Ensuite, c'est le JavaScript qui réécrit le contenu
de la page. Le serveur ne renvoie plus que des **données** (JSON), plus jamais de
HTML.

```
   SPA (Single Page Application)                le modele Chiron

   Navigateur                             Serveur Vite      API FastAPI
       |                                       |                  |
       |  GET /                                |                  |
       |--------------------------------------)|                  |
       |(--------------------------------------|                  |
       |  index.html (vide) + main.tsx         |                  |
       |                                       |                  |
   [ React demarre, prend le controle du DOM ] |                  |
       |                                       |                  |
       |  GET /patients   (JSON, pas du HTML)                     |
       |---------------------------------------------------------)|
       |(---------------------------------------------------------|
       |  [ {id:1, name:"..."}, ... ]                             |
       |                                                          |
   [ React construit l'ecran a partir des donnees ]               |
       |                                                          |
       |  clic « voir patient 3 »                                 |
   [ AUCUNE requete de page. L'URL change,                        |
     React remplace le composant affiche. ]                       |
```

**Ce qu'on gagne :** pas de rechargement, l'état JavaScript survit, les
transitions sont instantanées.

**Ce qu'on paie :**

| Coût | Conséquence concrète dans Chiron |
|---|---|
| Le premier chargement est plus lourd | Négligeable ici : application interne, pas de référencement à soigner |
| Il faut **gérer l'état soi-même** | Tout le chapitre 5 existe à cause de ça |
| Il faut **un routeur côté client** | `react-router-dom`, chapitre 6 |
| Le serveur doit renvoyer `index.html` pour **toute** URL inconnue | Sinon `F5` sur `/viewer` donne un 404. Vite le fait automatiquement en dev |

### 1.3 Ce que React apporte précisément

Sans React, mettre à jour l'écran à la main ressemble à ceci :

```js
// Approche imperative : je decris CHAQUE operation sur le DOM
const li = document.createElement('li');
li.textContent = patient.name;
li.className = 'patient';
document.querySelector('#liste').appendChild(li);
// ... et quand le patient est supprime ? renomme ? si la liste est triee ?
```

Chaque évolution demande de retrouver le bon nœud DOM et de le modifier. Le
nombre de chemins possibles explose, et un oubli laisse l'écran désynchronisé
des données.

React inverse le raisonnement. Vous écrivez **une seule fonction** qui décrit
l'écran **pour un état donné** :

```
                        LE CONTRAT DE REACT

              interface  =  f( etat )

     +--------------+        +--------------+        +--------------+
     |    ETAT      |-------)|  MES COMPOS  |-------)|    ECRAN     |
     | patients=[…] |   f    |  (fonctions) | React  |   (le DOM)   |
     +--------------+        +--------------+        +--------------+
            ^                                                |
            |                                                |
            +------------------------------------------------+
                  l'utilisateur agit, l'etat change,
                  React RECALCULE et repeint tout seul
```

Vous ne touchez **jamais** au DOM. Vous changez l'état ; React se charge de
faire correspondre l'écran. C'est le seul concept vraiment important de tout
ce document.

> **Dans Chiron, une exception assumée.** OpenSeadragon (visionneuse de lame) et
> Cornerstone (visionneuse DICOM) sont des bibliothèques impératives qui gèrent
> leur propre DOM. React leur fournit un `<div>` vide et **ne le touche plus**.
> C'est le rôle de `useRef` (section 4.4).

---

## 2 - Vite : l'atelier

### 2.1 Pourquoi un outil de build

Le navigateur ne sait pas lire un fichier `.tsx`. Il ne connaît ni TypeScript,
ni JSX, ni `import` depuis `node_modules`. Il faut **traduire**.

```
   CE QUE VOUS ECRIVEZ                     CE QUE LE NAVIGATEUR COMPREND

   src/pages/Dashboard.tsx                 JavaScript ES2022 pur
   +---------------------------+           +---------------------------+
   | import { useState } from  |           | import { useState } from  |
   |   'react';                |  -------) |  "/node_modules/.vite/    |
   | const [p, setP] =         |   Vite    |   deps/react.js";         |
   |   useState<Patient[]>([]) |           | const [p, setP] =         |
   | return <div className=…>  |           |   useState([]);           |
   +---------------------------+           | return jsx("div", {…});   |
     TypeScript + JSX                      +---------------------------+
```

Vite fait ce travail. Il a **deux modes très différents**, et c'est le point
que tout le monde confond au début.

### 2.2 Les deux vies de Vite

```
   +--------------------------- MODE DEVELOPPEMENT ---------------------------+
   |   npm run dev                                                            |
   |                                                                          |
   |   Vite demarre un serveur HTTP sur :5173 et NE BUNDLE RIEN.              |
   |   Le navigateur demande les modules un par un, en ESM natif.             |
   |                                                                          |
   |   navigateur --GET /src/App.tsx--) Vite --transforme CE fichier--) rep.  |
   |   navigateur --GET /src/pages/Dashboard.tsx--) …                         |
   |                                                                          |
   |   => demarrage quasi instantane, meme sur un gros projet                 |
   +--------------------------------------------------------------------------+

   +--------------------------- MODE PRODUCTION ------------------------------+
   |   npm run build   ==   tsc -b   PUIS   vite build                        |
   |                                                                          |
   |   1. tsc -b        verifie TOUS les types. Une erreur = build echoue.    |
   |   2. vite build    Rollup regroupe tout en quelques fichiers minifies    |
   |                    et haches dans dist/                                  |
   |                                                                          |
   |   dist/                                                                  |
   |     index.html                                                           |
   |     assets/index-a3f9c1.js     (tout le code, minifie)                   |
   |     assets/index-8b21ef.css                                              |
   +--------------------------------------------------------------------------+
```

> **Chiron tourne en mode développement, y compris dans Docker.** Le
> [Dockerfile](../frontend/Dockerfile) se termine par
> `CMD ["npm", "run", "dev", "--", "--host"]`. Il n'y a **aucun build de
> production** dans la pile actuelle. Conséquence : `tsc -b` n'est jamais
> exécuté automatiquement, donc **une erreur de type ne bloque rien au
> démarrage**. Lancez `npm run build` à la main avant de livrer, c'est le seul
> filet.

### 2.3 Le HMR, ou pourquoi vous ne rechargez jamais la page

**HMR** = *Hot Module Replacement*, remplacement de module à chaud.

```
   Vous sauvegardez frontend/src/pages/Dashboard.tsx
            |
            v
   Vite detecte le changement du fichier
            |   (dans Docker : par POLLING, voir 2.7)
            v
   Vite retransforme UNIQUEMENT ce module
            |
            v
   Vite pousse le nouveau module par WebSocket -----) navigateur
            |
            v
   React Fast Refresh remplace le composant EN CONSERVANT SON ETAT
            |
            v
   L'ecran se met a jour en ~50 ms.
   Le zoom OpenSeadragon, les champs saisis, la modale ouverte : tout survit.
```

**Quand le HMR abandonne et recharge toute la page :** modification de
`vite.config.ts`, de `index.html`, ou d'un fichier qui n'exporte pas de
composant React. Vous verrez alors un vrai rechargement, et l'état est perdu.

### 2.4 La chaîne de démarrage, fichier par fichier

C'est le premier schéma à mémoriser. Il répond à « par où commence
l'application ? ».

```
  +----------------------------------------------------------------------+
  | frontend/index.html                        LA SEULE PAGE HTML        |
  |                                                                      |
  |   <div id="root"></div>          <- le trou dans lequel React ecrit  |
  |   <script type="module" src="/src/main.tsx"></script>                |
  +----------------------------------+-----------------------------------+
                                     |
                                     v
  +----------------------------------------------------------------------+
  | src/main.tsx                               POINT D'ENTREE JS         |
  |                                                                      |
  |   import './index.css'          <- Tailwind entre par ici            |
  |   createRoot(document.getElementById('root')!).render(               |
  |     <StrictMode>                                                     |
  |       <ThemeProvider>           <- theme clair/sombre, cf. 5.6       |
  |         <App />                                                      |
  |       </ThemeProvider>                                               |
  |     </StrictMode>)                                                   |
  +----------------------------------+-----------------------------------+
                                     |
                                     v
  +----------------------------------------------------------------------+
  | src/App.tsx                                LE ROUTEUR                |
  |                                                                      |
  |   <Router><Routes>                                                   |
  |     <Route path="/dashboard" element={<Dashboard />} />              |
  |     …                                                                |
  |   </Routes></Router>                                                 |
  +------+--------------+------------------+------------------+----------+
         |              |                  |                  |
         v              v                  v                  v
     Login.tsx     Dashboard.tsx       Viewer.tsx     RadiologyViewer.tsx
```

Trois détails de syntaxe qui bloquent souvent :

| Élément | Signification |
|---|---|
| `document.getElementById('root')!` | Le `!` est une **assertion non-null TypeScript** : « je garantis que ce n'est pas `null` ». Justifié ici : le `<div id="root">` est en dur dans `index.html` |
| `<StrictMode>` | Mode de développement React qui **monte chaque composant deux fois** pour révéler les effets mal nettoyés. Voir 4.3. N'existe pas en production |
| `import './index.css'` | Importer un CSS depuis du JavaScript n'a rien de standard : c'est **Vite** qui le permet, et qui injecte la feuille de style |

### 2.5 Les fichiers de configuration : qui lit quoi

Le dossier `frontend/` contient huit fichiers de configuration. Voici le
diagramme de câblage : **qui est lu par quel outil**.

```
                        +--------------+
                        | package.json |  scripts npm + dependances
                        +------+-------+
                               | npm run dev
                               v
      +------------------------------------------------+
      |                    VITE                        |
      |  lit : vite.config.ts                          |--) port 5173, polling,
      |        index.html   (point d'entree)           |    proxy /orthanc
      |        postcss.config.js  (pipeline CSS)       |
      +-----------+------------------------+-----------+
                  |                        |
                  v                        v
      +-----------------------+   +------------------------+
      |  plugin @vitejs/      |   |  PostCSS               |
      |  plugin-react         |   |  @tailwindcss/postcss  |
      |  (JSX + Fast Refresh) |   |  + autoprefixer        |
      +-----------------------+   +-----------+------------+
                                              | lit src/index.css
                                              v
                                     @import "tailwindcss";
                                     @theme { --color-med-dark: … }

      +------------------------------------------------+
      |             TYPESCRIPT (tsc)                   |
      |  tsconfig.json      racine, ne fait que        |
      |    +-- referencer les deux suivants            |
      |    +-- tsconfig.app.json   -> regles de src/   |  strict: true
      |    +-- tsconfig.node.json  -> vite.config.ts   |
      +------------------------------------------------+
             ^                              ^
             | npm run build (tsc -b)       | votre editeur (VS Code)
             | MANUEL uniquement            | en continu

      +------------------------------------------------+
      |             ESLINT                             |
      |  eslint.config.js  (« flat config », ESLint 9) |  npm run lint
      |  + eslint-plugin-react-hooks  <- verifie les   |
      |    regles des hooks (section 4.6)              |
      +------------------------------------------------+
```

**Options de `tsconfig.app.json` qui ont un effet visible dans le code :**

| Option | Effet concret |
|---|---|
| `"strict": true` | `null` et `undefined` doivent être traités explicitement. D'où tous les `?.` et `??` du code |
| `"jsx": "react-jsx"` | Pas besoin d'écrire `import React` en haut de chaque fichier. Vérifiez : aucun fichier de Chiron ne le fait |
| `"resolveJsonModule": true` | Autorise `import prelevement from "./prelevement.json"`. C'est ce qui rend possibles les instantanés de schémas OLGA |
| `"verbatimModuleSyntax": true` | Impose `import type { Patient }` quand on n'importe qu'un type. D'où les `import type` partout |
| `"noUnusedLocals": true` | Une variable non utilisée est une **erreur**, pas un avertissement |
| `"types": ["vite/client"]` | C'est ce qui donne le typage de `import.meta.env` |

### 2.6 Les quatre superpouvoirs de Vite utilisés par Chiron

#### a) Les variables d'environnement

```ts
// src/services/api.ts:4
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8002';
```

```
   docker-compose.yml                Vite au demarrage           Bundle JS
   +------------------------+        +--------------+         +-----------+
   | environment:           |        | remplace     |         | const     |
   |  - VITE_API_URL=       |-------)| le TEXTE     |--------)| API_URL = |
   |    http://localhost:   |        | import.meta. |         | "http://  |
   |    8002                |        | env.VITE_API |         | localhost |
   +------------------------+        | _URL         |         | :8002"    |
                                     +--------------+         +-----------+
```

Quatre règles, toutes des sources de bug classiques :

| Règle | Détail |
|---|---|
| **Préfixe `VITE_` obligatoire** | Sans lui, la variable n'est **pas** exposée au navigateur. C'est une protection : un `DATABASE_PASSWORD` ne fuitera jamais dans le bundle |
| **Substitution à la compilation** | Ce n'est pas une lecture à l'exécution. Changer la variable impose `docker compose up -d frontend` |
| **Valeur PUBLIQUE** | Elle finit en clair dans le JavaScript téléchargé. **Jamais de secret ici** |
| **Résolue par le NAVIGATEUR** | D'où `http://localhost:8002` et non `http://p6_backend:8002`. Le navigateur de l'utilisateur ne connaît pas le réseau Docker |

Les deux variables du projet, dans
[docker-compose.yml:98-103](../docker-compose.yml#L98-L103) :

| Variable | Valeur | Consommée par |
|---|---|---|
| `VITE_API_URL` | `http://localhost:8002` | `services/api.ts`, `workflowApi.ts`, `PatientCard.tsx`, `Viewer.tsx` |
| `VITE_OLGA_API_URL` | `http://localhost:9091` | `features/workflow/olga/olgaClient.ts` |

#### b) Le proxy de développement

Problème : Orthanc (le PACS) tourne dans Docker, exige une authentification, et
le navigateur bloquerait la requête pour cause de CORS. Solution : **Vite relaie**.

```ts
// vite.config.ts
proxy: {
  '/orthanc': {
    target: 'http://p6_orthanc:8042',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/orthanc/, ''),
  },
}
```

```
   Navigateur                  Vite (:5173)               Orthanc (:8042)
       |                            |                            |
       | GET /orthanc/studies/1/…   |                            |
       |---------------------------)|                            |
       |  MEME ORIGINE, pas de CORS | reecrit l'URL :            |
       |                            | /orthanc/x  ->  /x         |
       |                            | GET http://p6_orthanc:8042/studies/1/…
       |                            |---------------------------)|
       |                            |(---------------------------|
       |(---------------------------|                            |
```

> **Piège majeur.** Ce proxy **n'existe qu'en mode dev**. Le jour où la pile
> passera en build de production, il faudra un vrai reverse-proxy (nginx,
> Traefik) qui reproduise cette règle, sinon la visionneuse DICOM cesse de
> fonctionner sans message d'erreur clair.

#### c) `public/` contre `src/assets/`

```
   frontend/public/vite.svg          frontend/src/assets/react.svg
          |                                    |
          | copie TEL QUEL                     | importe dans le code :
          | nom preserve                       |   import logo from './assets/react.svg'
          v                                    v
   servi sur  /vite.svg                 Vite le hache : /assets/react-a8f3c.svg
                                        (cache navigateur infini, sans risque)
```

Règle : `public/` pour ce qui doit garder son nom exact (favicon,
`robots.txt`) ; `src/assets/` pour tout le reste.

#### d) L'import de JSON

`resolveJsonModule` permet à `features/workflow/schemas/index.ts` d'écrire :

```ts
import prelevement from "./prelevement.json";
```

C'est le mécanisme de repli du workflow : si OLGA est injoignable, on sert
l'instantané JSON embarqué dans le bundle. Voir 5.7.

### 2.7 Vite dans Docker : les trois réglages qui sauvent

```yml
# docker-compose.yml:90-99
frontend:
  build: ./frontend
  volumes:
    - ./frontend:/app          # votre code, monte en direct
    - /app/node_modules        # SAUF node_modules (volume anonyme)
  ports:
    - "5173:5173"
```

```ts
// vite.config.ts
server: {
  host: true,                  // (1)
  port: 5173,
  watch: { usePolling: true }, // (2)
}
```

| Réglage | Pourquoi il est indispensable |
|---|---|
| **(1) `host: true`** | Par défaut Vite n'écoute que `127.0.0.1`, ce qui, **dans un conteneur**, signifie « l'intérieur du conteneur ». Personne ne peut se connecter depuis l'hôte. `host: true` écoute sur `0.0.0.0` |
| **(2) `usePolling: true`** | Les notifications de changement de fichier (`inotify`) ne traversent pas fiablement les montages Docker sur Windows et macOS. Vite interroge donc les fichiers en boucle. Coût : un peu de CPU. Bénéfice : le HMR fonctionne |
| **(3) `- /app/node_modules`** | Ce volume anonyme **masque** le `node_modules` de l'hôte. Sans lui, un `node_modules` installé sous Windows écraserait celui construit pour Linux dans l'image |

**Conséquence pratique :** après l'ajout d'une dépendance dans `package.json`,
il faut `docker compose build frontend && docker compose up -d frontend`.
Modifier le fichier ne suffit pas : `node_modules` vit **dans le conteneur**.

---

## 3 - Le modèle mental React

### 3.1 Le composant

Un composant est **une fonction JavaScript qui retourne du JSX**. Deux règles
non négociables :

1. Son nom commence par une **majuscule** (`PatientCard`, pas `patientCard`).
   C'est ainsi que React distingue vos composants des balises HTML.
2. Elle doit être **pure** : mêmes entrées, même sortie. Pas d'appel réseau,
   pas de `localStorage.setItem`, pas de manipulation du DOM **pendant** le
   rendu. Tout cela va dans un `useEffect` (section 4.3).

Le plus petit composant réel de Chiron :

```tsx
// Dashboard.tsx:27 - une tuile de statistique
const StatCard = ({ title, value, icon: Icon, color }: any) => (
  <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-2xl …">
    <div>
      <p className="text-slate-400 text-sm">{title}</p>
      <h3 className="text-2xl font-bold text-white">{value}</h3>
    </div>
    <div className={`p-3 rounded-xl ${color} bg-opacity-10`}>
      <Icon className={color.replace('bg-', 'text-')} />
    </div>
  </div>
);

// Utilisation, Dashboard.tsx:157
<StatCard title="Patients en File" value={stats.totalPatients}
          icon={PersonIcon} color="text-blue-400" />
```

Deux choses à remarquer :

- `icon: Icon` est un **renommage à la déconstruction**. On reçoit la prop
  `icon`, on la nomme `Icon` avec une majuscule pour pouvoir écrire `<Icon />`.
  Avec un `i` minuscule, React chercherait une balise HTML nommée `icon`.
- Le type `: any` est une **dette technique** signalée dans le fichier même par
  un `// eslint-disable-next-line`. Le chapitre 7 montre comment le typer.

### 3.2 JSX : ce que c'est réellement

JSX n'est **pas** du HTML dans du JavaScript. C'est du **sucre syntaxique** que
le plugin React de Vite transforme en appels de fonction.

```
   CE QUE VOUS ECRIVEZ                    CE QUE VITE PRODUIT

   <div className="carte">                jsx("div", {
     <p>{patient.name}</p>       ----->     className: "carte",
   </div>                                   children: jsx("p", {
                                              children: patient.name
                                            })
                                          })
```

Le résultat de cet appel est un **objet JavaScript ordinaire** qui décrit
l'interface. Pas un élément DOM : une description. React comparera cette
description à la précédente pour décider quoi modifier réellement.

**Les règles de syntaxe qui piègent tout le monde :**

| Règle | Pourquoi | Exemple Chiron |
|---|---|---|
| `className` et non `class` | `class` est un mot réservé JavaScript | `<div className="p-6">` |
| `htmlFor` et non `for` | Idem | `JsonSchemaForm.tsx:34` |
| Les accolades `{}` insèrent du JavaScript | C'est le seul moyen d'interpoler | `{patient.name}` |
| Un seul élément racine | Une fonction retourne une valeur | Envelopper dans `<div>` ou dans un fragment `<>…</>` |
| Les balises se ferment toujours | `<br>` est invalide | `<br />`, `<input … />` |
| Le style inline est un **objet** | `style={{ width: '50%' }}` : les accolades extérieures = JSX, les intérieures = objet JS | `UploadMedicalImage.tsx` : `style={{ width: `${progress}%` }}` |

### 3.3 Les props : le flux de données descendant

Les **props** sont les paramètres d'un composant. Elles descendent du parent
vers l'enfant et sont **en lecture seule**.

```
                      LE FLUX EST TOUJOURS DESCENDANT

    Dashboard  (detient l'etat : patients, showAddPatient, …)
        |
        |  props : patient={p}    onDeleted={fetchPatients}
        |          -----------    -----------------------
        |            DONNEE            CALLBACK
        |          (descend)      (permet a l'enfant de
        |                          faire remonter un evenement)
        v
    PatientCard
```

React n'a **aucun** mécanisme de remontée de données natif. La seule technique
est celle-ci : le parent passe une **fonction** vers le bas, l'enfant l'appelle.
C'est le patron *callback*, visible partout dans Chiron :

```tsx
// Dashboard.tsx:222 - le parent fournit deux callbacks
{showAddPatient && (
  <AddPatientModal
    onClose={() => setShowAddPatient(false)}
    onCreated={handlePatientCreated}
  />
)}

// AddPatientModal.tsx:7-10 - l'enfant declare le contrat
interface AddPatientModalProps {
  onClose: () => void;
  onCreated: (patient: Patient) => void;
}

// AddPatientModal.tsx:31 - l'enfant appelle, le parent reagit
onCreated(patient);
```

Et côté parent :

```tsx
// Dashboard.tsx:117-120
const handlePatientCreated = (patient: Patient) => {
  setPatients((current) => [...current, patient]);   // ajoute a la liste
  setShowAddPatient(false);                           // ferme la modale
};
```

**Convention de nommage :** une prop qui est une fonction se nomme `onX`
(`onClose`, `onCreated`, `onUploaded`, `onDeleted`, `onChange`, `onSelect`).
Le gestionnaire correspondant chez le parent se nomme `handleX`.

### 3.4 L'arbre de composants de Chiron

Voici la carte complète. C'est le « diagramme de câblage » du frontend : qui
rend qui.

```
 main.tsx
   |
   +-- <StrictMode>
         |
         +-- <ThemeProvider>            theme clair/sombre (Context, cf. 5.6)
               |
               +-- App.tsx  (routeur)
                     |
                     +-- /login ------- Login.tsx
                     |                    useTheme() pour la bascule de theme
                     |                    (localStorage.setItem("biopsie_user"))
                     |
                     +-- /dashboard --- AppShell.tsx        barre + titre + actions
                     |                    |  useTheme(), deconnexion
                     |                    +-- Dashboard.tsx
                     |                          |  etat : patients, loading, error,
                     |                          |         showAddPatient, showUpload
                     |                          |  useTheme() -> couleurs Recharts
                     |                          |
                     |                          +-- StatCard  x4
                     |                          +-- BarChart (Recharts) + barre part-a-tout
                     |                          +-- PatientCard  xN
                     |                          |     |  etat : extractions, showModal,
                     |                          |     |         deleting, confirmation…
                     |                          |     +-- modale de choix d'extraction
                     |                          |     +-- modale de confirmation
                     |                          |
                     |                          +-- AddPatientModal     (si showAddPatient)
                     |                          +-- UploadMedicalImage  (si showUpload)
                     |
                     +-- /viewer ------ Viewer.tsx           PAS d'AppShell :
                     |                    |  l'ecran appartient a l'image
                     |                    |  etat : shapes, currentTool, formData,
                     |                    |         aiContours, showSidebar…
                     |                    |  hooks metier :
                     |                    |    useWorkflow(extractionId, currentUser)
                     |                    |    useOlgaForm(currentStep, isAnnotationMode)
                     |                    |
                     |                    +-- <div id="openseadragon-viewer">
                     |                    |      (zone geree par OpenSeadragon,
                     |                    |       React n'y touche plus)
                     |                    +-- <svg> calque d'annotations (React)
                     |                    +-- barres flottantes .wg-overlay-*
                     |                    +-- WorkflowStepper    frise des 4 etapes
                     |                    +-- OlgaFormPanel      etats de chargement
                     |                          +-- JsonSchemaForm   rendu generique
                     |
                     +-- /radiology --- RadiologyViewer.tsx  PAS d'AppShell non plus
                                          |  Cornerstone.js + compte rendu + PDF
                                          +-- barre de travail (retour + outils)
                                          +-- <div> viewport Cornerstone
                                          +-- panneau de compte rendu
```

> **Pourquoi les visionneuses n'ont pas de barre de navigation ?** Pendant la
> manipulation d'une lame ou d'un examen, l'écran doit être entièrement dédié à
> l'image. Ces deux pages portent donc leur propre retour explicite
> (« ← Dossiers ») et le rappel du dossier ouvert, plutôt que le cadre commun.

**Lecture du schéma :** un composant ne connaît que ses enfants directs.
`Dashboard` ignore totalement l'existence de `JsonSchemaForm`. C'est ce qui
rend le code découpable.

### 3.5 Le rendu et la réconciliation

Que se passe-t-il exactement quand un état change ?

```
   1. Un evenement se produit
      (clic, reponse HTTP, saisie clavier)
                  |
                  v
   2. Vous appelez un setter :  setPatients([...])
                  |
                  v
   3. React marque le composant comme « sale » et planifie un rendu
                  |
                  v
   4. RENDU : React rappelle votre fonction Dashboard()
      Elle retourne un NOUVEL arbre de description (le « Virtual DOM »)
                  |
                  v
   5. RECONCILIATION : React compare l'ancien arbre et le nouveau
                  |
      +-----------+------------+
      |                        |
      v                        v
   identique              different
   ne touche a rien       calcule la modification MINIMALE
                                  |
                                  v
   6. COMMIT : React applique uniquement ces modifications au vrai DOM
      (ex : « change le textContent de ce <h3> », pas « refais la page »)
```

**Ce que ça implique pour vous :**

- Votre fonction composant est appelée **de nombreuses fois**. Elle doit rester
  rapide et sans effet de bord.
- Ne comptez jamais sur une variable locale ordinaire pour retenir quelque
  chose : elle est réinitialisée à chaque rendu. C'est exactement ce que
  `useState` et `useRef` résolvent.

### 3.6 Les listes et la prop `key`

Afficher une liste, c'est transformer un tableau de données en tableau de JSX,
avec `.map()` :

```tsx
// Dashboard.tsx:214-216
{patients.map((patient) => (
  <PatientCard key={patient.id} patient={patient} onDeleted={fetchPatients} />
))}
```

La prop `key` est **obligatoire** et c'est la source de bugs la plus vicieuse
de React.

```
   SANS key STABLE : React identifie les elements par leur POSITION

   Rendu 1        Rendu 2 (on supprime Alice, en tete)
   [0] Alice      [0] Bob      -> React : « la position 0 a change de texte »
   [1] Bob        [1] Carla    -> React : « la position 1 a change de texte »
   [2] Carla      (rien)       -> React : « supprime la position 2 »

   React a REUTILISE le composant d'Alice pour afficher Bob.
   L'etat interne d'Alice (modale ouverte, champ saisi) est passe a Bob.

   AVEC key={patient.id} : React identifie par IDENTITE

   Rendu 1        Rendu 2
   key=1 Alice    key=2 Bob    -> React : « la key 1 a disparu, je detruis
   key=2 Bob      key=3 Carla     ce composant ; les key 2 et 3 sont
   key=3 Carla                    inchangees, je les deplace »
```

| Règle | Détail |
|---|---|
| La `key` doit être **stable** | L'identifiant métier : `patient.id`, `step.step`, `option.value` |
| **Jamais l'index du tableau** si la liste peut être réordonnée, filtrée ou amputée | C'est le bug ci-dessus |
| Elle doit être unique **entre frères et sœurs**, pas globalement | |

Chiron respecte la règle presque partout : `key={patient.id}`
([Dashboard.tsx:215](../frontend/src/pages/Dashboard.tsx#L215)),
`key={step.step}` ([WorkflowStepper.tsx:44](../frontend/src/features/workflow/components/WorkflowStepper.tsx#L44)),
`key={option.value}` (`JsonSchemaForm.tsx`). L'exception est le camembert du
tableau de bord (`key={`cell-${index}`}`), acceptable car les deux parts ne
sont jamais réordonnées.

### 3.7 L'affichage conditionnel

Trois formes, toutes présentes dans Chiron :

```tsx
// 1. L'operateur && : « si vrai, affiche ; sinon, rien »
// Dashboard.tsx:222
{showAddPatient && <AddPatientModal … />}

// 2. Le ternaire : « si vrai ceci, sinon cela »
// Dashboard.tsx:147
{loading ? <div>Chargement...</div> : <>{/* le tableau de bord */}</>}

// 3. Le return anticipe : plusieurs sorties dans le composant
// OlgaFormPanel.tsx:27 puis 43
if (status === "loading" && !schema) return <div>Chargement du formulaire…</div>;
if (!schema) return <div>Formulaire indisponible.</div>;
return <JsonSchemaForm … />;
```

> **Le piège du `&&` avec un nombre.** `{patients.length && <Liste />}` affiche
> littéralement `0` à l'écran quand la liste est vide, car `0` est une valeur
> affichable en JSX. Écrivez toujours `{patients.length > 0 && …}`.

Le troisième patron, le *early return*, est le plus lisible pour les états de
chargement. `OlgaFormPanel` en est l'illustration parfaite : trois écrans
possibles (squelette de chargement, erreur avec bouton « Réessayer »,
formulaire), trois `return`.

---

## 4 - Les hooks, un par un

Un **hook** est une fonction dont le nom commence par `use`. C'est le mécanisme
par lequel un composant (une simple fonction, rappelons-le) obtient de la
**mémoire** et un accès au **cycle de vie**.

```
              Sans hook                    Avec hook
   +---------------------------+  +---------------------------+
   | function Compo() {        |  | function Compo() {        |
   |   let n = 0;              |  |   const [n, setN] =       |
   |   // remis a 0 a CHAQUE   |  |     useState(0);          |
   |   // rendu. Inutilisable. |  |   // React conserve n      |
   |   return <p>{n}</p>       |  |   // entre les rendus      |
   | }                         |  | }                         |
   +---------------------------+  +---------------------------+
```

### 4.1 `useState` : la mémoire du composant

```tsx
const [patients, setPatients] = useState<Patient[]>([]);
//     ^valeur   ^fonction de mise a jour        ^valeur initiale
//                                     ^type des elements
```

```
        CYCLE DE VIE D'UN useState

   Rendu 1 (montage)     useState([]) cree la case memoire -> patients = []
        |
        | appel HTTP termine : setPatients([alice, bob])
        v
   React planifie un nouveau rendu
        |
        v
   Rendu 2               useState([]) IGNORE la valeur initiale
                         et retourne la valeur courante -> patients = [alice, bob]
```

**Point contre-intuitif n° 1 : la valeur initiale n'est utilisée qu'au premier
rendu.** Aux rendus suivants, `useState` retourne la valeur mémorisée.

**Point contre-intuitif n° 2 : la variable ne change pas immédiatement.**

```tsx
const [n, setN] = useState(0);
const clic = () => {
  setN(1);
  console.log(n);   // affiche 0 ! `n` est une CONSTANTE dans ce rendu.
};
```

`n` est figée pour la durée du rendu courant. La nouvelle valeur n'apparaît
qu'au rendu suivant.

**Règle absolue : ne jamais muter, toujours remplacer.**

React compare l'ancienne et la nouvelle valeur avec `Object.is`, une
comparaison de **référence**. Muter un tableau ne change pas sa référence,
donc React ne voit rien.

```tsx
// INTERDIT : mutation, l'ecran ne bouge pas
shapes.push(nouvelleForme);
setShapes(shapes);            // meme reference -> React : « rien n'a change »

// CORRECT : nouveau tableau
setShapes([...shapes, nouvelleForme]);

// CORRECT : nouvel objet
setForm({ ...form, name: 'Dupont' });

// CORRECT : filtrage (filter cree deja un nouveau tableau)
setExtractions(extractions.filter((ex) => ex.id !== id));
```

**La forme fonctionnelle, et pourquoi Chiron l'utilise partout.**

```tsx
setPatients((current) => [...current, patient]);
//           ^^^^^^^ la valeur la PLUS RECENTE, garantie par React
```

Le problème qu'elle résout s'appelle la *stale closure* (fermeture périmée) :

```
   PROBLEME : deux mises a jour dans le meme rendu

   const [n, setN] = useState(0);
   setN(n + 1);      // n vaut 0 dans ce rendu -> planifie « n = 1 »
   setN(n + 1);      // n vaut TOUJOURS 0      -> planifie « n = 1 »
   Resultat : 1, alors qu'on attendait 2.

   SOLUTION : la forme fonctionnelle
   setN((c) => c + 1);   // React passe la valeur en attente -> 1
   setN((c) => c + 1);   // React passe 1                    -> 2
   Resultat : 2.
```

Le même piège se produit dans un `setTimeout`, un gestionnaire d'événement
enregistré une fois, ou une promesse : la fonction a « capturé » la valeur du
rendu où elle a été créée. Le code de Chiron le documente explicitement :

```tsx
// Viewer.tsx:128-131
/** Ecrit une valeur de formulaire sans capturer un `formData` perime. */
const handleFieldChange = (key: string, value: unknown) => {
  setFormData((previous) => ({ ...previous, [key]: value }));
};
```

Sans la forme fonctionnelle, remplir deux champs rapidement ferait disparaître
le premier.

**Règle pratique :** si la nouvelle valeur **dépend de l'ancienne**, forme
fonctionnelle obligatoire. Sinon, valeur directe.

### 4.2 État dérivé : ne stockez pas ce que vous pouvez calculer

Erreur de débutant classique :

```tsx
// MAUVAIS : deux sources de verite a synchroniser a la main
const [patients, setPatients] = useState<Patient[]>([]);
const [total, setTotal] = useState(0);   // oubli de mise a jour garanti
```

```tsx
// BON : une seule source, le reste se calcule
const [patients, setPatients] = useState<Patient[]>([]);
const total = patients.length;           // toujours juste, gratuitement
```

Chiron applique ce principe systématiquement. Dans `useWorkflow`, **rien** n'est
stocké en double : tout dérive de `state`, la réponse du serveur.

```tsx
// useWorkflow.ts:83-89 - etat DERIVE, recalcule a chaque rendu
const currentIndex = state ? Math.max(0, state.current_position - 1) : 0;
const isComplete   = state?.is_complete ?? false;
const canGoBack    = currentIndex > 0;
const mergedData   = state
  ? state.steps.reduce((acc, step) => ({ ...acc, ...step.data }), {})
  : EMPTY_DATA;
```

```
              LA SOURCE DE VERITE UNIQUE

                     state (reponse serveur)
                            |
        +---------+---------+----------+-------------+
        v         v         v          v             v
   currentIndex  isComplete  canGoBack  mergedData   steps[]
        |                                    |
        v                                    v
   quel formulaire OLGA charger ?      valeurs prerenplies du formulaire
```

Aucune désynchronisation possible : il n'y a qu'une donnée.

### 4.3 `useEffect` : la synchronisation avec le monde extérieur

Tout ce qui n'est **pas** du calcul de rendu va dans un effet : appels réseau,
abonnements, minuteurs, initialisation d'une bibliothèque impérative,
manipulation directe du DOM.

```tsx
useEffect(() => {
  // 1. LE CORPS : execute APRES que React a peint l'ecran
  const viewer = OpenSeadragon({ id: "openseadragon-viewer", … });
  viewerRef.current = viewer;

  return () => {
    // 2. LE NETTOYAGE : au demontage ET avant chaque reexecution
    viewerRef.current?.destroy();
  };
}, [rawUrl, isAnnotationMode, initialROI]);
//  ^^^^ 3. LE TABLEAU DE DEPENDANCES
```

```
             CYCLE DE VIE COMPLET D'UN useEffect

   MONTAGE du composant
        |
        v
   React rend puis peint l'ecran
        |
        v
   [ CORPS de l'effet ]  <---------------------+
        |                                      |
        v                                      | une dependance
   le composant vit sa vie                     | a change
        |                                      |
        +-- une dependance change ------------)|
        |        |                             |
        |        v                             |
        |   [ NETTOYAGE ]  ------------------- +
        |
        +-- le composant est demonte
                 |
                 v
            [ NETTOYAGE ]  (definitif)
```

**Le tableau de dépendances décide de tout :**

| Écriture | Quand l'effet s'exécute | Usage |
|---|---|---|
| `useEffect(fn)` | **à chaque rendu** | Presque toujours un bug |
| `useEffect(fn, [])` | une seule fois, au montage | Initialisation |
| `useEffect(fn, [a, b])` | au montage, puis dès que `a` ou `b` change | Le cas normal |

**Le nettoyage n'est pas optionnel.** Sans `viewer.destroy()`, chaque
navigation vers `/viewer` laisserait une instance OpenSeadragon vivante, avec
ses écouteurs d'événements et ses tuiles en mémoire. Fuite garantie, et sur des
images de plusieurs gigaoctets ça se voit vite.

**Le patron anti-course, utilisé partout dans Chiron.**

Problème : l'utilisateur ouvre l'extraction 1, puis très vite l'extraction 2.
Deux requêtes partent. Si celle de l'extraction 1 arrive **en dernier**, elle
écrase l'affichage de l'extraction 2.

```
   t=0   ouverture extraction 1 -> requete A part
   t=1   ouverture extraction 2 -> requete B part
   t=2   reponse B arrive -> affiche extraction 2      OK
   t=3   reponse A arrive -> ECRASE avec extraction 1  BUG
```

La parade tient en trois lignes :

```tsx
// useWorkflow.ts:58-81
useEffect(() => {
  if (!extractionId) return;

  let active = true;                       // (1) drapeau local a CET effet
  getWorkflow(extractionId)
    .then((fresh) => {
      if (!active) return;                 // (2) reponse obsolete : on jette
      setState(fresh);
      setStatus("ready");
    })
    .catch((cause: unknown) => {
      if (!active) return;
      setStatus("error");
      setError(/* … */);
    });

  return () => { active = false; };        // (3) invalide au nettoyage
}, [extractionId, attempt]);
```

Chaque exécution de l'effet crée **sa propre** variable `active`. Quand
`extractionId` change, React exécute le nettoyage de l'ancien effet, qui met
son `active` à `false` : la réponse tardive est ignorée.

`useOlgaForm` va un cran plus loin en **annulant réellement** la requête HTTP :

```tsx
// useOlgaForm.ts:50-83
const controller = new AbortController();
let active = true;

fetchFormSchema(step.olgaFormId, step.schemaId, controller.signal)
  .then(…)
  .catch((error) => {
    // une requete annulee n'est pas une panne : on l'ignore
    if (!active || (error instanceof OlgaError && error.kind === "aborted")) return;
    // repli sur l'instantane JSON Schema
  });

return () => {
  active = false;
  controller.abort();      // coupe la requete reseau
};
```

**`<StrictMode>` et le double montage.** En développement, React monte chaque
composant, le démonte, puis le remonte. Vous verrez donc **deux appels réseau**
dans l'onglet Réseau. Ce n'est pas un bug : c'est un test automatique de votre
nettoyage. Si l'application se comporte mal en double montage, c'est que le
nettoyage est incomplet. En production, cela n'arrive jamais.

**Le piège de la dépendance objet.**

```tsx
// BOUCLE INFINIE : { id } est un NOUVEL objet a chaque rendu,
// donc la dependance « change » toujours
useEffect(() => { … }, [{ id: patient.id }]);

// CORRECT : une valeur primitive
useEffect(() => { … }, [patient.id]);
```

C'est pourquoi `PatientCard` dépend de `[patient.folder_id]` (une chaîne) et non
de `[patient]` (un objet).

### 4.4 `useRef` : une case mémoire qui ne déclenche pas de rendu

```
   useState                              useRef
   +--------------------------+          +--------------------------+
   | survit aux rendus  OUI   |          | survit aux rendus  OUI   |
   | declenche un rendu OUI   |          | declenche un rendu NON   |
   | lecture : n              |          | lecture : ref.current    |
   | ecriture : setN(v)       |          | ecriture : ref.current=v |
   +--------------------------+          +--------------------------+

   « L'ecran doit changer ? »  ->  useState
   « Juste garder sous la main ? » ->  useRef
```

Deux usages, tous deux dans `Viewer.tsx:120-121` :

```tsx
const viewerRef    = useRef<OpenSeadragon.Viewer | null>(null); // (1)
const containerRef = useRef<HTMLDivElement>(null);              // (2)
```

**(1) Conserver un objet impératif.** L'instance OpenSeadragon doit survivre aux
rendus, mais la remplacer ne doit **surtout pas** provoquer de rendu : cela
créerait une boucle. `useRef` est le seul outil correct.

**(2) Référencer un nœud DOM.** On attache `ref={containerRef}` à un élément
JSX, et `containerRef.current` devient le vrai nœud DOM une fois monté. C'est
la porte de sortie officielle vers le DOM, utilisée par Chiron pour mesurer le
conteneur du calque SVG.

```
   +------------------------------------------------------------+
   |  FRONTIERE REACT / BIBLIOTHEQUE IMPERATIVE                  |
   |                                                            |
   |   React rend :   <div id="openseadragon-viewer" />          |
   |                        |                                   |
   |                        |  useEffect au montage             |
   |                        v                                   |
   |   OpenSeadragon({ id: "openseadragon-viewer" })             |
   |     prend le controle du contenu de ce div                 |
   |     et y injecte ses propres canvas                        |
   |                                                            |
   |   -> A partir d'ici, React NE DOIT PLUS toucher a ce div.   |
   |      L'instance vit dans viewerRef.current.                |
   |      Au demontage : viewerRef.current.destroy()            |
   +------------------------------------------------------------+
```

### 4.5 `useMemo` et `useCallback` : la mémoïsation

Les deux mémorisent un résultat entre les rendus, tant que les dépendances ne
changent pas.

| Hook | Mémorise | Sert à |
|---|---|---|
| `useMemo(fn, deps)` | **la valeur retournée** | Éviter un recalcul coûteux |
| `useCallback(fn, deps)` | **la fonction elle-même** | Garder une référence stable |

**`useMemo`, cas réel.** Le tableau de bord parcourt tous les patients et toutes
leurs biopsies pour produire quatre compteurs et deux jeux de données de
graphiques. Sans mémoïsation, ce calcul serait refait à **chaque** rendu, donc
à chaque ouverture de modale, à chaque frappe.

```tsx
// Dashboard.tsx:73-110
const { stats, pieData, activityData, hasActivity } = useMemo(() => {
  let totalPatients = 0, analyzedCount = 0, criticalCases = 0, healthyCases = 0;
  patients.forEach((patient) => { /* … double boucle … */ });
  return { stats: { … }, pieData, activityData, hasActivity };
}, [patients]);      // recalcul UNIQUEMENT si la liste change
```

**`useCallback`, cas réel et raison d'être.** Une fonction déclarée dans un
composant est **recréée à chaque rendu** : nouvelle référence, donc nouvelle
valeur pour un tableau de dépendances.

```
   SANS useCallback : boucle infinie

   rendu -> nouvelle fonction reload
         -> la dependance [reload] a « change »
         -> l'effet se relance
         -> il appelle setState
         -> nouveau rendu
         -> nouvelle fonction reload …   a l'infini

   AVEC useCallback : la MEME reference tant que [] ne change pas
   -> l'effet ne se relance pas
```

```tsx
// useWorkflow.ts:55-56
const reload     = useCallback(() => setAttempt((n) => n + 1), []);
const clearError = useCallback(() => setError(null), []);
```

Ces deux fonctions sont **retournées par le hook** et consommées par
`Viewer.tsx`. Sans `useCallback`, chaque rendu de `Viewer` recevrait des
fonctions différentes, ce qui invaliderait les effets et mémoïsations qui en
dépendent.

Remarquez au passage l'astuce de `reload` : il n'y a rien à « recharger »
manuellement, on incrémente simplement un compteur `attempt` qui figure dans
les dépendances de l'effet de chargement. Changer le compteur relance l'effet.
C'est le patron **clé de rafraîchissement**.

> **Quand ne PAS mémoïser.** `useMemo` et `useCallback` ont un coût (mémoire,
> comparaison des dépendances). Ne les employez que pour un calcul réellement
> coûteux, ou pour une valeur qui **sert de dépendance ailleurs**. Envelopper
> tout par réflexe rend le code illisible sans rien accélérer.

### 4.6 Les règles des hooks

```
   +------------------------------------------------------------+
   |  1. TOUJOURS au niveau racine du composant.                |
   |     Jamais dans un if, une boucle, une fonction imbriquee,  |
   |     jamais apres un return anticipe.                       |
   |                                                            |
   |  2. Seulement dans un composant React ou dans un HOOK       |
   |     PERSONNALISE (une fonction dont le nom commence par use)|
   +------------------------------------------------------------+
```

**Pourquoi.** React n'associe pas les hooks à un nom : il les identifie par
leur **ordre d'appel**. Le premier `useState` du composant, le deuxième, le
troisième...

```
   Rendu 1                        Rendu 2 (si le hook etait dans un if faux)

   1er appel -> useState(loading)  1er appel -> useState(error)
   2e  appel -> useState(error)    2e  appel -> useState(patients)
   3e  appel -> useState(patients)

   React rend a `loading` la valeur destinee a `error`. Chaos total.
```

`eslint-plugin-react-hooks`, activé dans
[eslint.config.js](../frontend/eslint.config.js), refuse ce code. Il vérifie
aussi le tableau de dépendances : si votre effet utilise une variable qui n'y
figure pas, il vous avertit. **Écoutez-le** : une dépendance manquante est un
bug de valeur périmée qui n'apparaîtra qu'en production.

### 4.7 Les hooks personnalisés : le vrai découpage

C'est le mécanisme le plus important du chapitre, et le moins bien compris.

Un **hook personnalisé** est simplement une fonction qui appelle d'autres hooks.
Il ne rend rien à l'écran : il **extrait la logique** d'un composant pour la
rendre réutilisable et testable.

```
        AVANT : tout dans le composant           APRES : logique extraite

   +---------------------------+        +-----------------+  +--------------+
   | Viewer.tsx                |        | useWorkflow.ts  |  | Viewer.tsx   |
   |                           |        |                 |  |              |
   |  useState x4              |        |  useState x4    |  |  const wf =  |
   |  useEffect (chargement)   |  --->  |  useEffect      |  |   useWorkflow|
   |  saveCurrentStep()        |        |  saveCurrentStep|  |   (id, user) |
   |  goToStep()               |        |  goToStep       |  |              |
   |  goBack()                 |        |  goBack         |  |  wf.state    |
   |  + 1700 lignes de dessin  |        |                 |  |  wf.goBack() |
   |                           |        |  return { … }   |  |  + le dessin |
   +---------------------------+        +-----------------+  +--------------+
        illisible, non testable          testable seul        lit comme
                                                              une API
```

Chiron possède deux hooks personnalisés, tous deux dans `features/workflow/` :

| Hook | Responsabilité | Retourne |
|---|---|---|
| [`useWorkflow(extractionId, currentUser)`](../frontend/src/features/workflow/useWorkflow.ts) | L'avancement du dossier, côté serveur | `state`, `status`, `error`, `currentIndex`, `isComplete`, `canGoBack`, `mergedData`, `saveCurrentStep`, `goBack`, `goToStep`, `clearError`, `reload` |
| [`useOlgaForm(stepIndex, enabled)`](../frontend/src/features/workflow/useOlgaForm.ts) | Le formulaire de l'étape courante, avec repli hors ligne | `step`, `schema`, `status`, `warning`, `unsupported`, `reload` |

Côté composant, ces 1 700 lignes de logique se réduisent à deux lignes :

```tsx
// Viewer.tsx:90 et 126
const workflow = useWorkflow(extractionId ?? null, currentUser);
const olgaForm = useOlgaForm(currentStep, isAnnotationMode);
```

**Ce qu'il faut retenir :** un hook personnalisé partage de la **logique**, pas
de l'**état**. Deux composants qui appellent `useWorkflow` obtiennent chacun
leur propre état, indépendant. Pour partager un état réel entre composants, il
faut un store : c'est le chapitre suivant.

---

## 5 - Où vit la donnée : états et « stores »

C'est **le** chapitre qui sépare quelqu'un qui bricole du React de quelqu'un
qui le maîtrise. La question « où je mets cette donnée ? » a six réponses
possibles, et le mauvais choix se paie pendant des mois.

### 5.1 La carte des six emplacements

```
   +-------------------------------------------------------------------------+
   |                        OU METTRE UNE DONNEE ?                           |
   +-------------------------------------------------------------------------+

   1. ETAT LOCAL              useState dans le composant
      « Un seul composant s'en sert »
      -> Chiron : showModal, dragging, textValue, labelInput

   2. ETAT LEVE               useState chez le PARENT commun + props
      « Deux freres doivent se synchroniser »
      -> Chiron : patients dans Dashboard, lu par PatientCard et UploadMedicalImage

   3. ETAT D'URL              react-router : /viewer?url=…  ou location.state
      « Doit survivre a un F5, ou etre partageable par lien »
      -> Chiron : ?url=, ?patient=, ?study=

   4. ETAT SERVEUR            recu par HTTP, le serveur fait foi
      « La verite est en base, pas dans le navigateur »
      -> Chiron : patients, extractions, WorkflowState

   5. ETAT PERSISTANT         localStorage / sessionStorage
      « Doit survivre a la fermeture de l'onglet »
      -> Chiron : biopsie_user

   6. ETAT GLOBAL             Context React, ou un STORE (Zustand, Redux…)
      « Beaucoup de composants eloignes, a tous les niveaux »
      -> Chiron : le THEME (clair/sombre), via ThemeProvider. Voir 5.6.
         L'identite de l'utilisateur, elle, devrait y etre et n'y est pas.
```

**L'ordre est un algorithme de décision.** Descendez la liste et arrêtez-vous
au premier qui convient. Ne montez au niveau supérieur que sous la contrainte.
Un état global posé « au cas où » est une dette immédiate.

### 5.2 État local et état levé

Commencez **toujours** local :

```tsx
// AddPatientModal.tsx:13-15 - personne d'autre n'a besoin de ces donnees
const [form, setForm]     = useState({ name: '', age: '', … });
const [saving, setSaving] = useState(false);
const [error, setError]   = useState<string | null>(null);
```

Quand deux composants doivent voir la **même** donnée, on la **remonte** au
parent commun le plus proche. C'est le *lifting state up*.

```
   AVANT : chacun charge sa liste     APRES : le parent detient, les enfants recoivent

   Dashboard                          Dashboard
     +-- PatientCard  (fetch)           |  [patients, setPatients] = useState([])
     +-- UploadModal  (fetch)           |
                                        +-- PatientCard      patient={p}
   Deux sources de verite.              +-- UploadModal      patients={patients}
   Creer un patient dans l'une
   ne met pas l'autre a jour.          Une seule source. Cree -> tout se remet a jour.
```

C'est exactement ce que fait Chiron :

```tsx
// Dashboard.tsx:41 - LE proprietaire de la liste
const [patients, setPatients] = useState<Patient[]>([]);

// Dashboard.tsx:215 - descend un patient a chaque carte
<PatientCard key={patient.id} patient={patient} onDeleted={fetchPatients} />

// Dashboard.tsx:223 - descend la liste ENTIERE a la modale d'import
<UploadMedicalImage patients={patients} onClose={…} onUploaded={fetchPatients} />
```

Le flux complet d'une création de patient :

```
   1. Clic « Nouveau Patient »
      Dashboard : setShowAddPatient(true)
            |
            v
   2. <AddPatientModal onCreated={handlePatientCreated} />  est monte
            |
            v
   3. L'utilisateur remplit. L'etat du formulaire est LOCAL a la modale.
            |
            v
   4. Soumission -> createPatient(...) -> POST /patients -> le backend repond
            |
            v
   5. La modale appelle onCreated(patient)   [remontee par callback]
            |
            v
   6. Dashboard : setPatients((c) => [...c, patient])
                  setShowAddPatient(false)
            |
            v
   7. React rerend : la nouvelle carte apparait, la modale disparait.
      Les statistiques du useMemo sont recalculees automatiquement.
```

### 5.3 Le *prop drilling*, et à partir de quand ça fait mal

Faire descendre une prop à travers des composants qui ne s'en servent pas
s'appelle le **prop drilling** (forage de props).

```
   Dashboard          detient `patients`
      |
      | patients={patients}
      v
   UploadMedicalImage   S'EN SERT (liste deroulante)      -> 1 niveau : OK
```

Un niveau, c'est sain. Trois ou quatre niveaux de composants qui ne font que
faire suivre la prop, c'est le signal qu'il faut un Context ou un store.

Chiron n'a pas ce problème sur `patients` (un seul niveau). Il l'a **contourné
d'une mauvaise manière** sur l'identité de l'utilisateur, voir juste après.

### 5.4 L'état persistant : `localStorage`

`localStorage` est un dictionnaire clé/valeur du navigateur, **synchrone**, qui
ne stocke que des **chaînes de caractères**, et qui survit à la fermeture de
l'onglet.

```tsx
// Login.tsx:14 - ecriture
localStorage.setItem("biopsie_user", username);

// Dashboard.tsx:47 - lecture
const username = localStorage.getItem("biopsie_user") || "Invité";

// Dashboard.tsx:113 - effacement
localStorage.removeItem("biopsie_user");
```

`biopsie_user` est **LA clé d'identité de toute l'application**. Elle est relue
indépendamment à quatre endroits :

| Fichier | Ligne | Variable locale | Usage |
|---|---|---|---|
| `Dashboard.tsx` | 47 | `username` | Nom affiché, initiales de l'avatar |
| `PatientCard.tsx` | 64 | `doctorName` | Pilote l'affichage du bouton supprimer |
| `Viewer.tsx` | 65 | `currentUser` | Auteur des tracés, couleur verte / orange |
| `RadiologyViewer.tsx` | 64 | `storedName` | Signature du compte rendu |

```
                    L'ETAT LE PLUS GLOBAL DU PROJET,
                    SANS AUCUN MECANISME DE PARTAGE

                        localStorage["biopsie_user"]
                                  |
          +------------+----------+-----------+--------------+
          v            v                      v              v
     Dashboard    PatientCard             Viewer      RadiologyViewer
     « username » « doctorName »      « currentUser »  (signature)
     defaut :     defaut :            defaut :         defaut :
     "Invité"     "Dr. Non assigné"   "Inconnu"        "Inconnu"

     -> QUATRE lectures, QUATRE noms, TROIS valeurs par defaut differentes.
     -> Aucun composant n'est NOTIFIE si la valeur change.
```

**Les trois défauts de cette approche, à connaître pour la soutenance :**

1. **Ce n'est pas de l'état React.** Modifier `localStorage` ne provoque aucun
   rendu. Si l'utilisateur se déconnecte dans un onglet, les autres continuent
   d'afficher son nom.
2. **Trois valeurs par défaut incohérentes pour quatre lectures.** Le même
   utilisateur non connecté est « Invité » sur le tableau de bord, « Dr. Non
   assigné » sur une carte patient et « Inconnu » dans les visionneuses.
3. **Ce n'est pas une authentification.** La valeur est modifiable dans la
   console du navigateur en trois secondes, et aucun service ne la vérifie.
   Voir [09 - Pièges et bugs](09-pieges-et-bugs.md).

### 5.5 Les « stores » : ce que c'est, vraiment

Le mot **store** (magasin, dépôt) désigne un **conteneur d'état vivant en
dehors de l'arbre des composants**, auquel n'importe quel composant peut
s'abonner directement, sans passer par les props.

```
   SANS STORE : la donnee descend, niveau par niveau

         App
          |  user
          v
       Dashboard
          |  user
          v
       PatientCard
          |  user
          v
       BoutonSupprimer   <- enfin, celui qui en avait besoin
                            (les 3 intermediaires ne s'en servent pas)

   AVEC STORE : la donnee est a cote, chacun se sert

        +-------------------+
        |      STORE        |   { user: "Dr.House", login(), logout() }
        +---+-----+-----+---+
            |     |     |
            |     |     +---------------------+
            v     v                           v
        Dashboard  Viewer              BoutonSupprimer
        s'abonne   s'abonne            s'abonne

        Un logout() -> TOUS les abonnes se rerendent automatiquement.
```

**Les trois différences avec `localStorage` :**

| | `localStorage` | Store |
|---|---|---|
| Notifie les composants du changement | **Non** | **Oui**, c'est sa raison d'être |
| Peut contenir des objets, fonctions | Non (chaînes seulement) | Oui |
| Survit au rechargement de la page | Oui | Non (sauf couche de persistance explicite) |

Les deux sont donc **complémentaires** : le store gère la réactivité, le
`localStorage` la persistance. Un store bien fait lit le `localStorage` à
l'initialisation et y réécrit à chaque changement.

**Les trois familles de solutions :**

```
   1. CONTEXT REACT (natif, zero dependance)
      createContext + useContext + un Provider qui enveloppe l'application.
      Convient pour une donnee qui change PEU : utilisateur, theme, langue.
      Limite : tout consommateur se rerend des que la valeur change,
               meme s'il ne s'interesse qu'a un champ.

   2. ZUSTAND (~1 ko, le plus simple des stores dedies)
      const useAuth = create((set) => ({ user: null, login: (u) => set({user:u}) }))
      Selecteur fin : useAuth((s) => s.user) ne rerend que si `user` change.

   3. REDUX TOOLKIT (le plus structure, le plus verbeux)
      actions + reducers + devtools avec voyage dans le temps.
      Justifie sur une grosse equipe et un etat complexe. Surdimensionne ici.
```

### 5.6 Le Context du thème, et celui qui manque encore

Chiron n'utilise **aucune bibliothèque de store** : `package.json` ne contient ni
`redux`, ni `zustand`, ni `jotai`, ni `@tanstack/react-query`. En revanche il
possède depuis la refonte graphique **un Context natif**, et c'est le meilleur
exemple à lire pour comprendre le mécanisme.

#### Le cas réel : le thème clair / sombre

Le thème est lu par la barre de navigation, par l'écran de connexion et par les
graphiques du tableau de bord. Trois composants sans aucun lien de parenté :
le faire descendre en props traverserait toute l'arborescence pour rien.

```tsx
// src/features/theme/themeContext.ts   (le contexte et le hook)
export const ThemeContext = createContext<ThemeValue | null>(null);

export function useTheme(): ThemeValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme doit être utilisé dans <ThemeProvider>");
  return value;      // ← échec bruyant plutôt que valeur factice
}
```

```tsx
// src/features/theme/ThemeProvider.tsx   (le composant)
const [theme, setThemeState] = useState<Theme>(readInitialTheme);  // initialiseur PARESSEUX

useEffect(() => {
  document.documentElement.setAttribute("data-theme", theme);      // réactivité -> DOM
  localStorage.setItem(THEME_STORAGE_KEY, theme);                  // persistance
}, [theme]);
```

```
   main.tsx
     +-- <ThemeProvider>          <- detient l'etat, enveloppe TOUT
           +-- <App>
                 +-- Dashboard ------ useTheme()  (couleurs des graphiques)
                 +-- AppShell -------- useTheme()  (bouton de bascule)
                 +-- Login ----------- useTheme()  (bouton de bascule)

   Un seul setTheme() -> les trois se rerendent. Aucune prop traversee.
```

**Pourquoi deux fichiers ?** La règle ESLint `react-refresh/only-export-components`
interdit qu'un fichier exportant un composant exporte aussi autre chose : sinon
le rafraîchissement à chaud ne sait plus quoi remplacer et recharge toute la
page. Le contexte et le hook vivent donc dans un `.ts`, le Provider dans un
`.tsx`.

**Le détail qui compte : le thème ne passe pas par React pour s'afficher.**
Le Provider se contente de poser `data-theme="dark"` sur `<html>` ; ce sont les
variables CSS de `index.css` qui changent de valeur. Aucun composant n'a besoin
de connaître le thème pour s'afficher correctement (voir 8.2). Seul le tableau
de bord appelle `useTheme()`, parce que Recharts dessine en JavaScript et ne
peut pas lire une variable CSS.

#### Le cas manquant : l'identité de l'utilisateur

Le même patron corrigerait les quatre lectures de `localStorage` de la section
5.4. C'est la réponse à donner si on vous demande « et comment feriez-vous
mieux ? ».

```tsx
// src/features/auth/AuthContext.tsx   (fichier a creer, sur le modele du theme)
const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  // Initialiseur paresseux : le localStorage n'est lu qu'au premier rendu.
  const [user, setUser] = useState<string | null>(
    () => localStorage.getItem("biopsie_user"),
  );

  // useCallback : ces fonctions entrent dans la valeur du Context ; une
  // reference stable evite de rerendre tous les consommateurs.
  const login = useCallback((name: string) => {
    localStorage.setItem("biopsie_user", name);   // persistance
    setUser(name);                                // reactivite
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("biopsie_user");
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
```

```
   AVANT                                  APRES

   localStorage["biopsie_user"]           <AuthProvider>   (etat React)
        |  4 lectures independantes            |  1 source, 4 abonnes
        |  aucune notification                 |  notification automatique
        v                                      v
   Dashboard  "Invité"                    Dashboard   \
   PatientCard "Dr. Non assigné"          PatientCard  |  useAuth()
   Viewer     "Inconnu"                   Viewer       |  meme valeur
   RadioViewer "Inconnu"                  RadioViewer  /  meme defaut
```

**Bénéfice concret :** `logout()` met immédiatement à jour toute l'interface,
la valeur par défaut est définie une seule fois, et le jour où un vrai jeton
JWT arrive, il n'y a **qu'un fichier à modifier**.

### 5.7 L'état serveur : le vrai store de Chiron

Il existe une cinquième catégorie que les débutants confondent avec l'état
local, alors qu'elle obéit à des règles opposées : **l'état serveur**.

| | État client | État serveur |
|---|---|---|
| Propriétaire | Le navigateur | La base de données |
| Peut être périmé | Non | **Oui, en permanence** |
| Autre utilisateur peut le changer | Non | **Oui** |
| Doit gérer chargement / erreur / nouvelle tentative | Non | **Oui** |

`useWorkflow` est, de fait, un **store d'état serveur écrit à la main**. Il
implémente exactement ce qu'une bibliothèque comme React Query fournirait.

```
   +----------------------------------------------------------------------+
   |            useWorkflow : anatomie d'un store d'etat serveur           |
   +----------------------------------------------------------------------+

   ETAT INTERNE (4 useState)
     state    : WorkflowState | null    la reponse du serveur, telle quelle
     status   : idle|loading|ready|saving|error
     error    : string | null           message deja traduit pour l'humain
     attempt  : number                  cle de rafraichissement (voir 4.5)

   CHARGEMENT (useEffect [extractionId, attempt])
     GET /extractions/{id}/workflow
     avec le drapeau `active` anti-course

   ETAT DERIVE (recalcule a chaque rendu, jamais stocke)
     currentIndex  <- state.current_position - 1
     isComplete    <- state.is_complete
     canGoBack     <- currentIndex > 0
     mergedData    <- fusion des data de toutes les etapes

   ACTIONS (useCallback, retournees au composant)
     saveCurrentStep(data, validate)  PUT  …/steps/{step}   -> setState(reponse)
     goToStep(stepId)                 POST …/goto           -> setState(reponse)
     goBack()                         appelle goToStep(precedent)
     reload()                         setAttempt(n => n+1)
     clearError()
```

Le principe directeur, écrit en tête du fichier :

> « L'avancement est une donnée serveur : le client la lit et demande des
> transitions, il ne la décide jamais. »
> [workflowApi.ts:1-7](../frontend/src/features/workflow/workflowApi.ts#L1-L7)

Conséquence architecturale majeure : **après chaque action, on ne modifie pas
l'état local, on remplace tout par la réponse du serveur.**

```
   MAUVAIS (optimiste et faux)          BON (ce que fait Chiron)

   await save(data);                    const updated = await saveWorkflowStep(…);
   setCurrentStep(currentStep + 1);     setState(updated);
   // le client DECIDE de l'avancement  // le SERVEUR dit ou on en est
   // -> divergence garantie si le      // -> impossible de diverger
   //    serveur refuse la transition
```

**Le patron de superposition des valeurs de formulaire.** `Viewer` doit
afficher les valeurs déjà enregistrées (serveur) recouvertes par la saisie en
cours (client) :

```tsx
// Viewer.tsx:96-102
const [formData, setFormData] = useState<Record<string, unknown>>({});

/** Valeurs affichees : etat serveur, recouvert par la saisie en cours. */
const formValues = {
  ...workflow.mergedData,   // socle : ce que le serveur connait
  ...formData,              // dessus : ce que l'utilisateur vient de taper
};
```

```
   mergedData (serveur)     { taille: "12mm", site: "QSE" }
   formData   (saisie)      {                 site: "QSI" }
                            ------------------------------
   formValues (affiche)     { taille: "12mm", site: "QSI" }
                              ^ vient du serveur   ^ saisie en cours gagne
```

Élégant, sans duplication, et le rechargement du serveur ne perd jamais la
saisie en cours.

### 5.8 Le repli hors ligne : une décision produit dans du code

`useOlgaForm` illustre un point rarement traité dans les tutoriels : que faire
quand un service externe tombe ?

```
   useOlgaForm(stepIndex, enabled)
            |
            v
   GET {VITE_OLGA_API_URL}/…/forms/{olgaFormId}
            |
      +-----+----------------------------+
      |                                  |
   SUCCES                             ECHEC (panne, timeout, CORS)
      |                                  |
      v                                  v
   status = "live"                  status = "snapshot"
   schema = celui d'OLGA            schema = SCHEMA_SNAPSHOTS[step.id]
   warning = null                            (import JSON local)
                                    warning = message explicatif
      |                                  |
      +-----------------+----------------+
                        v
              OlgaFormPanel affiche le formulaire.
              En mode snapshot : bandeau ambre
              « Formulaire charge depuis la copie enregistree.
                Votre saisie est conservee. » + bouton Reessayer
```

La règle, écrite en tête du fichier :

> « L'interface n'est JAMAIS bloquée. Si OLGA ne répond pas, on sert
> l'instantané JSON Schema versionné et on le signale, plutôt que de laisser
> un écran "Chargement..." indéfini. »
> [useOlgaForm.ts:1-7](../frontend/src/features/workflow/useOlgaForm.ts#L1-L7)

Notez aussi la technique de l'**état dérivé pour le chargement**, plus subtile
que la moyenne :

```tsx
// useOlgaForm.ts:44-48 puis 84-92
const requestKey = `${step.id}#${attempt}`;   // identifie LA requete courante
// …
const isCurrent = loaded?.requestKey === requestKey;
return {
  schema: isCurrent ? loaded.schema : null,
  status: isCurrent ? loaded.status : "loading",
  // …
};
```

Plutôt que de faire `setStatus("loading")` au début de chaque effet (ce qui
provoquerait un rendu supplémentaire et un clignotement), le hook **étiquette**
chaque résultat. Si l'étiquette du résultat mémorisé ne correspond pas à la
requête courante, c'est qu'on est en train de charger. Zéro rendu inutile, zéro
possibilité d'afficher le formulaire de l'étape précédente.

### 5.9 Tableau de décision

À afficher au-dessus du bureau :

| La donnée... | Emplacement | Exemple Chiron |
|---|---|---|
| ne sert qu'ici | `useState` local | `dragging`, `textValue`, `showModal` |
| sert à deux frères | `useState` chez le parent + props | `patients` dans `Dashboard` |
| doit survivre à `F5` ou être partageable par lien | URL (`?param=`) | `/viewer?url=…` |
| est la propriété du serveur | hook d'état serveur | `useWorkflow` |
| doit survivre à la fermeture de l'onglet | `localStorage` (via un store) | `biopsie_user` |
| est lue par plus de trois composants éloignés | Context ou store | manquant dans Chiron |
| peut être **calculée** à partir d'une autre | **nulle part**, on la calcule | `currentIndex`, `stats` |

---

## 6 - Le routage : une URL, un composant

### 6.1 Le principe

`react-router-dom` intercepte la navigation et, au lieu de laisser le
navigateur demander une page au serveur, il **remplace le composant affiché**.

```
   URL demandee              App.tsx trouve la Route          Composant rendu
   ---------------------------------------------------------------------------
   /login              ->    <Route path="/login">      ->    Login
   /dashboard          ->    <Route path="/dashboard">  ->    Dashboard
   /viewer?url=x.dzi   ->    <Route path="/viewer">     ->    Viewer
   /radiology?…        ->    <Route path="/radiology">  ->    RadiologyViewer
   /nimportequoi       ->    <Route path="*">           ->    redirection /dashboard
```

```tsx
// App.tsx
const isAuthenticated = true;         // <- constante litterale

<Router>
  <Routes>
    <Route path="/login"     element={<Login />} />
    <Route path="/dashboard" element={isAuthenticated ? <Dashboard /> : <Navigate to="/login" />} />
    <Route path="/viewer"    element={isAuthenticated ? <Viewer />    : <Navigate to="/login" />} />
    <Route path="/radiology" element={isAuthenticated ? <RadiologyViewer /> : <Navigate to="/login" />} />
    <Route path="*"          element={<Navigate to="/dashboard" />} />
  </Routes>
</Router>
```

> **Avertissement.** `isAuthenticated` est une **constante en dur à `true`**.
> Les gardes de route ne protègent donc rien : `/dashboard` est accessible sans
> être passé par `/login`. Le code **suggère** une protection qui n'existe pas.
> C'est le premier chantier si l'authentification est implémentée un jour.

### 6.2 Les trois façons de transmettre une donnée à une page

```
   +-------------------------------------------------------------------------+
   | 1. QUERY STRING     /viewer?url=lame.dzi                                |
   |    visible, partageable, SURVIT au F5                                    |
   |    lecture : new URLSearchParams(location.search).get("url")             |
   |    -> Chiron : ?url=, ?patient=, ?study=                                   |
   +-------------------------------------------------------------------------+
   | 2. LOCATION STATE   navigate('/viewer', { state: { extractionId: 7 } })  |
   |    invisible, accepte des OBJETS, mais PERDU AU F5                       |
   |    lecture : location.state?.extractionId                                |
   |    -> Chiron : patientName, folderId, extractionId, roi, image_url         |
   +-------------------------------------------------------------------------+
   | 3. PARAMETRE DE CHEMIN  /patients/:id                                    |
   |    la forme la plus propre pour une ressource                            |
   |    -> Chiron : NON UTILISE                                                 |
   +-------------------------------------------------------------------------+
```

L'appel réel qui ouvre la visionneuse :

```tsx
// PatientCard.tsx:131
navigate(`/viewer?url=${encodeURIComponent(mainImageUrl)}`, {
  state: { patientName: patient.name, folderId: patient.folder_id, … },
});
```

Et la lecture, côté `Viewer` :

```tsx
// Viewer.tsx:63-73
const location = useLocation();

const searchParams = new URLSearchParams(location.search);
const rawUrl = searchParams.get("url");              // survit au F5

const patientName  = location.state?.patientName || "Patient";   // perdu au F5
const folderId     = location.state?.folderId    || "X-00";      // perdu au F5
const extractionId = location.state?.extractionId;               // perdu au F5

const isAnnotationMode = !!extractionId;   // <- CONSEQUENCE MAJEURE
```

### 6.3 Le piège du `location.state`, illustré

```
   PARCOURS NORMAL                      APRES UN F5 SUR LA MEME URL

   Dashboard                            (le navigateur recharge tout)
     clic « Annoter »                        |
        |                                    v
        v                              location.state === undefined
   navigate('/viewer?url=…', {               |
     state: { extractionId: 7 }})            v
        |                              extractionId === undefined
        v                                    |
   location.state.extractionId = 7           v
        |                              isAnnotationMode === FALSE
        v                                    |
   isAnnotationMode = TRUE                   v
        |                              -> panneau lateral ABSENT
        v                              -> useWorkflow(null) ne charge rien
   -> panneau lateral, workflow,        -> useOlgaForm(…, false) desactive
      formulaire OLGA charges           -> le nom du patient devient « Patient »
                                        -> AUCUN message d'erreur
```

**C'est le bug le plus déroutant du frontend** : la page fonctionne, mais
amputée de la moitié de ses fonctions, sans rien signaler. La correction
propre serait de passer `extractionId` dans la query string
(`/viewer?url=…&extraction=7`), ce qui rendrait l'URL rechargeable et
partageable entre collègues.

### 6.4 `navigate` contre `<a href>`

```tsx
// INTERDIT dans une SPA : recharge toute la page, detruit l'etat React
<a href="/dashboard">Retour</a>

// CORRECT : navigation cote client
const navigate = useNavigate();
<button onClick={() => navigate('/dashboard')}>Retour</button>

// CORRECT aussi, pour un vrai lien (clic droit, ouvrir dans un onglet)
<Link to="/dashboard">Retour</Link>
```

Chiron utilise exclusivement `useNavigate` avec des `<button>`. C'est correct
fonctionnellement, mais `<Link>` serait meilleur pour l'accessibilité et pour
permettre l'ouverture dans un nouvel onglet.

---

## 7 - TypeScript dans React : le strict nécessaire

TypeScript ajoute des types à JavaScript. Ils sont **entièrement effacés** à la
compilation : à l'exécution, il n'en reste rien. C'est un filet pour le
développeur et l'éditeur, pas une validation à l'exécution.

```
   VOTRE CODE .tsx        --- tsc / Vite --->    JS PUR (types EFFACES)

   interface Patient {                          (rien du tout)
     id: number;
     name: string;
   }
   const p: Patient = …                         const p = …
```

**Conséquence à ne jamais oublier :** une réponse d'API typée `Patient[]` n'est
pas *vérifiée*. Si le backend renvoie autre chose, TypeScript n'y peut rien.
D'où la précaution défensive du tableau de bord :

```tsx
// Dashboard.tsx:55-59
const data = await getPatients();
if (Array.isArray(data)) setPatients(data);
else setPatients([]);
```

### 7.1 Les cinq formes que vous rencontrerez dans Chiron

**a) Typer les props par une interface**

```tsx
// AddPatientModal.tsx:7-10
interface AddPatientModalProps {
  onClose: () => void;                      // fonction sans argument ni retour
  onCreated: (patient: Patient) => void;    // fonction prenant un Patient
}

export default function AddPatientModal({ onClose, onCreated }: AddPatientModalProps) {
```

**b) Typer les props en ligne** (acceptable pour deux props)

```tsx
// PatientCard.tsx:49
const PatientCard = ({ patient, onDeleted }: { patient: Patient; onDeleted?: () => void }) => {
//                                                                          ^ le ? = optionnelle
```

**c) Typer un état**

```tsx
const [patients, setPatients] = useState<Patient[]>([]);        // explicite
const [error, setError] = useState<string | null>(null);        // union de types
const [type, setType] = useState<'biopsy' | 'radiology'>('biopsy');  // union litterale
const [saving, setSaving] = useState(false);                    // infere : boolean
```

L'union littérale `'biopsy' | 'radiology'` est un mini-enum : l'éditeur propose
les deux valeurs et refuse toute autre chaîne.

**d) Décrire un contrat d'API**

```tsx
// services/api.ts:6-21
export interface Biopsy  { id: number; image_url: string; status: string; }
export interface Patient {
  id: number;
  name: string;
  age: number;
  folder_id: string;
  biopsies: Biopsy[];
  birth_date?: string;        // le ? correspond aux champs nullables en base
  family_history?: string;
  medical_history?: string;
}
```

Ces interfaces sont le **miroir des schémas Pydantic du backend**. Quand une
colonne change côté Python, il faut modifier ce fichier : rien ne le fait
automatiquement. C'est un couplage à surveiller.

**e) `as const` : figer un objet en type**

C'est l'astuce la plus élégante du projet.

```ts
// steps.ts:11-40
export const WORKFLOW_STEPS = [
  { id: "prelevement", order: 1, label: "Prélèvement", olgaFormId: "a44b…", schemaId: "wigo:workflow:prelevement" },
  { id: "preparation", order: 2, … },
  { id: "microscopie", order: 3, … },
  { id: "diagnostic",  order: 4, … },
] as const;

export type WorkflowStep   = (typeof WORKFLOW_STEPS)[number];
export type WorkflowStepId = WorkflowStep["id"];
export const STEP_COUNT    = WORKFLOW_STEPS.length;
```

```
   SANS as const                      AVEC as const

   id: string                         id: "prelevement" | "preparation"
   (n'importe quelle chaine)               | "microscopie" | "diagnostic"

   -> une faute de frappe passe       -> WorkflowStepId n'accepte QUE
      a la compilation                   ces 4 valeurs exactes.
                                      -> ajouter une etape au TABLEAU
                                         met a jour le TYPE tout seul.
```

Une seule source de vérité (le tableau), et les types s'en déduisent. Ajouter
une cinquième étape ne demande de toucher à aucun type.

### 7.2 `type` contre `interface`

En pratique : `interface` pour la forme d'un objet (props, entité métier),
`type` pour les unions et les alias. Chiron suit cette convention.

```ts
export interface UseWorkflowResult { … }                  // forme d'objet
export type WorkflowStatus = "idle" | "loading" | "ready" | "saving" | "error";  // union
```

### 7.3 Les opérateurs de sûreté

`strict: true` étant activé, ces trois opérateurs sont omniprésents :

| Opérateur | Nom | Effet |
|---|---|---|
| `?.` | chaînage optionnel | `state?.is_complete` vaut `undefined` si `state` est `null`, au lieu de planter |
| `??` | coalescence de nullité | `state?.is_complete ?? false` : la valeur si elle existe, sinon `false`. **Différent de `\|\|`** qui remplace aussi `0` et `""` |
| `!` | assertion non-null | « je garantis que ce n'est pas null ». À n'employer qu'avec une preuve, comme `getElementById('root')!` |

---

## 8 - Tailwind CSS : le style dans le JSX

### 8.1 Le principe

Aucun fichier CSS par composant. Des **classes utilitaires**, une par
propriété, écrites directement dans le JSX.

```
   CSS CLASSIQUE                          TAILWIND

   .carte {                               <div className="bg-slate-900
     background: #0f172a;                              border border-slate-800
     border: 1px solid #1e293b;                        rounded-2xl p-6">
     border-radius: 1rem;
     padding: 1.5rem;                     Pas de fichier separe.
   }                                      Pas de nom de classe a inventer.
   <div class="carte">                    Pas de CSS mort quand on supprime
                                          le composant.
```

Décodage d'une ligne réelle de Chiron :

```tsx
<div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 hover:border-cyan-500/50 transition-all">
//              |            |                       |          |   |                          |
//              fond         bordure                 arrondi    |   au survol, bordure cyan    animation
//                                                   padding 1.5rem  a 50% d'opacite
```

### 8.2 Le système de jetons de Chiron

Tailwind 4 abandonne `tailwind.config.js` : tout se passe **dans le CSS**.
Chiron n'a d'ailleurs aucun `tailwind.config.js`.

Le projet ne nomme **jamais une couleur par sa teinte** (`bg-slate-900`,
`text-cyan-400`). Il nomme un **rôle** : surface, ligne, encre, accent. La
valeur derrière ce rôle change avec le thème, et aucun `.tsx` n'a besoin d'être
modifié.

```css
/* src/index.css, tres resume */
@import "tailwindcss";

:root {                      /* theme clair */
  --wg-surface: #ffffff;     /* cartes, panneaux */
  --wg-ink:     #1e2a3a;     /* texte principal */
  --wg-muted:   #46586f;     /* texte secondaire */
  --wg-accent:  #10b981;     /* action principale */
}

[data-theme="dark"] {        /* theme sombre : memes JETONS, autres VALEURS */
  --wg-surface: #1e2a3a;
  --wg-ink:     #eef2f7;
  --wg-muted:   #a9b7c9;
  --wg-accent:  #10b981;
}

@theme inline {              /* expose les jetons a Tailwind */
  --color-surface: var(--wg-surface);
  --color-ink:     var(--wg-ink);
  --color-muted:   var(--wg-muted);
  --color-accent:  var(--wg-accent);
}
```

```
   ThemeProvider pose data-theme="dark" sur <html>
            |
            v
   [data-theme="dark"] redefinit les --wg-*
            |
            v
   @theme inline : --color-surface pointe sur var(--wg-surface)
            |
            v
   .bg-surface { background: var(--color-surface) }
            |
            v
   TOUTE l'interface change de couleur. Zero rendu React. Zero classe dark:.
```

**Le mot `inline` est le pivot.** Sans lui, Tailwind **copierait** la valeur au
moment de la compilation et le thème serait figé. Avec lui, l'utilitaire
**pointe** sur la variable, qui est réévaluée par le navigateur.

**Les classes de composants.** Les motifs répétés (bouton, champ, carte,
modale) sont définis une fois dans `index.css`, dans `@layer components` :

| Classe | Rôle |
|---|---|
| `wg-card` | Carte : surface, bordure, rayon, ombre discrète |
| `wg-btn` + `wg-btn-primary` / `-secondary` / `-quiet` / `-danger` | Boutons |
| `wg-input`, `wg-label` | Champs de saisie et libellés |
| `wg-modal-backdrop`, `wg-modal`, `wg-modal-head/body/foot` | Modales |
| `wg-note` + `-danger` / `-warn` / `-accent` | Bandeaux de message |
| `wg-overlay-bar`, `wg-overlay-btn`, `wg-overlay-action` | Barres flottantes posées **sur une image médicale** (toujours sombres) |

> **Pourquoi `@layer components` et pas du CSS nu ?** Du CSS hors couche
> l'emporte sur **toute** couche, y compris les utilitaires Tailwind. Un
> `px-3` posé sur un `.wg-btn` serait alors ignoré. Dans la couche
> `components`, l'ordre redevient naturel : une utilitaire ponctuelle surcharge
> la classe de composant.

> **Le piège des classes construites dynamiquement.** Tailwind scanne le code
> source en **texte brut**. `className={`bg-${couleur}`}` ne sera jamais
> détecté, et la classe n'existera pas dans le CSS final. Il faut écrire les
> noms complets : `ok ? 'bg-accent' : 'bg-danger'`.

### 8.3 Les jetons, et ce qu'ils signifient

| Jeton | Rôle | Clair | Sombre |
|---|---|---|---|
| `canvas` | Fond de page | `#f4f6f8` | `#141c26` |
| `surface` | Cartes, panneaux, modales | `#ffffff` | `#1e2a3a` |
| `raised` | Survol, remplissage discret | `#eef1f5` | `#26344a` |
| `line` / `line-strong` | Bordures | `#dfe4ea` / `#c3ccd7` | `#2f3f54` / `#46586f` |
| `ink` | Texte principal | `#1e2a3a` | `#eef2f7` |
| `muted` | Libellés, texte secondaire | `#46586f` | `#a9b7c9` |
| `faint` | Mentions tertiaires | `#7a8799` | `#7f8da0` |
| `nav` | Barre supérieure | `#1e2a3a` | `#16202c` |
| `accent` | Action principale, validation | `#10b981` | `#10b981` |
| `danger` | Erreur, suppression | `#c94b4b` | `#d05a5a` |
| `warn` | Avertissement, repli hors ligne | `#b8791f` | `#d1913a` |
| `imaging` | Zone d'affichage des images | `#0c1117` | `#0c1117` |

Les trois couleurs de la charte sont `ink` (#1e2a3a), `muted` (#46586f) et
`accent` (#10b981). Tout le reste en découle.

**Deux règles de couleur propres au métier :**

1. **`imaging` est sombre dans les deux thèmes.** Un fond clair fausse la
   perception des niveaux de gris sur une image médicale et éblouit lors de la
   lecture d'une lame. Les barres d'outils qui flottent au-dessus de l'image
   (`wg-overlay-*`) sont sombres pour la même raison.
2. **Le vert et l'orange des tracés ne sont pas des couleurs de charte, mais
   des données.** Dans la visionneuse, vert = mes annotations, orange = celles
   des collègues. Ces deux valeurs sont écrites en dur dans le SVG, et ne
   doivent pas suivre le thème : ce serait changer le sens de l'information.

**L'état ne repose jamais sur la seule couleur.** Le `WorkflowStepper` encode
trois états métier (validée, en cours, verrouillée) par un chiffre, une coche
ou un cadenas, **en plus** de la couleur, et l'énonce dans l'infobulle. Une
interface médicale doit rester lisible pour un praticien daltonien.

---

## 9 - Un parcours complet, de bout en bout

Le meilleur moyen de vérifier qu'on a compris : suivre un clic depuis le
tableau de bord jusqu'à la base de données. Prenons **la saisie de l'étape 1 du
compte rendu**.

```
 [1] Dashboard.tsx
     L'utilisateur clique « Annoter » sur une carte patient.
                    |
                    v
 [2] PatientCard.tsx:131
     navigate(`/viewer?url=${…}`, { state: { extractionId, roi, patientName } })
                    |
                    v
 [3] App.tsx
     La Route /viewer correspond -> React monte <Viewer />
                    |
                    v
 [4] Viewer.tsx:63-73
     Lit location.search  -> rawUrl        (survit au F5)
     Lit location.state   -> extractionId  (perdu au F5)
     isAnnotationMode = !!extractionId  ->  true
                    |
        +-----------+-----------------------------+
        |                                         |
        v                                         v
 [5a] useEffect [rawUrl, …]                 [5b] useWorkflow(extractionId, user)
      OpenSeadragon({ id: "openseadragon-       GET /extractions/7/workflow
      viewer", tileSources: … })                       |
      viewerRef.current = viewer                       v
      nettoyage : viewer.destroy()             WorkflowState :
        |                                      { current_step: "prelevement",
        v                                        current_position: 1,
      La lame s'affiche, zoomable                steps: [ … ], … }
                                                       |
                                                       v
                                              currentIndex = 0  (etat derive)
                                                       |
                                                       v
                                        [5c] useOlgaForm(0, true)
                                             GET {OLGA}/…/forms/a44b3f32-…
                                                       |
                                        +--------------+--------------+
                                        |                             |
                                     SUCCES                        ECHEC
                                        |                             |
                                        v                             v
                                 status "live"              status "snapshot"
                                 schema d'OLGA              prelevement.json local
                                        |                   + bandeau ambre
                                        +--------------+--------------+
                                                       |
                                                       v
 [6] Rendu du panneau lateral
     <WorkflowStepper state={workflow.state} onSelect={workflow.goToStep} />
     <OlgaFormPanel {...olgaForm} values={formValues} onChange={handleFieldChange} />
                    |
                    v
     JsonSchemaForm parcourt schema.properties et rend un champ par propriete
     selon x-control : text | textarea | select | number | checkbox
                    |
                    v
 [7] L'utilisateur tape dans un champ
     onChange -> handleFieldChange(key, value)
              -> setFormData((prev) => ({ ...prev, [key]: value }))
                    |
                    v
     Nouveau rendu. formValues = { ...workflow.mergedData, ...formData }
                    |
                    v
 [8] Clic « Valider l'etape »
     workflow.saveCurrentStep(formValues, true)
                    |
                    v
     PUT /extractions/7/workflow/steps/prelevement
     body : { data, validated_by: currentUser, validate_step: true }
                    |
        +-----------+------------------------------+
        |                                          |
     200 OK                                    409 Conflict
        |                                          |
        v                                          v
     setState(reponse complete du serveur)   WorkflowApiError("missing_fields", …)
     -> current_position passe a 2           -> setError(cause.message)
     -> currentIndex passe a 1               -> le message s'affiche,
     -> useOlgaForm(1) charge « Preparation »   on RESTE sur l'etape
     -> le stepper marque l'etape 1 « ✓ »
```

**Les huit mécanismes React que ce parcours mobilise :**

| Étape | Mécanisme |
|---|---|
| [2] | Navigation programmatique + `location.state` |
| [3] | Routage, montage de composant |
| [4] | État dérivé (`isAnnotationMode`) |
| [5a] | `useEffect` + `useRef` pour une bibliothèque impérative + nettoyage |
| [5b] | Hook personnalisé, état serveur, patron anti-course |
| [5c] | Hook personnalisé, repli, `AbortController` |
| [7] | `useState` avec forme fonctionnelle, superposition d'objets |
| [8] | Action asynchrone, le serveur fait foi, erreur métier affichée |

---

## 10 - Recette : ajouter une fonctionnalité

### 10.1 Où mettre quoi

```
   src/
   +-- index.css       LE systeme de design : jetons de couleur des deux
   |                   themes, classes .wg-* (bouton, carte, champ, modale).
   |                   Aucune couleur en dur ailleurs dans le projet.
   |
   +-- pages/          UNE page = UNE route de App.tsx.
   |                   N'y mettez jamais un composant reutilisable.
   |
   +-- components/     Composant partage par PLUSIEURS pages,
   |    |              sans logique metier propre.
   |    +-- AppShell.tsx   cadre commun : barre superieure, titre, actions.
   |                       ABSENT des visionneuses, volontairement.
   |
   +-- services/       Acces reseau transverse (le client patients).
   |
   +-- features/theme/  thème clair/sombre (Context + hook), cf. 5.6
   |
   +-- features/<nom>/  <=== C'EST ICI QUE VA TOUT NOUVEAU CODE
   |     +-- types.ts             les contrats
   |     +-- <nom>Api.ts          le client HTTP
   |     +-- use<Nom>.ts          le hook (l'etat + les actions)
   |     +-- components/          les composants du domaine
   |
   +-- scripts/        HORS de src/ : outillage Node, jamais compile
                       dans l'application (ex : generate-olga-schemas.ts)
```

**Pourquoi `features/` plutôt que `components/` ?** C'est un découpage
**vertical** (par domaine métier) plutôt qu'**horizontal** (par nature
technique). Tout ce qui concerne le workflow est dans un seul dossier : ses
types, son client HTTP, ses hooks, ses composants. On peut le lire d'un bloc,
le tester d'un bloc, et le supprimer d'un bloc. C'est la structure cible du
projet ; `pages/` et `components/` sont l'historique.

### 10.2 Checklist pour une nouvelle fonctionnalité

Exemple concret : **afficher l'historique des modifications d'un dossier**.

```
   [ ] 1. Le contrat      features/history/types.ts
          interface HistoryEntry { id, author, action, at }

   [ ] 2. Le client HTTP  features/history/historyApi.ts
          - lire VITE_API_URL comme les autres clients
          - une classe d'erreur typee (voir WorkflowApiError)
          - traduire les codes HTTP en messages pour l'humain

   [ ] 3. Le hook         features/history/useHistory.ts
          - useState : data, status, error
          - useEffect avec le drapeau `active` (anti-course)
          - useCallback pour reload()
          - etat DERIVE plutot que stocke

   [ ] 4. Les composants  features/history/components/HistoryPanel.tsx
          - trois sorties : chargement, erreur + Reessayer, contenu
          - key stable dans le .map()
          - JETONS du systeme de design (bg-surface, text-muted, wg-btn…),
            JAMAIS une teinte brute (bg-slate-900, text-cyan-400) :
            sinon le composant sera illisible dans l'un des deux themes
          - classes ecrites en toutes lettres, jamais construites

   [ ] 5. Le branchement  dans la page concernee, une ligne :
          const history = useHistory(extractionId);

   [ ] 6. La verification
          npm run lint      <- regles des hooks + dependances
          npm run build     <- verification de types (JAMAIS faite en dev !)
```

### 10.3 Les points de vigilance du projet

| Point | Règle Chiron |
|---|---|
| Nouvelle variable d'environnement | Préfixe `VITE_`, ajout dans `docker-compose.yml`, **redémarrage du conteneur** |
| Nouvel appel réseau | Toujours le patron `active` / `AbortController` |
| Nouvelle erreur serveur | La traduire en message lisible, jamais afficher une stack trace |
| Nouvelle dépendance npm | `docker compose build frontend` obligatoire |
| Bibliothèque impérative | `useRef` + nettoyage dans le `return` de l'effet |
| Donnée partagée par plus de trois composants | Ne pas relire `localStorage` : créer un Context (section 5.6) |

---

## 11 - Déboguer : symptômes et causes

### 11.1 Les outils

| Outil | Usage |
|---|---|
| **React DevTools** (extension navigateur) | Onglet *Components* : l'arbre réel, les props et l'état de chaque composant, en direct. Onglet *Profiler* : qui se rend et pourquoi |
| Onglet **Réseau** | Vérifier l'URL exacte, le corps, le code de statut. En `<StrictMode>`, les requêtes apparaissent **en double** : normal |
| Onglet **Console** | Les avertissements React sont précis et utiles. Ne les ignorez jamais |
| `npm run lint` | Règles des hooks et dépendances manquantes |
| `npm run build` | **La seule vérification de types**, puisque le mode dev ne la fait pas |
| `docker compose logs -f frontend` | Erreurs de Vite lui-même (import introuvable, échec de transformation) |

### 11.2 Table de diagnostic

| Symptôme | Cause la plus probable | Correction |
|---|---|---|
| L'écran ne se met pas à jour après une modification de données | **Mutation** au lieu d'un remplacement | `setX([...x, item])`, jamais `x.push()` |
| Boucle infinie de rendus, l'onglet se fige | Un `useEffect` sans tableau de dépendances, ou avec un objet/tableau/fonction recréé à chaque rendu | Ajouter le tableau ; ne dépendre que de valeurs primitives ; `useCallback` pour les fonctions |
| L'effet part deux fois au montage | `<StrictMode>` en développement | Normal. Si ça pose problème, c'est le **nettoyage** qui est incomplet |
| Une valeur ancienne est utilisée dans un callback | *Stale closure* | Forme fonctionnelle `setX(prev => …)`, ou ajouter la dépendance |
| Les éléments d'une liste mélangent leurs états | `key` absente ou basée sur l'index | `key={item.id}` |
| `Cannot read properties of undefined` | Rendu avant l'arrivée des données | `data?.champ`, valeur par défaut, ou *early return* |
| Une classe Tailwind n'a aucun effet | Nom de classe construit dynamiquement | Écrire le nom complet dans le source |
| `import.meta.env.MA_VAR` vaut `undefined` | Préfixe `VITE_` manquant, ou conteneur non redémarré | Renommer, puis `docker compose up -d frontend` |
| Le HMR ne réagit plus | Watcher perdu, ou modification de `vite.config.ts` | `docker compose restart frontend` |
| La page est vide, la console dit « Objects are not valid as a React child » | Vous rendez un objet : `{patient}` au lieu de `{patient.name}` | Rendre une chaîne ou un nombre |
| `F5` sur `/viewer` fait disparaître le panneau latéral | `location.state` est perdu (section 6.3) | Repasser par le tableau de bord ; correction de fond : passer l'id dans l'URL |
| Une modification de `.tsx` casse tout après un `git pull` | `node_modules` désynchronisé | `docker compose build frontend` |

### 11.3 La technique du « bissection par console »

Quand un composant se rend trop souvent sans raison apparente :

```tsx
// Au sommet du composant, temporairement
console.log('rendu de Viewer', { extractionId, currentStep, status: workflow.status });
```

Chaque ligne dans la console est un rendu. Regardez **quelle valeur change**
entre deux lignes : c'est votre coupable. C'est plus rapide que le Profiler
pour un cas isolé.

---

## 12 - Glossaire et aide-mémoire

### 12.1 Glossaire

| Terme | Définition |
|---|---|
| **SPA** | Single Page Application : une seule page HTML, le JS réécrit le contenu |
| **JSX** | Syntaxe qui ressemble à du HTML dans du JS, transformée en appels de fonction |
| **Composant** | Fonction à nom majuscule retournant du JSX |
| **Props** | Paramètres d'un composant, descendants et en lecture seule |
| **État (state)** | Donnée mémorisée par un composant, dont la modification provoque un rendu |
| **Hook** | Fonction `useXxx` donnant accès à la mémoire et au cycle de vie |
| **Hook personnalisé** | Fonction `useXxx` écrite par vous, qui appelle d'autres hooks |
| **Rendu** | Appel de votre fonction composant pour obtenir la description de l'écran |
| **Réconciliation** | Comparaison ancien/nouveau arbre pour calculer la modification minimale du DOM |
| **Virtual DOM** | La description en objets JS, comparée avant d'écrire dans le vrai DOM |
| **Effet de bord** | Toute action hors calcul de rendu : réseau, DOM, minuteur |
| **Nettoyage (cleanup)** | Fonction retournée par un effet, exécutée au démontage et avant réexécution |
| **Mémoïsation** | Mémoriser un résultat pour éviter de le recalculer |
| **Stale closure** | Fonction qui utilise une valeur capturée à un rendu précédent, donc périmée |
| **Prop drilling** | Faire descendre une prop à travers des composants qui ne s'en servent pas |
| **Lifting state up** | Remonter un état au parent commun pour le partager |
| **Store** | Conteneur d'état hors de l'arbre des composants, auquel on s'abonne |
| **Context** | Mécanisme natif React pour diffuser une valeur sans props |
| **État serveur** | Donnée dont la source de vérité est la base, pas le navigateur |
| **HMR** | Hot Module Replacement : remplacement de module à chaud, sans rechargement |
| **Bundler** | Outil qui regroupe les modules en quelques fichiers (Rollup pour Vite en prod) |
| **ESM** | ECMAScript Modules : `import` / `export` natifs du navigateur |
| **Tree shaking** | Élimination du code jamais importé lors du build |

### 12.2 Aide-mémoire des hooks

```
   useState(initial)          -> [valeur, setValeur]
     memoire + rendu au changement
     setValeur(v)  ou  setValeur(prev => …)   <- si la valeur depend de l'ancienne
     JAMAIS de mutation : toujours un nouvel objet/tableau

   useEffect(fn, [deps])
     effets de bord APRES le rendu
     []          une seule fois au montage
     [a, b]      au montage puis quand a ou b change
     (absent)    a chaque rendu -> presque toujours un bug
     return () => { … }   nettoyage : OBLIGATOIRE pour tout abonnement

   useRef(initial)            -> { current: … }
     survit aux rendus, NE declenche PAS de rendu
     objets imperatifs (viewer, minuteur) et references DOM (ref={…})

   useMemo(() => valeur, [deps])
     memorise une VALEUR couteuse a calculer

   useCallback(fn, [deps])
     memorise une FONCTION (reference stable pour les dependances)

   useNavigate()              -> navigate('/route', { state: { … } })
   useLocation()              -> location.search, location.state
```

### 12.3 Commandes

```bash
docker compose up -d frontend           # demarrer le front
docker compose logs -f frontend         # suivre les logs Vite
docker compose restart frontend         # apres modification de vite.config.ts
docker compose build frontend           # apres ajout d'une dependance npm
```

```bash
# dans le conteneur, ou en local si Node 20+ est installe
npm run dev        # serveur de developpement (:5173)
npm run lint       # ESLint : regles des hooks, dependances
npm run build      # tsc -b + build Rollup : LA verification de types
npm run preview    # servir le build de production localement
```

### 12.4 Pour aller plus loin

| Ressource | Pourquoi |
|---|---|
| [react.dev/learn](https://react.dev/learn) | La documentation officielle, réécrite en 2023, orientée hooks. La section « Escape Hatches » traite exactement les cas d'OpenSeadragon |
| [react.dev/reference/react](https://react.dev/reference/react) | Référence de chaque hook, avec les pièges |
| [vite.dev/guide](https://vite.dev/guide/) | Configuration, variables d'environnement, proxy |
| [reactrouter.com](https://reactrouter.com/) | Version 7, celle du projet |
| [tailwindcss.com/docs](https://tailwindcss.com/docs) | Attention : bien lire la documentation **v4**, différente de la v3 |

---

## Ce qu'il faut retenir en dix lignes

1. **Interface = f(état).** Vous ne touchez jamais au DOM, vous changez l'état.
2. **Un composant est une fonction pure** appelée de nombreuses fois.
3. **Ne mutez jamais** un état : créez un nouvel objet ou tableau.
4. **Forme fonctionnelle** `setX(prev => …)` dès que la valeur dépend de
   l'ancienne.
5. **Tout effet de bord** va dans `useEffect`, avec son tableau de dépendances
   et son nettoyage.
6. **Ne stockez pas ce que vous pouvez calculer.** L'état dérivé ne se
   désynchronise jamais.
7. **L'état vit au niveau le plus bas possible.** Ne remontez que sous la
   contrainte.
8. **L'état serveur n'est pas de l'état local** : le serveur fait foi, on
   remplace par sa réponse.
9. **Un hook personnalisé partage de la logique**, un store partage de l'état.
10. **Vite est un serveur en dev et un bundler en prod.** Chiron ne fait tourner
    que le premier : lancez `npm run build` avant de livrer.
