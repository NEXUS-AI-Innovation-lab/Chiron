# 16 — Supabase : base de données et comptes utilisateurs

> **En une phrase :** la base PostgreSQL de Chiron est désormais celle de
> **Supabase**, lancé à côté de la pile Docker avec la CLI. Les **comptes
> utilisateurs** passent par **Supabase Auth** : création de compte,
> connexion, mot de passe oublié. Le backend refuse toute requête sans jeton
> de session valide.

Avant ce changement, n'importe qui pouvait entrer : la page de connexion
recopiait le nom tapé dans `localStorage`, et aucune route de l'API ne
vérifiait rien (sécurité S1 dans [09 — Pièges](09-pieges-et-bugs.md)).

---

## Sommaire

1. [Démarrer](#1-démarrer)
2. [Architecture](#2-architecture)
3. [La base de données](#3-la-base-de-données)
4. [Protéger les données : trois verrous](#4-protéger-les-données--trois-verrous)
5. [Les comptes : parcours utilisateur](#5-les-comptes--parcours-utilisateur)
6. [Côté backend : vérifier le jeton](#6-côté-backend--vérifier-le-jeton)
7. [Côté frontend : session et appels à l'API](#7-côté-frontend--session-et-appels-à-lapi)
8. [Les écrans, d'après la maquette Figma](#8-les-écrans-daprès-la-maquette-figma)
9. [Configuration](#9-configuration)
10. [Migrer l'ancienne base PostgreSQL](#10-migrer-lancienne-base-postgresql)
11. [Dépannage](#11-dépannage)
12. [Limites connues](#12-limites-connues)
13. [Ce qui a changé, fichier par fichier](#13-ce-qui-a-changé-fichier-par-fichier)
14. [Comment le changement a été vérifié](#14-comment-le-changement-a-été-vérifié)

---

## 1. Démarrer

Il faut la **CLI Supabase**
([installation](https://supabase.com/docs/guides/local-development/cli/getting-started)).
Depuis la racine du dépôt :

```bash
supabase start
```

```bash
docker compose up -d --build
```

**L'ordre compte** : Supabase d'abord, sinon le backend ne trouve pas sa base.
Pour tout arrêter :

```bash
docker compose down
```

```bash
supabase stop
```

`supabase stop` **conserve** les données, dans les volumes Docker
`supabase_*_chiron`. Seul `supabase db reset` repart d'une base vide.

| Service | Adresse | Usage |
|---|---|---|
| Application | http://localhost:5173 | Créer un compte sur `/inscription` |
| API Supabase | http://127.0.0.1:56321 | Appelée par le navigateur (auth) |
| Base PostgreSQL | `postgresql://postgres:postgres@127.0.0.1:56322/postgres` | DBeaver, pgAdmin, `psql` |
| Supabase Studio | http://127.0.0.1:56323 | Interface d'administration : tables, utilisateurs |
| Mailpit | http://127.0.0.1:56324 | **Les e-mails envoyés en local** (réinitialisation du mot de passe) |

**Pourquoi les ports 563xx ?** Les ports par défaut de Supabase (54321...)
sont souvent déjà pris par d'autres projets Supabase locaux. Chiron utilise
donc sa propre plage, fixée dans `supabase/config.toml`.

> **Après avoir changé `package.json`** (ajout de `@supabase/supabase-js`), le
> conteneur frontend garde son ancien `node_modules` (piège B8). Recréez-le :
> `docker compose up -d --build -V frontend`.

---

## 2. Architecture

```
  Navigateur
  ├── supabase-js ───────────────▶ Supabase :56321  (auth : inscription, connexion,
  │      ▲  jeton de session                          mot de passe, e-mails → Mailpit)
  │      │
  └── axios / apiFetch ──────────▶ Backend :8002
         Authorization: Bearer …       │ 1. vérifie la signature du jeton
                                       │    (clé publique JWKS de Supabase)
                                       │ 2. lit / écrit les données
                                       ▼
                           PostgreSQL de Supabase :56322
                           ├── schéma auth    (comptes, géré par Supabase)
                           └── schéma public  (tables métier, gérées par Alembic)
```

**Supabase ne remplace pas le backend.** Le navigateur ne lit **jamais** les
tables métier directement : tout passe toujours par FastAPI. Supabase fournit
deux choses :

1. **le serveur PostgreSQL**, à la place du conteneur `postgres` ;
2. **le service de comptes** (GoTrue) : il gère les mots de passe, les
   e-mails et l'émission des jetons de session.

**Pourquoi la CLI plutôt qu'un service de plus dans `docker-compose.yml` ?**
Une pile Supabase compte une dizaine de conteneurs (base, auth, passerelle
Kong, Studio, Mailpit...). La CLI les gère, applique les migrations de
`supabase/migrations/` et fournit les clés. Elle permet aussi de passer plus
tard à un projet Supabase hébergé (`supabase link`, `supabase db push`) sans
rien changer au code.

**Comment les conteneurs joignent Supabase.** Supabase publie ses ports sur la
machine hôte. Les conteneurs `backend` et `image_seeder` y accèdent par
`host.docker.internal` (déclaré dans `extra_hosts` pour que cela marche aussi
sous Linux). Le navigateur, lui, utilise `127.0.0.1`.

---

## 3. La base de données

| | Avant | Maintenant |
|---|---|---|
| Serveur | Conteneur `p6_postgres` (PostgreSQL 15) | Supabase (PostgreSQL 17) |
| URL vue du backend | `postgresql://user:password@p6_postgres:5432/p6_db` | `postgresql://postgres:postgres@host.docker.internal:56322/postgres` |
| Tables métier | `public`, créées par Alembic | **Identique** : `public`, créées par Alembic |
| Comptes | — | Schéma `auth`, géré par Supabase |

**Alembic reste maître des tables métier.** Rien ne change dans la façon de
faire évoluer le schéma (voir [02 — Base de données](02-base-de-donnees.md)) :
on modifie `models.py`, on génère une révision, et le backend l'applique au
démarrage.

Deux systèmes de migration coexistent, chacun dans son domaine :

| Outil | Dossier | Contenu | Appliqué par |
|---|---|---|---|
| **Supabase** | `supabase/migrations/` | Réglages propres à Supabase : droits des rôles publics | `supabase start` / `supabase db reset` |
| **Alembic** | `backend/alembic/versions/` | Tables métier, colonnes, RLS | Le backend, à chaque démarrage |

Pour qu'Alembic ne propose jamais de supprimer un objet qu'il ne gère pas, son
`env.py` ignore désormais, en `--autogenerate`, les tables absentes de
`models.py` (fonction `include_object`).

---

## 4. Protéger les données : trois verrous

**Le risque.** Supabase expose automatiquement le schéma `public` par une API
REST (PostgREST) et donne par défaut tous les droits aux rôles `anon`
(visiteur) et `authenticated` (connecté). Or la clé « publishable », qui
permet d'appeler cette API, est **publique** : elle est dans le code du
frontend. Sans précaution, n'importe qui pourrait lire les dossiers patients
avec un simple `curl`.

**Trois verrous indépendants**, pour qu'une erreur sur l'un ne suffise pas :

| # | Verrou | Où | Effet |
|---|---|---|---|
| 1 | **Droits retirés** aux rôles `anon` et `authenticated` sur les tables de `public`, y compris celles créées plus tard | `supabase/migrations/20261107000000_chiron_donnees_privees.sql` | « permission denied for table patients » |
| 2 | **RLS activé** sans aucune politique sur chaque table métier | `backend/alembic/versions/b7e4c1d2a9f0_rls_tables_metier.py` | Même si un droit était rendu par erreur, aucune ligne n'est visible |
| 3 | **Aucun schéma déclaré** dans l'API REST | `supabase/config.toml`, `[api] schemas = []` | Intention explicite : l'API REST n'est pas utilisée |

> **Vérifié** : avec la clé publique, en visiteur comme en utilisateur
> connecté, `GET /rest/v1/patients` répond **« permission denied »**. Notez
> que la CLI expose quand même `public` malgré `schemas = []` : ce sont les
> verrous 1 et 2 qui protègent réellement.

Le backend se connecte avec le rôle `postgres`, **propriétaire** des tables :
RLS ne s'applique pas à lui, il voit tout.

> ⚠️ **Règle pour la suite :** chaque nouvelle table métier doit activer RLS
> dans sa migration Alembic : `op.execute('ALTER TABLE "x" ENABLE ROW LEVEL
> SECURITY')`.

---

## 5. Les comptes : parcours utilisateur

| Écran | Route | Ce qui se passe |
|---|---|---|
| Création de compte | `/inscription` | `supabase.auth.signUp` avec nom affiché, profession, e-mail, mot de passe. Connecté directement (confirmation d'e-mail désactivée en local). |
| Connexion | `/login` | `signInWithPassword`. Retour sur la page demandée avant la redirection. |
| Mot de passe oublié | `/mot-de-passe-oublie` | `resetPasswordForEmail` : e-mail avec un lien, visible dans **Mailpit** en local. |
| Nouveau mot de passe | `/reinitialisation` | Ouverte par le lien de l'e-mail. `updateUser({ password })`, puis retour à la connexion. |
| Déconnexion | Bouton de la barre | `signOut`, puis `/login`. |

**Règles du mot de passe** (`supabase/config.toml`, vérifiées aussi dans le
formulaire) : au moins 10 caractères, avec une minuscule, une majuscule et un
chiffre.

**« Se souvenir de moi »** : coché, la session est gardée dans `localStorage`
et survit à la fermeture du navigateur. Décoché, elle va dans
`sessionStorage` et disparaît avec l'onglet, ce qui convient à un poste
partagé.

**Nom et profession** sont stockés dans les métadonnées du compte
(`user_metadata.full_name`, `user_metadata.profession`). Ils sont donc **dans
le jeton** : le backend connaît le nom de l'utilisateur sans requête
supplémentaire.

**Confirmation d'e-mail** : désactivée en local, pour aller vite. En
production, il faut l'activer (`[auth.email] enable_confirmations = true`).
L'écran d'inscription gère déjà ce cas et affiche « Vérifiez vos e-mails ».

---

## 6. Côté backend : vérifier le jeton

Le backend **ne voit jamais de mot de passe**. Il vérifie le jeton de session
envoyé dans `Authorization: Bearer <jeton>`.

```
routers/dependencies.py   require_user()       lit l'en-tête, 401 s'il manque
        │
        ▼
services/auth.py          verify_token()       signature, émetteur, public, expiration
        │                 → CurrentUser(id, email, full_name, profession, display_name)
        ▼
routers/*                 la route s'exécute
```

**Comment la signature est vérifiée.** Supabase signe ses jetons en **ES256**
(clé asymétrique). Sa clé **publique** est publiée sur
`/auth/v1/.well-known/jwks.json`. Le backend la télécharge une fois avec
`PyJWKClient` (bibliothèque PyJWT), la garde en cache, puis vérifie chaque
jeton **localement**, sans appeler Supabase à chaque requête. Aucun secret
partagé n'est nécessaire.

Le jeton est refusé (`401`) s'il est absent, mal formé, signé par une autre
clé, d'un autre émetteur (`iss`) ou d'un autre public (`aud`), expiré, ou
signé avec `alg: none`.

**Quelles routes sont protégées ?** Toutes les routes métier. La protection
est posée **une seule fois**, dans [`main.py`](../backend/main.py), sur chaque
routeur :

```python
_connecte = [Depends(require_user)]
app.include_router(patients.router, dependencies=_connecte)
# ... biopsies, radiology, analysis, extractions, workflow
```

| Reste public | Pourquoi |
|---|---|
| `GET /health` | La supervision doit répondre sans session. |
| `GET /dzi_data/...` | Les tuiles : OpenSeadragon ne sait pas joindre d'en-tête ([limites](#12-limites-connues)). |
| `/docs`, `/openapi.json` | Documentation de l'API. Le bouton « Authorize » de `/docs` accepte un jeton. |

**Nouvelle route `GET /me`** : renvoie l'identité lue dans le jeton (`id`,
`email`, `full_name`, `display_name`, `profession`).

**L'identité vient maintenant du serveur, pour deux opérations :**

| Opération | Avant | Maintenant |
|---|---|---|
| `POST /extract-roi` : propriétaire de l'extraction | Champ `owner` envoyé par le client | **Nom du compte connecté** ; le champ `owner` est ignoré |
| `DELETE /extractions/{id}` : qui peut supprimer | `?username=` envoyé par le client (falsifiable, S4) | **Compte connecté** ; `?username=` est accepté mais ignoré |

Nouvelle erreur métier : `Unauthorized` (401, avec l'en-tête
`WWW-Authenticate: Bearer`) dans [`services/errors.py`](../backend/services/errors.py).

---

## 7. Côté frontend : session et appels à l'API

```
src/features/auth/
├── supabaseClient.ts     client Supabase + « Se souvenir de moi »
├── authContext.ts        contexte, hook useAuth(), types, professions
├── AuthProvider.tsx      session, profil, connexion, inscription, déconnexion...
├── RequireAuth.tsx       garde de route : sans session → /login
├── authErrors.ts         messages d'erreur Supabase traduits, règles du mot de passe
└── components/
    ├── AuthLayout.tsx    gabarit de la maquette (panneau sombre + formulaire)
    ├── AuthField.tsx     champ, liste déroulante, case à cocher
    └── AuthIcon.tsx      icônes de la maquette (src/assets/auth/)
src/services/http.ts      jeton joint à chaque appel au backend
src/pages/                Login, Signup, ForgotPassword, ResetPassword
```

**Le jeton est joint automatiquement**, par [`services/http.ts`](../frontend/src/services/http.ts) :

- **axios** : un intercepteur l'ajoute à toute requête vers `VITE_API_URL`.
  Les appels de `services/api.ts` n'ont pas changé.
- **fetch** : les appels au backend utilisent `apiFetch(url, init)` à la
  place de `fetch`. C'est le cas dans `Viewer`, `RadiologyViewer`,
  `PatientCard` et `workflowApi`.
- Le jeton n'est **jamais** envoyé ailleurs : ni à OLGA, ni au proxy Orthanc.

**Session expirée** : si le backend répond `401`, `http.ts` émet l'événement
`chiron:non-authentifie`, `AuthProvider` déconnecte l'utilisateur, et la garde
de route le renvoie vers `/login`.

**La clé historique `biopsie_user`.** Le nom de l'utilisateur était lu dans
`localStorage["biopsie_user"]` à de nombreux endroits (auteur des dessins,
signature des comptes rendus, nom affiché). Pour ne pas réécrire ces écrans,
`AuthProvider` **tient cette clé à jour** avec le nom du compte Supabase : il
l'écrit à la connexion et l'efface à la déconnexion. À terme, ces écrans
devraient lire `useAuth().profile.displayName`.

**Ajouter une page protégée** :

```tsx
<Route path="/ma-page" element={<RequireAuth><MaPage /></RequireAuth>} />
```

---

## 8. Les écrans, d'après la maquette Figma

Source : fichier Figma « Chiron. Refonte - Directions de style », planche
**« 01 · Connexion »**. La maquette n'a **pas** d'écran de création de compte :
`/inscription`, `/mot-de-passe-oublie` et `/reinitialisation` reprennent
exactement le même gabarit.

| Élément de la maquette | Implémentation |
|---|---|
| Panneau sombre de 620 px, marque, accroche, 3 arguments, encart d'information | `AuthLayout`, caché sous 1024 px de large (la marque passe alors au-dessus du formulaire) |
| Champs de 50 px, coins de 12 px, icône à gauche, focus vert avec halo | Classe `.wg-auth-field` (`index.css`) |
| Bouton pilule vert de 52 px, texte foncé, flèche | `.wg-auth-btn-primary` |
| Case « Se souvenir de moi », lien « Mot de passe oublié ? » | Fonctionnels |
| Séparateur « ou », bouton Pro Santé Connect | Affiché mais **désactivé**, avec la mention « Bientôt » |
| Icônes | Fichiers SVG de la maquette, dans `src/assets/auth/` |

**Écarts assumés avec la maquette :**

| Écart | Raison |
|---|---|
| Police système (Inter, Segoe UI) au lieu de Plus Jakarta Sans | Choix déjà documenté du projet : aucune police distante, car le réseau hospitalier est souvent fermé (`index.css`). |
| « Identifiant » demande l'**adresse e-mail** | C'est l'identifiant des comptes Supabase. |
| Icônes teintées par le thème | Les SVG sont dessinés en couleur fixe. Ils sont affichés en masque CSS (`.wg-icon`), donc la forme est celle du fichier et la couleur vient d'un jeton. Le **thème sombre** fonctionne ainsi sur ces écrans. |
| Lien « Créer un compte » sous le formulaire | Absent de la maquette, nécessaire pour atteindre l'inscription. |

**Nouveaux jetons de couleur** (`index.css`) : `--wg-nav-raised` (encart sur
le panneau sombre), `--wg-nav-soft` (texte secondaire clair) et
`--wg-on-accent` (texte foncé sur le vert des grands boutons).

---

## 9. Configuration

**Backend** (`config.py`, `database.py`, `docker-compose.yml`) :

| Variable | Valeur dans la pile | Rôle |
|---|---|---|
| `DATABASE_URL` | `postgresql://postgres:postgres@host.docker.internal:56322/postgres` | Base Supabase (backend **et** seeder) |
| `SUPABASE_URL` | `http://host.docker.internal:56321` | D'où télécharger la clé publique (JWKS) |
| `SUPABASE_JWT_ISSUER` | `http://127.0.0.1:56321/auth/v1` | Émetteur attendu dans le jeton (l'adresse vue du **navigateur**) |
| `SUPABASE_JWT_AUDIENCE` | `authenticated` | Public attendu |
| `SUPABASE_JWKS_URL` | dérivée de `SUPABASE_URL` | À surcharger seulement si besoin |

**Frontend** :

| Variable | Valeur | Rôle |
|---|---|---|
| `VITE_SUPABASE_URL` | `http://127.0.0.1:56321` | API Supabase |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` | Clé publique (ex-« anon key ») |

La clé publishable locale est **la même pour tous** les projets lancés avec la
CLI : elle est affichée par `supabase status`. Pour un projet hébergé, il
faut prendre celle du tableau de bord Supabase.

**Supabase** (`supabase/config.toml`) — réglages modifiés :

| Réglage | Valeur | Pourquoi |
|---|---|---|
| `project_id` | `chiron` | Nom des conteneurs (`supabase_db_chiron`...) |
| Ports | `563xx` | Éviter les autres projets Supabase locaux |
| `[api] schemas` | `[]` | Les données ne passent pas par l'API REST |
| `realtime`, `storage`, `edge_runtime`, `analytics` | désactivés | Inutiles à Chiron (le stockage est Garage) : pile plus légère |
| `site_url`, `additional_redirect_urls` | `http://localhost:5173`, `/reinitialisation` | Adresse du lien de réinitialisation |
| `minimum_password_length`, `password_requirements` | `10`, `lower_upper_letters_digits` | Mot de passe robuste |

---

## 10. Migrer l'ancienne base PostgreSQL

Les données de l'ancien conteneur `p6_postgres` sont dans le volume Docker
`wigo-main_postgres_data`. Pour les copier dans Supabase, **avant** le premier
démarrage du backend sur Supabase :

```bash
# 1. Démarrer Supabase
supabase start
```

```bash
# 2. Relancer l'ancien PostgreSQL sur son volume (lecture seule de fait)
docker run -d --rm --name old-pg -v wigo-main_postgres_data:/var/lib/postgresql/data postgres:15
```

```bash
# 3. Copier le schéma et les données de public (attendre ~5 s que old-pg démarre)
docker exec old-pg pg_dump -U user -d p6_db --schema=public --no-owner --no-privileges | grep -v "^CREATE SCHEMA public;$" | docker exec -i supabase_db_chiron psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q
```

```bash
# 4. Arrêter l'ancien PostgreSQL, puis démarrer la pile
docker stop old-pg
```

```bash
docker compose up -d --build
```

Au démarrage, le backend voit la version Alembic de l'ancienne base et
applique seulement la migration RLS. **Les comptes ne sont pas migrés** : il
n'y en avait pas. Chaque utilisateur crée le sien sur `/inscription`.

> ⚠️ Si le backend a **déjà** démarré sur Supabase, les tables existent et
> l'étape 3 échoue. Repartez d'une base vide avec `supabase db reset`, puis
> refaites les étapes 2 à 4.

Le volume `postgres_data` reste déclaré dans `docker-compose.yml` pour ne pas
le perdre avant la migration. Une fois les données vérifiées, on peut le
supprimer avec `docker volume rm wigo-main_postgres_data`. **Cette suppression
est irréversible.** L'ancien conteneur `p6_postgres`, s'il existe encore, peut
être supprimé avec `docker rm p6_postgres`.

---

## 11. Dépannage

| Symptôme | Cause probable | Que faire |
|---|---|---|
| Backend : `could not connect to server ... host.docker.internal:56322` | Supabase pas démarré | `supabase start`, puis `docker compose restart backend image_seeder` |
| Toutes les requêtes en `401 Authentification requise` | Le frontend n'envoie pas de jeton | Être connecté ; vérifier que l'appel passe par axios ou `apiFetch` |
| `401 Jeton d'authentification invalide` après un `supabase db reset` ou un changement de projet | Les clés de signature ont changé | Se déconnecter, puis se reconnecter |
| `503 Service d'authentification injoignable` | Le backend n'atteint pas le JWKS | Vérifier `SUPABASE_URL` et que Supabase tourne |
| Connexion : « Service d'authentification injoignable. Supabase est-il démarré ? » | Le navigateur n'atteint pas `127.0.0.1:56321` | `supabase status` |
| Console : `VITE_SUPABASE_PUBLISHABLE_KEY manquante` | Variable absente du conteneur frontend | Vérifier `docker-compose.yml` |
| Frontend : `Failed to resolve import "@supabase/supabase-js"` | Ancien `node_modules` du conteneur (piège B8) | `docker compose up -d --build -V frontend` |
| Aucun e-mail de réinitialisation reçu | En local, les e-mails ne partent pas | Les lire dans Mailpit : http://127.0.0.1:56324 |
| `port is already allocated` au `supabase start` | Un autre projet utilise un port 563xx | Changer les ports dans `supabase/config.toml`, puis `SUPABASE_*`, `DATABASE_URL` et `VITE_SUPABASE_URL` |

---

## 12. Limites connues

- **Les tuiles `/dzi_data` restent publiques.** OpenSeadragon les charge
  directement, sans en-tête. Il faudrait des URL signées ou un cookie de
  session. Les tuiles ne contiennent pas d'identité, mais restent une image
  médicale.
- **Le proxy Orthanc** (`/orthanc` dans Vite) n'est pas protégé par la
  session : il n'existe qu'en développement (piège B10).
- **Plusieurs champs d'identité viennent encore du client** : l'auteur des
  dessins (`author`), le pathologiste du compte rendu et la signature
  radiologique. Seuls le propriétaire d'une extraction et le droit de
  supprimer viennent du jeton. Prochaine étape : remplir ces champs côté
  serveur avec `CurrentUser`.
- **Aucun rôle** (S3) : tout compte connecté peut tout faire. La profession
  est enregistrée et pourra servir de base aux rôles.
- **Pro Santé Connect** n'est pas branché (bouton désactivé). Supabase accepte
  un fournisseur OpenID Connect personnalisé ; PSC demande une inscription
  auprès de l'ANS.
- **Secrets de développement** : la clé publishable, le mot de passe
  `postgres` et les clés de signature locales sont les valeurs par défaut de
  la CLI. En production, utiliser un projet Supabase dédié et ses propres
  clés.

---

## 13. Ce qui a changé, fichier par fichier

| Fichier | Changement |
|---|---|
| `supabase/config.toml` | **Nouveau** (`supabase init`) : projet `chiron`, ports 563xx, services inutiles désactivés, règles de mot de passe |
| `supabase/migrations/20261107000000_chiron_donnees_privees.sql` | **Nouveau** : retire les droits des rôles publics sur `public` |
| `docker-compose.yml` | Service `postgres` supprimé ; `DATABASE_URL` et `SUPABASE_*` pour backend et seeder ; `extra_hosts` ; `VITE_SUPABASE_*` pour le frontend |
| `backend/requirements.txt` | `pyjwt[crypto]==2.10.1` |
| `backend/config.py` | Variables `SUPABASE_*` |
| `backend/database.py` | URL par défaut : la base Supabase |
| `backend/services/auth.py` | **Nouveau** : vérification du jeton, `CurrentUser` |
| `backend/routers/dependencies.py` | **Nouveau** : `require_user` |
| `backend/routers/account.py` | **Nouveau** : `GET /me` |
| `backend/main.py` | Routeurs métier protégés ; en-têtes des erreurs (401) |
| `backend/services/errors.py` | `Unauthorized` (401) |
| `backend/routers/extractions.py`, `services/extractions.py` | Propriétaire et droit de suppression lus dans le jeton |
| `backend/alembic/env.py` | `include_object` : ignore les tables non gérées |
| `backend/alembic/versions/b7e4c1d2a9f0_rls_tables_metier.py` | **Nouveau** : RLS sur les tables métier |
| `backend/seed_images.py` | Renvoie dans le stockage les lames de démo manquantes, même sur une base déjà peuplée |
| `frontend/package.json` | `@supabase/supabase-js` 2.118.0 |
| `frontend/src/features/auth/` | **Nouveau** : client, contexte, Provider, garde, erreurs, composants |
| `frontend/src/services/http.ts` | **Nouveau** : jeton sur axios et `apiFetch` |
| `frontend/src/pages/Login.tsx` | Réécrit d'après la maquette |
| `frontend/src/pages/Signup.tsx`, `ForgotPassword.tsx`, `ResetPassword.tsx` | **Nouveaux** |
| `frontend/src/App.tsx`, `main.tsx` | Routes publiques et protégées, `AuthProvider` |
| `frontend/src/components/AppShell.tsx` | Déconnexion via Supabase |
| `Viewer.tsx`, `RadiologyViewer.tsx`, `PatientCard.tsx`, `workflowApi.ts` | `fetch` vers le backend remplacé par `apiFetch` |
| `frontend/src/index.css` | Jetons `nav-raised`, `nav-soft`, `on-accent` ; classes `.wg-auth-*` et `.wg-icon` |
| `frontend/src/assets/auth/` | **Nouveau** : 13 icônes SVG de la maquette |

---

## 14. Comment le changement a été vérifié

Sur la vraie pile (Supabase CLI 2.95, Compose, Garage, Orthanc ; sans
InstanSeg) :

1. **Migration** des données réelles de `wigo-main_postgres_data` : 4 patients,
   1 lame, 3 examens, retrouvés dans Supabase ; le backend applique ensuite la
   migration RLS (`719b309ce4d3 → b7e4c1d2a9f0`).
2. **API** :
   - sans jeton, avec un jeton bidon ou un jeton forgé `alg: none` : `401` ;
   - avec un vrai jeton : `200` ;
   - `/me` renvoie l'identité ; `/health` et les tuiles restent publics.
3. **Données inaccessibles par Supabase** : `GET /rest/v1/patients` avec la clé
   publique, en visiteur ou connecté : « permission denied ».
4. **Propriété** : une extraction créée par « Dr Essai » en envoyant
   `owner: "Pirate"` est enregistrée au nom de « Dr Essai ». « Dr Autre » ne
   peut pas la supprimer (`403`), même avec `?username=Dr Essai` ; « Dr Essai »
   le peut (`200`), et l'objet disparaît de Garage.
5. **Interface**, dans un navigateur :
   - création de compte : erreurs de mot de passe affichées en direct, arrivée
     sur le tableau de bord avec le bon nom ;
   - déconnexion, puis garde de route (`/dashboard` renvoie vers `/login`) ;
   - mauvais mot de passe, message en français ;
   - « Se souvenir de moi » décoché, session dans `sessionStorage` ;
   - mot de passe oublié, de bout en bout : e-mail dans Mailpit, lien, nouveau
     mot de passe, l'ancien est refusé et le nouveau accepté ;
   - thème sombre, et affichage mobile (375 px).
6. `tsc`, ESLint et `vite build` sans erreur.

**Non vérifié :** l'analyse IA (InstanSeg non démarré) et l'enregistrement
d'un compte rendu radiologique depuis l'interface. Ces deux chemins passent
par le même `apiFetch` que les appels testés.
