# 12 — Backlog de refonte : architecture, tests, CI/CD

> **Nature de ce document.** Deux parties, de natures différentes.
>
> Les **sections 1 à 10** sont une liste de **modifications de l'existant** :
> remettre d'aplomb l'architecture, la chaîne de tests, l'intégration continue
> et le déploiement continu. Aucun de ces items n'ajoute de fonctionnalité.
>
> La **section 11** ([Évolutions fonctionnelles](#11---évolutions-fonctionnelles))
> rassemble au contraire les **nouveautés demandées par l'équipe projet**. Elle
> a été ajoutée après l'audit et suit son propre gabarit. Ce qui reste écarté
> des deux parties est listé en
> [annexe A](#annexe-a--ce-que-ce-backlog-ne-contient-pas).

> **Méthode.** Chaque constat est vérifié dans le code et renvoie à un fichier
> et une ligne, comme le reste de [`docs/`](README.md). Quand le `README.md`
> racine ou la présentation annoncent autre chose que le code, c'est le code
> qui fait foi.

> **Périmètre non couvert.** La copie auditée n'est pas un dépôt git et ne
> contient aucun répertoire `.github/`. La chaîne d'intégration continue
> existante n'a donc **pas pu être lue** : la [section 6](#6--intégration-continue-ci)
> décrit la cible, à recouper avec les workflows réellement présents sur le
> dépôt distant.

---

## Comment lire ce backlog

Chaque item suit le même gabarit :

- **Constat** — ce que fait le code aujourd'hui, avec la référence.
- **Pourquoi c'est un problème** — la conséquence concrète, pas le principe.
- **Correctif** — l'action à mener.
- **Terminé quand** — le critère d'acceptation, vérifiable.

Dans les sections [6](#6--intégration-continue-ci) à
[8](#8--process-de-pr-et-règles-de-dépôt), qui décrivent des dispositifs
**absents** plutôt que du code existant, « Constat » et « Correctif »
fusionnent en un **Quoi**.

**Priorité.** `P0` = bloque d'autres chantiers, `P1` = à faire dans l'itération
courante, `P2` = à planifier, `P3` = confort.
**Effort.** `S` ≈ moins d'une demi-journée, `M` ≈ 1 à 2 jours, `L` ≈ plus.

---

## Tableau récapitulatif

| ID | Modification | Prio | Effort |
|---|---|---|---|
| **1 — Architecture backend** |
| [1.1](#11--éclater-mainpy-en-modules-métier) | Éclater `main.py` en modules métier | P1 | L |
| [1.2](#12--app-factory-et-lifespan--verrou-n1) | App factory et `lifespan` — **verrou n°1** | P0 | M |
| [1.3](#13--sortir-les-migrations-du-démarrage-de-lapplication) | Sortir les migrations du démarrage | P0 | S |
| [1.4](#14--couche-de-configuration-unique) | Couche de configuration unique | P1 | M |
| [1.5](#15--extraire-un-client-orthanc) | Extraire un client Orthanc | P2 | S |
| [1.6](#16--url-absolue-en-dur-dans-une-réponse-dapi) | URL absolue en dur dans une réponse d'API | P1 | S |
| [1.7](#17--triple-implémentation-de-safe_folder_name) | Triple implémentation de `safe_folder_name` | P2 | S |
| [1.8](#18--routes-synchrones-qui-bloquent-la-boucle-dévénements) | Routes synchrones qui bloquent la boucle | P1 | M |
| [1.9](#19--journalisation) | Journalisation | P2 | M |
| [1.10](#110--gestion-derreurs-homogène) | Gestion d'erreurs homogène | P2 | M |
| [1.11](#111--apis-dépréciées-pydantic-v2-fastapi) | APIs dépréciées (Pydantic v2, FastAPI) | P2 | S |
| [1.12](#112--modèle-de-données) | Modèle de données | P2 | M |
| [1.13](#113--get-patients-non-paginé) | `GET /patients` non paginé | P3 | S |
| [1.14](#114--outillage-python-absent) | Outillage Python absent | P0 | S |
| [1.15](#115--versions-de-python-divergentes) | Versions de Python divergentes | P2 | S |
| **2 — Architecture frontend** |
| [2.1](#21--découper-les-pages-géantes) | Découper les pages géantes | P1 | L |
| [2.2](#22--trois-clients-http-concurrents) | Trois clients HTTP concurrents | P1 | M |
| [2.3](#23--urls-en-dur-hors-des-clients) | URLs en dur hors des clients | P1 | S |
| [2.4](#24--erreurs-avalées-dans-la-couche-api) | Erreurs avalées dans la couche API | P2 | S |
| [2.5](#25--gardes-de-route-factices) | Gardes de route factices | P1 | S |
| [2.6](#26--eslint-sous-configuré-et-jamais-exécuté) | ESLint sous-configuré et jamais exécuté | P1 | S |
| [2.7](#27--npm-install-au-lieu-de-npm-ci) | `npm install` au lieu de `npm ci` | P1 | S |
| [2.8](#28--aucune-image-frontend-de-production--verrou-n2) | Aucune image frontend de production — **verrou n°2** | P0 | M |
| **3 — Hygiène du dépôt** |
| [3.1](#31--supprimer-les-six-fichiers-bak) | Supprimer les six fichiers `.bak` | P1 | S |
| [3.2](#32--fichiers-déditeur-versionnés) | Fichiers d'éditeur versionnés | P2 | S |
| [3.3](#33--les-données-du-seeder-sont-ignorées-par-git) | Les données du seeder sont ignorées par git | P1 | M |
| [3.4](#34--artefacts-générés-sur-le-disque-de-travail) | Artefacts générés sur le disque de travail | P2 | S |
| [3.5](#35--400-ko-de-markdown-dont-un-cours-de-108-ko) | 400 Ko de markdown, dont un cours de 108 Ko | P3 | S |
| [3.6](#36--fichiers-de-gouvernance-manquants) | Fichiers de gouvernance manquants | P2 | S |
| [3.7](#37--pas-de-envexample) | Pas de `.env.example` | P1 | S |
| **4 — Docker et Compose** |
| [4.1](#41--un-seul-compose-qui-est-un-compose-de-développement) | Un seul compose, de développement | P0 | M |
| [4.2](#42--aucun-image-sur-les-services-buildés--verrou-n3) | Aucun `image:` sur les services buildés — **verrou n°3** | P0 | S |
| [4.3](#43--container_name-figé-sur-tous-les-services) | `container_name` figé sur tous les services | P2 | S |
| [4.4](#44--depends_on-sans-condition-de-santé) | `depends_on` sans condition de santé | P1 | S |
| [4.5](#45--secrets-en-clair-dans-le-compose) | Secrets en clair dans le compose | P1 | S |
| [4.6](#46--ports-dinfrastructure-publiés-sur-lhôte) | Ports d'infrastructure publiés sur l'hôte | P2 | S |
| [4.7](#47--le-seeder-fait-partie-de-la-stack-principale) | Le seeder fait partie de la stack principale | P2 | S |
| [4.8](#48--dépendances-instanseg-non-épinglées) | Dépendances InstanSeg non épinglées | P1 | S |
| [4.9](#49--durcissement-des-dockerfiles) | Durcissement des Dockerfiles | P2 | M |
| **5 — Tests** |
| [5.1](#51--tests-unitaires-backend--commencer-ici) | Tests unitaires backend — commencer ici | P0 | M |
| [5.2](#52--test-de-contrat-openapi) | Test de contrat OpenAPI | P1 | M |
| [5.3](#53--validation-des-schémas-json-olga) | Validation des schémas JSON OLGA | P1 | M |
| [5.4](#54--tests-de-migration-alembic) | Tests de migration Alembic | P0 | M |
| [5.5](#55--tests-dintégration-de-lapi) | Tests d'intégration de l'API | P1 | L |
| [5.6](#56--tests-frontend-et-typecheck) | Tests frontend et typecheck | P1 | M |
| [5.7](#57--smoke-test-de-la-stack-compose) | Smoke test de la stack Compose | P1 | M |
| [5.8](#58--tests-de-bout-en-bout) | Tests de bout en bout | P3 | L |
| [5.9](#59--seuil-de-couverture-à-cliquet) | Seuil de couverture à cliquet | P2 | S |
| **6 — Intégration continue** |
| [6.1](#61--filtrage-par-chemin) | Filtrage par chemin | P2 | S |
| [6.2](#62--job-lint-backend) | Job `lint-backend` | P1 | S |
| [6.3](#63--job-lint-frontend) | Job `lint-frontend` | P1 | S |
| [6.4](#64--job-typecheck) | Job `typecheck` | P0 | S |
| [6.5](#65--job-test-backend) | Job `test-backend` | P0 | M |
| [6.6](#66--job-test-frontend) | Job `test-frontend` | P1 | S |
| [6.7](#67--job-schema) | Job `schema` | P1 | M |
| [6.8](#68--job-build-frontend) | Job `build-frontend` | P0 | S |
| [6.9](#69--job-docker-build) | Job `docker-build` | P0 | M |
| [6.10](#610--job-compose-smoke) | Job `compose-smoke` | P1 | M |
| [6.11](#611--job-security) | Job `security` | P1 | M |
| [6.12](#612--réglages-transverses-du-pipeline) | Réglages transverses du pipeline | P1 | S |
| **7 — Déploiement continu** |
| [7.1](#71--registry-dimages) | Registry d'images | P0 | S |
| [7.2](#72--stratégie-de-tags) | Stratégie de tags | P0 | S |
| [7.3](#73--job-publish) | Job `publish` | P0 | M |
| [7.4](#74--provenance--sbom-et-signature) | Provenance : SBOM et signature | P2 | M |
| [7.5](#75--environnements-et-approbation-manuelle) | Environnements et approbation manuelle | P1 | S |
| [7.6](#76--mécanique-de-déploiement) | Mécanique de déploiement | P1 | L |
| [7.7](#77--migrations-en-étape-de-déploiement-dédiée) | Migrations en étape dédiée | P0 | M |
| [7.8](#78--smoke-test-post-déploiement) | Smoke test post-déploiement | P1 | S |
| [7.9](#79--procédure-de-rollback) | Procédure de rollback | P1 | M |
| [7.10](#710--versionnement-et-changelog) | Versionnement et CHANGELOG | P2 | M |
| **8 — Process de PR et règles de dépôt** |
| [8.1](#81--gabarit-de-pull-request) | Gabarit de pull request | P1 | S |
| [8.2](#82--gabarits-dissue) | Gabarits d'issue | P3 | S |
| [8.3](#83--codeowners) | `CODEOWNERS` | P2 | S |
| [8.4](#84--protection-de-la-branche-main) | Protection de la branche `main` | P1 | S |
| [8.5](#85--conventional-commits-et-lint-du-titre-de-pr) | Conventional commits et lint du titre de PR | P2 | S |
| [8.6](#86--étiquetage-automatique) | Étiquetage automatique | P3 | S |
| [8.7](#87--pre-commit) | `pre-commit` | P1 | S |
| [8.8](#88--contributingmd) | `CONTRIBUTING.md` | P2 | S |
| **9 — Sécurité (corrections)** |
| [9.1](#91--cors-ouvert-avec-credentials) | CORS ouvert avec credentials | P0 | S |
| [9.2](#92--aucune-authentification-sur-lapi) | Aucune authentification sur l'API | P1 | L |
| [9.3](#93--allégation-de-certification-hds-fausse) | Allégation de certification HDS fausse | P0 | S |
| [9.4](#94--traversée-de-chemin-sur-les-chemins-issus-de-la-base) | Traversée de chemin | P1 | M |
| [9.5](#95--uploads-sans-limite-de-taille-ni-validation-de-contenu) | Uploads sans limite ni validation | P1 | M |
| [9.6](#96--fuite-dinformations-dans-les-messages-derreur) | Fuite d'informations dans les erreurs | P2 | S |
| [9.7](#97--aucun-journal-daudit) | Aucun journal d'audit | P1 | L |
| [9.8](#98--authentification-orthanc-portée-par-le-serveur-de-développement) | Auth Orthanc portée par le serveur de dev | P2 | M |
| **11 - Évolutions fonctionnelles** |
| [11.1](#111--entraîner-un-modèle-de-détection-de-zones-problématiques) | Entraîner un modèle de détection de zones problématiques | P2 | L |
| [11.2](#112--plusieurs-lames-et-examens-par-dossier-et-frise-chronologique) | Plusieurs lames et examens, frise chronologique | P1 | L |
| [11.3](#113--comparaison-côte-à-côte-avec-zoom-synchronisé) | Comparaison côte à côte, zoom synchronisé | P2 | M |
| [11.4](#114--commentaires-sur-un-dossier) | Commentaires sur un dossier | P2 | M |
| [11.5](#115--demande-de-second-avis) | Demande de second avis | P2 | M |
| [11.6](#116--recherche-et-filtres-sur-le-tableau-de-bord) | Recherche et filtres sur le tableau de bord | P1 | S |
| [11.7](#117--file-dattente-par-priorité) | File d'attente par priorité | P2 | S |
| [11.8](#118--notifications) | Notifications | P3 | M |
| [11.9](#119--changement-de-nom--wigo-devient-chiron) | Changement de nom : Chiron | — | fait |
| [11.10](#1110--visualisation-et-modification-en-temps-réel-entre-praticiens) | Visualisation et modification en temps réel | P3 | L |
| [11.11](#1111--application-web-tablette-et-téléphone) | Application web tablette et téléphone | P2 | L |

---

## 1 — Architecture backend

[`backend/main.py`](../backend/main.py) fait **1 166 lignes** et concentre :
le bootstrap des migrations, la configuration MinIO, l'instanciation des
clients externes, sept schémas Pydantic, dix-huit routes et les fonctions
internes de suppression. Aucune couche de service, sauf dans
[`backend/workflow/`](../backend/workflow/).

**Le patron cible existe déjà dans le dépôt.** Le moteur de workflow est
découpé en `router.py` / `service.py` / `schemas.py` / `constants.py`, le
routeur ne contenant aucune règle métier. Le `README.md` racine le dit
lui-même : « le nouveau code va dans les modules dédiés ». Toute cette section
consiste à **généraliser ce qui a déjà été fait une fois**, pas à inventer une
architecture.

### 1.1 — Éclater `main.py` en modules métier

**Constat.** Dix-huit routes couvrant six domaines distincts (patients,
biopsies, radiologie, extractions, annotations, IA) cohabitent dans un seul
fichier, entre les schémas Pydantic et les helpers de suppression.

**Pourquoi c'est un problème.** Deux personnes qui touchent à deux domaines
différents produisent systématiquement un conflit de fusion sur le même
fichier. Il est impossible de savoir, en lisant une PR, quel domaine est
impacté. Et rien n'empêche une route de radiologie d'aller manipuler
directement une biopsie.

**Correctif.** Créer `backend/patients/`, `backend/biopsies/`,
`backend/radiology/`, `backend/extractions/`, `backend/annotations/`,
`backend/ai/`, chacun sur le modèle de `workflow/` : un `router.py` qui ne fait
que traduire HTTP ↔ métier, un `service.py` qui porte les règles, un
`schemas.py` pour les modèles Pydantic. `main.py` ne garde que la construction
de l'application et le montage des routeurs.

Procéder **un domaine par PR**, en commençant par le plus isolé (radiologie),
jamais en un seul commit : une refonte big-bang sur 1 166 lignes est
irrelisable et donc non revue.

**Terminé quand.** `main.py` fait moins de 100 lignes et ne contient plus
aucun décorateur `@app.get/post/put/delete`.

---

### 1.2 — App factory et `lifespan` — verrou n°1

**Constat.** L'objet application est créé au niveau du module
([main.py:53](../backend/main.py#L53)) et **le simple fait d'importer
`main.py` déclenche** :

- l'exécution des migrations Alembic ([main.py:44](../backend/main.py#L44)),
  donc une connexion à PostgreSQL ;
- l'instanciation du client MinIO ([main.py:80](../backend/main.py#L80)) ;
- l'instanciation du client InstanSeg ([main.py:86](../backend/main.py#L86)) ;
- un `os.makedirs("/app/dzi_data")` ([main.py:63-64](../backend/main.py#L63-L64)),
  chemin absolu qui n'existe que dans le conteneur.

**Pourquoi c'est un problème.** C'est **le verrou qui interdit toute la
section 5**. Écrire `from main import app` dans un test échoue sur une machine
sans PostgreSQL, sans MinIO, et sans droit d'écriture sur `/app`. Aucun test de
route n'est donc possible aujourd'hui, ni en local ni en CI, quel que soit
l'outil choisi.

**Correctif.**

1. Remplacer le code au niveau module par une fonction `create_app() -> FastAPI`.
2. Déplacer tout ce qui ouvre une connexion ou crée un répertoire dans un
   gestionnaire `lifespan` (le hook moderne remplaçant `on_event`, cf. [1.11](#111--apis-dépréciées-pydantic-v2-fastapi)).
3. Exposer les clients MinIO, InstanSeg et Orthanc comme **dépendances FastAPI**
   (`Depends`), pas comme variables globales — c'est ce qui permet de les
   remplacer par un double dans un test.
4. Faire venir `DZI_FOLDER` de la configuration ([1.4](#14--couche-de-configuration-unique)),
   pas d'une constante absolue.

**Terminé quand.** `python -c "from app.main import create_app; create_app()"`
s'exécute sans erreur sur une machine où ni PostgreSQL, ni MinIO, ni InstanSeg
ne tournent.

---

### 1.3 — Sortir les migrations du démarrage de l'application

**Constat.** `apply_migrations()` est appelée à l'import, dans un `try/except`
qui se contente d'un `print` ([main.py:44-50](../backend/main.py#L44-L50)). Le
commentaire l'assume : « L'application démarre malgré tout pour que `/health`
puisse rapporter l'incident ».

**Pourquoi c'est un problème.** Une migration en échec ne fait pas échouer le
démarrage : l'API se met à servir du trafic sur un schéma inconnu, et les
erreurs qui en découlent apparaissent bien plus tard, sous forme de 500
disparates, loin de leur cause. En déploiement continu, c'est exactement le
scénario où l'on veut que le pipeline s'arrête net.

Au passage, dans une stack déployée à plusieurs répliques, N processus
lanceraient N `alembic upgrade` concurrents sur la même base.

**Correctif.** Retirer complètement l'appel du code applicatif. Exécuter
`alembic upgrade head` comme **étape de déploiement dédiée**
([7.7](#77--migrations-en-étape-de-déploiement-dédiée)), et en local via un
service Compose `migrate` à profil, dont le backend dépend avec
`condition: service_completed_successfully`. Conserver dans `/health` une
vérification que la révision Alembic en base correspond à la révision attendue,
et renvoyer un état dégradé sinon.

**Terminé quand.** `main.py` ne contient plus d'appel à Alembic, et une
migration cassée fait échouer le déploiement au lieu de démarrer l'API.

---

### 1.4 — Couche de configuration unique

**Constat.** Il n'existe aucun objet de configuration. Les valeurs MinIO sont
en dur ([main.py:75-78](../backend/main.py#L75-L78)) :

```python
MINIO_HOST = "minio:9000"
ACCESS_KEY = "minioadmin"
SECRET_KEY = "minioadmin"
BUCKET_NAME = "biopsie"
```

alors que [`docker-compose.yml`](../docker-compose.yml) injecte consciencieusement
`MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY` et `MINIO_BUCKET_NAME`
dans le conteneur backend.

**Pourquoi c'est un problème.** **Ces quatre variables ne sont lues par
personne.** Les modifier dans le compose ne change rien au comportement du
backend : c'est de la configuration fantôme, le pire cas de figure, puisqu'elle
donne l'illusion d'être paramétrable. Seul [`database.py`](../backend/database.py#L17)
lit réellement son environnement — et son en-tête documente précisément ce même
piège, déjà corrigé une fois pour `DATABASE_URL`.

**Correctif.** Un module `config.py` unique, basé sur `pydantic-settings`, qui
déclare tous les paramètres typés avec leurs valeurs par défaut de
développement, et qui **échoue au démarrage** si un paramètre obligatoire
manque en production. Aucun `os.getenv` ailleurs dans le code. Documenter
chaque variable dans `.env.example` ([3.7](#37--pas-de-envexample)).

**Terminé quand.** `grep -rn "os.getenv\|os.environ" backend/ --include=*.py`
ne renvoie que `config.py`, et changer `MINIO_BUCKET_NAME` dans le compose
change effectivement le bucket utilisé.

---

### 1.5 — Extraire un client Orthanc

**Constat.** L'URL du PACS est écrite en dur à trois endroits :
[main.py:272](../backend/main.py#L272), [main.py:300](../backend/main.py#L300),
[main.py:316](../backend/main.py#L316), avec les appels `requests` mêlés à la
logique de la route d'upload.

**Pourquoi c'est un problème.** Le projet a déjà un client externe propre et
isolé — [`instanseg_client.py`](../backend/instanseg_client.py) — qui prouve que
le patron est connu de l'équipe. Orthanc, lui, n'en a pas : impossible de le
mocker dans un test, impossible de changer son adresse, et la gestion d'erreur
réseau est dupliquée trois fois.

**Correctif.** Créer `backend/clients/orthanc.py` exposant une classe
`OrthancClient` symétrique de `InstanSegClient` (URL depuis la configuration,
méthodes `upload_instance`, `get_study`, `get_series`, timeouts explicites,
erreurs typées). Injecter le client par `Depends`.

**Terminé quand.** Aucune occurrence de `orthanc:8042` hors de
`clients/orthanc.py` et de la configuration.

---

### 1.6 — URL absolue en dur dans une réponse d'API

**Constat.** [main.py:874](../backend/main.py#L874) construit la réponse de
`GET /patients/{folder_id}/extractions` avec :

```python
"url": f"http://localhost:8002/dzi_data/{e.dzi_url}"
```

**Pourquoi c'est un problème.** L'API ne fonctionne que si le client tourne sur
la même machine qu'elle. Dès qu'on déploie sur un serveur — c'est-à-dire dès
qu'il y a une CD ([section 7](#7--déploiement-continu-cd)) — le frontend reçoit
des URL de tuiles pointant vers le poste de l'utilisateur, et le viewer
n'affiche rien. C'est un bug de déploiement garanti, aujourd'hui masqué par le
fait que tout tourne en local.

**Correctif.** Renvoyer un chemin relatif (`/dzi_data/{...}`) et laisser le
client le résoudre contre sa base d'API, ou construire l'URL depuis un
`settings.public_base_url`. La première option est préférable : elle survit à
un changement de nom de domaine sans reconfiguration.

**Terminé quand.** `grep -rn "localhost" backend/ --include=*.py` ne renvoie
plus que des valeurs de repli documentées dans `config.py`.

---

### 1.7 — Triple implémentation de `safe_folder_name`

**Constat.** La même normalisation de nom de dossier est écrite trois fois,
avec trois corps légèrement différents :

- [main.py:134](../backend/main.py#L134) — avec un repli `or "patient"` ;
- [storage.py:25](../backend/storage.py#L25) — sans ce repli ;
- [main.py:722-724](../backend/main.py#L722-L724) — réécrite inline dans
  `extract_roi`, sans le `replace(" ", "-")`.

**Pourquoi c'est un problème.** Un nom de dossier contenant une espace produit
un chemin différent selon la route empruntée : `Jean-Dupont` via l'upload,
`Jean Dupont` via l'extraction de ROI. Les fichiers atterrissent à deux
endroits et la résolution de lame de `storage.py` ne les retrouve pas. C'est
une divergence silencieuse, exactement le risque que l'en-tête de
[`storage.py`](../backend/storage.py) dit vouloir éviter.

**Correctif.** Une seule implémentation, dans `storage.py`, importée partout.
Supprimer les deux autres. Ajouter un test unitaire de ses cas limites
(chaîne vide, accents, espaces multiples, caractères de traversée) — c'est un
candidat idéal pour [5.1](#51--tests-unitaires-backend--commencer-ici).

**Terminé quand.** Une seule occurrence de `def safe_folder_name` dans le
dépôt, couverte par un test.

---

### 1.8 — Routes synchrones qui bloquent la boucle d'événements

**Constat.** Le travail a été fait sur `upload_biopsy` et `analyze-ai`, dont
les opérations PyVips et MinIO passent par `run_in_threadpool`, avec des
commentaires détaillés expliquant pourquoi. Mais
[`extract_roi`](../backend/main.py#L701) est déclarée `def` (synchrone) et
enchaîne, directement dans le worker :

- `download_biopsy_source` — téléchargement MinIO de plusieurs centaines de Mo
  ([main.py:499](../backend/main.py#L499)) ;
- `pyvips.Image.new_from_file(...).extract_area(...).tiffsave(...)` — plusieurs
  secondes à plusieurs minutes ;
- `minio_client.fput_object` — remontée du résultat.

`delete_patient` ([main.py:961](../backend/main.py#L961)) et
`get_extractions` ([main.py:860](../backend/main.py#L860)) présentent le même
profil à moindre échelle.

**Pourquoi c'est un problème.** Une route `def` dans FastAPI est exécutée dans
le pool de threads, mais le pool est limité (40 threads par défaut) et partagé :
quelques extractions simultanées suffisent à saturer l'API entière. Le
diagnostic est d'autant plus pénible que le symptôme est « l'application rame »
sans aucune erreur dans les journaux. C'est précisément le bug que les
commentaires de `upload_biopsy` disent avoir corrigé — il subsiste ailleurs.

**Correctif.** Appliquer partout la règle déjà écrite dans le code :
toute opération PyVips, MinIO ou fichier de plus de quelques millisecondes
passe par `run_in_threadpool`, la route devenant `async def`. Établir la règle
explicitement dans `CONTRIBUTING.md` ([8.8](#88--contributingmd)).

**Terminé quand.** Aucune route ne contient d'appel PyVips ou MinIO en dehors
d'un `run_in_threadpool`.

---

### 1.9 — Journalisation

**Constat.** **47 appels à `print()`** dans le backend (18 dans `main.py`,
28 dans `seed_images.py`, 1 dans `storage.py`), la plupart préfixés d'emojis :
`print(f"🧠 Analyse InstanSeg en cours...")`.

**Pourquoi c'est un problème.** Pas de niveau (impossible de filtrer le bruit),
pas d'horodatage, pas de corrélation entre les lignes d'une même requête, et
rien d'exploitable par un agrégateur de logs. En production, diagnostiquer un
incident revient à lire `docker compose logs` à l'œil. Les emojis, eux, cassent
certaines chaînes de collecte et rendent le `grep` hasardeux.

**Correctif.** Configurer `logging` dans `create_app()` : format JSON, niveau
piloté par la configuration, un logger par module. Ajouter un middleware
posant un `request_id` (généré ou repris de l'en-tête `X-Request-ID`) et le
propager dans le contexte de log. Remplacer les `print` par `logger.info` /
`warning` / `exception`. Interdire `print` via une règle ruff (`T20`).

**Terminé quand.** La règle ruff `T20` passe, et une requête produit des lignes
de log JSON portant toutes le même `request_id`.

---

### 1.10 — Gestion d'erreurs homogène

**Constat.** Le patron propre existe dans le workflow :
`service.WorkflowError` porte un code métier, et
[`router.py:20-26`](../backend/workflow/router.py#L20-L26) le traduit en statut
HTTP via une table `_STATUS_BY_CODE`. Ailleurs, le motif dominant est
`except Exception as error: raise HTTPException(500, detail=f"... {error}")`.

**Pourquoi c'est un problème.** Le client ne peut pas distinguer les cas : un
bucket MinIO absent, un fichier corrompu et une erreur de programmation
remontent tous en 500 avec un texte libre. Impossible d'écrire un frontend qui
réagit correctement, impossible d'écrire un test qui assert autre chose que
« ça a planté ». Et le contenu de l'exception part chez le client
([9.6](#96--fuite-dinformations-dans-les-messages-derreur)).

**Correctif.** Généraliser le patron du workflow : une hiérarchie
`DomainError` avec code métier par domaine, une table de correspondance unique,
et un `@app.exception_handler` global qui produit un corps de réponse
normalisé `{code, message, details}` — celui que le workflow renvoie déjà. Les
erreurs non prévues donnent une 500 générique, la trace allant dans les logs et
non dans la réponse.

**Terminé quand.** Toutes les routes renvoient le même format d'erreur, et les
codes métier sont documentés dans [05 — Endpoints d'API](05-api-endpoints.md).

---

### 1.11 — APIs dépréciées (Pydantic v2, FastAPI)

**Constat.** Le projet est sur Pydantic 2.13 et FastAPI 0.128, mais utilise les
formes de la génération précédente :

- `class Config: from_attributes = True` aux lignes
  [96](../backend/main.py#L96), [107](../backend/main.py#L107) et
  [122](../backend/main.py#L122) — remplacé par `model_config = ConfigDict(...)` ;
- `@app.on_event("shutdown")` ([main.py:455](../backend/main.py#L455)) —
  déprécié au profit de `lifespan`.

**Pourquoi c'est un problème.** Chaque démarrage émet des avertissements de
dépréciation qui noient les vrais messages, et ces APIs disparaîtront à la
prochaine majeure — au moment le plus inopportun, celui d'une mise à jour de
sécurité qu'on ne pourra pas différer.

**Correctif.** Migration mécanique. Le passage de `on_event` à `lifespan` se
fait naturellement en même temps que [1.2](#12--app-factory-et-lifespan--verrou-n1) :
c'est le même chantier. Activer les `DeprecationWarning` en erreur dans la
configuration pytest pour éviter la récidive.

**Terminé quand.** Le démarrage n'émet aucun `DeprecationWarning`, et
`filterwarnings = ["error::DeprecationWarning"]` est actif dans pytest.

---

### 1.12 — Modèle de données

**Constat.** Dans [`models.py`](../backend/models.py) :

- `datetime.utcnow` comme valeur par défaut, aux lignes
  [56](../backend/models.py#L56), [132](../backend/models.py#L132),
  [134](../backend/models.py#L134) et [173](../backend/models.py#L173) —
  déprécié depuis Python 3.12 et produisant un datetime *naïf* (sans fuseau) ;
- les dates métier sont stockées en `String` : `birth_date`,
  `prelevement_date`, `date`, `validation_date` ;
- `folder_id` ([models.py:13](../backend/models.py#L13)) sert de clé de
  recherche dans plusieurs routes (`/analyze-ai`, `/extract-roi`,
  `/patients/{folder_id}/extractions`) sans index ni contrainte d'unicité ;
- quasiment aucune colonne n'est `nullable=False`, y compris `name` et
  `patient_id`.

**Pourquoi c'est un problème.** Les dates en chaîne interdisent tout tri, toute
comparaison et tout calcul en SQL, et acceptent `"32/13/2024"` sans broncher —
sur un compte rendu anatomopathologique, c'est une donnée métier, pas un
libellé. L'absence d'unicité sur `folder_id` permet deux dossiers homonymes que
les routes de recherche confondront (`.first()` en prend un au hasard).
L'absence d'index fait un balayage de table à chaque ouverture de viewer.

**Correctif.** Une migration Alembic par point, dans cet ordre :
`datetime.now(timezone.utc)` ; conversion des colonnes de date en `Date` /
`DateTime(timezone=True)` avec conversion des données existantes ; index unique
sur `folder_id` (après détection et résolution des doublons) ; `nullable=False`
sur les colonnes structurellement obligatoires. Chaque migration validée par
[5.4](#54--tests-de-migration-alembic).

**Terminé quand.** `alembic check` ne produit aucun diff et les tests de
migration passent aller-retour.

---

### 1.13 — `GET /patients` non paginé

**Constat.** [main.py:696](../backend/main.py#L696) renvoie tous les patients,
et `PatientSchema` embarque la liste complète des biopsies et des études
radiologiques de chacun ([main.py:111-124](../backend/main.py#L111-L124)).

**Pourquoi c'est un problème.** La charge utile croît linéairement avec la base
et est rechargée à chaque affichage du tableau de bord. Sur un jeu de
démonstration c'est invisible ; la première démonstration sur une base réaliste
le rendra impossible à ignorer.

**Correctif.** Paramètres `limit` / `offset` (ou curseur) avec une borne
maximale côté serveur, et un schéma de liste allégé (sans les collections
imbriquées), le détail restant sur `GET /patients/{id}`.

**Terminé quand.** La route accepte une pagination bornée et le schéma de liste
ne contient plus de collection imbriquée.

---

### 1.14 — Outillage Python absent

**Constat.** Le backend n'a ni `pyproject.toml`, ni `setup.cfg`, ni
`pytest.ini`, ni `conftest.py`. Un seul `requirements.txt`, sans séparation des
dépendances de développement.

**Pourquoi c'est un problème.** **Il n'y a rien à brancher en CI.** Pas de
configuration de formatage (donc des diffs pollués par des reformatages
arbitraires), pas de linter (donc les imports morts et les variables inutilisées
s'accumulent), pas de typage vérifié, pas de point d'entrée pour les tests. Les
sections [5](#5--tests) et [6](#6--intégration-continue-ci) supposent toutes ce
fichier.

**Correctif.** Un `backend/pyproject.toml` portant : métadonnées du paquet,
dépendances d'exécution (reprises de `requirements.txt`, épinglages conservés),
groupe `dev` (pytest, pytest-cov, pytest-asyncio, httpx, ruff, black, mypy,
pip-audit), et la configuration de ruff (dont `T20` pour [1.9](#19--journalisation)),
black, mypy et pytest.

**Terminé quand.** `ruff check backend/`, `black --check backend/`,
`mypy backend/` et `pytest` s'exécutent tous en une commande depuis une
installation propre.

---

### 1.15 — Versions de Python divergentes

**Constat.** [`backend/Dockerfile`](../backend/Dockerfile#L1) part de
`python:3.9-slim`, [`instanseg/Dockerfile`](../instanseg/Dockerfile#L1) de
`python:3.11-slim`. Rien ne fixe la version utilisée en développement local.

**Pourquoi c'est un problème.** La CI testera sur une version, la production
tournera sur une autre : les différences de comportement (typage, `zoneinfo`,
dépréciations) ne se révéleront qu'en production. Par ailleurs, Python 3.9
arrive en fin de support et prive le code des annotations de type modernes déjà
utilisées ailleurs dans le projet.

**Correctif.** Aligner les trois environnements (backend, InstanSeg, CI) sur la
même version — 3.12 — et la déclarer une seule fois : `requires-python` dans
`pyproject.toml`, et un fichier `.python-version` à la racine que la CI lit pour
configurer sa matrice. Vérifier au passage la compatibilité de `numpy<2.0.0`
côté InstanSeg.

**Terminé quand.** La version de Python n'apparaît qu'à un seul endroit du
dépôt, et les deux images en partent.

---

## 2 — Architecture frontend

Le frontend souffre du symétrique du backend : le code récent
([`features/workflow/`](../frontend/src/features/workflow/)) est correctement
découpé en `api` / `hooks` / `components` / `types`, tandis que le code
historique tient dans trois fichiers énormes. Là encore, **le patron cible est
déjà dans le dépôt.**

### 2.1 — Découper les pages géantes

**Constat.** Trois fichiers concentrent l'essentiel du code :

| Fichier | Lignes |
|---|---|
| [`pages/Viewer.tsx`](../frontend/src/pages/Viewer.tsx) | **1 749** |
| [`pages/RadiologyViewer.tsx`](../frontend/src/pages/RadiologyViewer.tsx) | 557 |
| [`components/PatientCard.tsx`](../frontend/src/components/PatientCard.tsx) | 464 |

À comparer aux 94 lignes de [`useOlgaForm.ts`](../frontend/src/features/workflow/useOlgaForm.ts)
ou aux 90 de [`OlgaFormPanel.tsx`](../frontend/src/features/workflow/components/OlgaFormPanel.tsx).

**Pourquoi c'est un problème.** `Viewer.tsx` mélange l'initialisation
d'OpenSeadragon, la gestion des annotations, les appels à l'IA, l'export PDF et
le rendu. Aucune de ces parties n'est testable isolément, aucune n'est
réutilisable, et toute modification impose de relire 1 749 lignes pour vérifier
qu'on ne casse rien. C'est aussi le fichier sur lequel tous les conflits de
fusion se produisent.

**Correctif.** Créer `features/viewer/`, `features/radiology/` et
`features/patients/` calqués sur `features/workflow/` : les appels réseau dans
un `*Api.ts`, l'état et les effets dans des hooks (`useSlideViewer`,
`useAnnotations`, `useAiAnalysis`), le rendu dans des composants de moins de
200 lignes. Extraire **un hook par PR**, en vérifiant le comportement à chaque
étape — un viewer d'imagerie médicale se casse de façon subtile.

**Terminé quand.** Aucun fichier `.tsx` ne dépasse 300 lignes, et la logique
métier vit dans des hooks testables sans monter de composant.

---

### 2.2 — Trois clients HTTP concurrents

**Constat.** Trois modules font le même travail, chacun relisant la
configuration de son côté :

- [`services/api.ts:4`](../frontend/src/services/api.ts#L4) — axios, patients,
  uploads, suppressions ;
- [`features/workflow/workflowApi.ts:10`](../frontend/src/features/workflow/workflowApi.ts#L10) —
  routes du workflow ;
- [`features/workflow/olga/olgaClient.ts:14`](../frontend/src/features/workflow/olga/olgaClient.ts#L14) —
  service externe OLGA.

**Pourquoi c'est un problème.** La configuration de base (URL, timeout,
en-têtes, traitement des erreurs) est triplée et diverge déjà. Le jour où il
faut ajouter un en-tête d'authentification
([9.2](#92--aucune-authentification-sur-lapi)), il faut le faire à trois
endroits — et le quatrième, les appels inline de
[2.3](#23--urls-en-dur-hors-des-clients), sera oublié.

**Correctif.** Un module `lib/http.ts` exposant une instance axios configurée
(base URL, timeout, intercepteur de requête pour les en-têtes, intercepteur de
réponse normalisant les erreurs selon le format de
[1.10](#110--gestion-derreurs-homogène)). Les trois clients deviennent de
simples modules de fonctions qui l'utilisent. `olgaClient` garde sa propre
instance, puisqu'il vise un service externe, mais construite par la même
fabrique.

**Terminé quand.** `import.meta.env.VITE_API_URL` n'apparaît qu'une fois dans
`src/`.

---

### 2.3 — URLs en dur hors des clients

**Constat.** Des composants appellent le backend directement, sans passer par
la couche API, avec l'adresse écrite en toutes lettres :

- [`RadiologyViewer.tsx:92`](../frontend/src/pages/RadiologyViewer.tsx#L92),
  [:246](../frontend/src/pages/RadiologyViewer.tsx#L246),
  [:303](../frontend/src/pages/RadiologyViewer.tsx#L303) —
  `http://localhost:8002/radiology/...`, **sans même le repli sur la variable
  d'environnement** ;
- [`PatientCard.tsx:78`](../frontend/src/components/PatientCard.tsx#L78) et
  [:110](../frontend/src/components/PatientCard.tsx#L110) — refont le
  `import.meta.env.VITE_API_URL || 'http://localhost:8002'` à la main.

**Pourquoi c'est un problème.** Les trois appels de `RadiologyViewer` sont
cassés dès que l'application ne tourne pas sur le poste de l'utilisateur :
c'est le même bug de déploiement que [1.6](#16--url-absolue-en-dur-dans-une-réponse-dapi),
côté client. La lecture et l'enregistrement du compte rendu radiologique
échoueront silencieusement à la première mise en ligne.

**Correctif.** Déplacer ces appels dans `features/radiology/radiologyApi.ts` et
`features/patients/patientsApi.ts`, construits sur `lib/http.ts`
([2.2](#22--trois-clients-http-concurrents)). Ajouter une règle ESLint
`no-restricted-syntax` interdisant les littéraux `http://` dans `src/`.

**Terminé quand.** La règle ESLint passe et aucun composant n'importe `axios`
directement.

---

### 2.4 — Erreurs avalées dans la couche API

**Constat.** [`api.ts:62-65`](../frontend/src/services/api.ts#L62-L65) :

```ts
} catch (error) {
  console.error("Erreur lors de la récupération des patients", error);
  return [];
}
```

**Pourquoi c'est un problème.** L'interface ne peut pas distinguer « il n'y a
aucun patient » de « le backend est éteint » : dans les deux cas elle affiche
un tableau de bord vide. L'utilisateur conclut que ses données ont disparu, et
le support commence par chercher au mauvais endroit. Sur un dossier patient,
c'est le pire message possible.

**Correctif.** Laisser l'erreur remonter et la traiter dans le composant :
trois états distincts (chargement, erreur avec possibilité de réessayer,
données vides). Poser la règle : la couche API ne rattrape jamais une erreur
sans la transformer en valeur porteuse de sens.

**Terminé quand.** Éteindre le backend produit un message d'erreur explicite
dans l'interface, distinct de l'état « aucun dossier ».

---

### 2.5 — Gardes de route factices

**Constat.** [`App.tsx:9`](../frontend/src/App.tsx#L9) :

```ts
const isAuthenticated = true;
```

suivi de trois routes « protégées » par cette constante
([App.tsx:16-19](../frontend/src/App.tsx#L16-L19)). Côté connexion, le champ
mot de passe de [`Login.tsx:41`](../frontend/src/pages/Login.tsx#L41) **n'a ni
`value` ni `onChange`** : il n'est jamais lu, et `handleLogin` se contente
d'écrire le nom saisi dans `localStorage`.

**Pourquoi c'est un problème.** La structure de garde existe et donne
l'apparence d'une protection, alors qu'elle n'en est pas une. C'est trompeur
pour quiconque relit le code, et c'est un faux sentiment de sécurité pour
l'équipe. Le fond du sujet est traité en [9.2](#92--aucune-authentification-sur-lapi).

**Correctif.** Tant que l'authentification réelle n'est pas faite, remplacer la
constante par un `useAuth()` qui lit l'état de session réel, et faire échouer
le rendu explicitement plutôt que d'ouvrir. Ajouter un bandeau visible en
environnement non-production indiquant que l'authentification est désactivée.
Surtout : ne pas laisser un `= true` en dur qui ressemble à une protection.

**Terminé quand.** Aucune constante d'authentification codée en dur dans le
routage.

---

### 2.6 — ESLint sous-configuré et jamais exécuté

**Constat.** [`eslint.config.js:19`](../frontend/eslint.config.js#L19) déclare
`ecmaVersion: 2020` alors que la cible TypeScript est ES2022
([`tsconfig.app.json:4`](../frontend/tsconfig.app.json#L4)). Il n'y a pas de
Prettier. Et le script `npm run lint` n'est déclenché par rien d'automatique :
il faut y penser.

**Pourquoi c'est un problème.** Un linter qu'on n'exécute pas ne sert à rien :
la dette qu'il détecterait s'accumule sans que personne ne la voie. L'absence
de formateur produit des diffs où les changements réels se noient dans des
reformatages d'éditeur, ce qui rend les revues de PR inefficaces — problème qui
se paiera directement en [section 8](#8--process-de-pr-et-règles-de-dépôt).

**Correctif.** Aligner `ecmaVersion` sur `2022`. Ajouter Prettier avec
`eslint-config-prettier`, plus les règles `no-restricted-syntax`
([2.3](#23--urls-en-dur-hors-des-clients)) et
`@typescript-eslint/no-explicit-any`. Brancher le tout en CI
([6.3](#63--job-lint-frontend)) et en `pre-commit` ([8.7](#87--pre-commit)).

**Terminé quand.** `npm run lint` et `npx prettier --check .` passent, et sont
exécutés à chaque PR.

---

### 2.7 — `npm install` au lieu de `npm ci`

**Constat.** [`frontend/Dockerfile:8`](../frontend/Dockerfile#L8) utilise
`npm install`, alors que `package-lock.json` (213 Ko) est versionné.

**Pourquoi c'est un problème.** `npm install` peut modifier le lockfile et
installer des versions différentes de celles validées, puisque les dépendances
sont déclarées en `^`. Deux builds de la même révision de code peuvent produire
deux images différentes — ce qui rend un bug de production impossible à
reproduire et vide de sens la traçabilité par tag d'image
([7.2](#72--stratégie-de-tags)).

**Correctif.** `npm ci` dans le Dockerfile et dans tous les jobs de CI. En
bonus, `npm ci` échoue si le lockfile est désynchronisé du `package.json`, ce
qui attrape un oubli de commit.

**Terminé quand.** Aucune occurrence de `npm install` dans les Dockerfiles ni
dans les workflows.

---

### 2.8 — Aucune image frontend de production — verrou n°2

**Constat.** [`frontend/Dockerfile`](../frontend/Dockerfile) se termine par :

```dockerfile
CMD ["npm", "run", "dev", "--", "--host"]
```

avec, en commentaire, « Lancement en mode développement (pour que ça reste
simple et modifiable) ». Aucun `npm run build`, aucun serveur statique, aucune
étape multi-stage.

**Pourquoi c'est un problème.** **C'est le verrou n°2 : il n'existe
matériellement rien à déployer.** Toute la [section 7](#7--déploiement-continu-cd)
en dépend. Accessoirement, publier un serveur de développement Vite signifie :
sources et sourcemaps exposées, aucune minification, HMR ouvert, performances
sans rapport avec un build, et le proxy Orthanc du serveur de dev porteur des
identifiants ([9.8](#98--authentification-orthanc-portée-par-le-serveur-de-développement)).

**Correctif.** Dockerfile multi-stage :

1. étape `builder` sur `node:20-alpine` — `npm ci` puis `npm run build`
   (lequel exécute déjà `tsc -b && vite build`) ;
2. étape finale sur `nginx:alpine` — copie de `dist/`, configuration nginx avec
   fallback SPA vers `index.html`, en-têtes de sécurité, et proxy vers le
   backend si l'on ne met pas de reverse proxy devant.

Conserver le Dockerfile actuel comme `Dockerfile.dev`, référencé par le compose
de développement ([4.1](#41--un-seul-compose-qui-est-un-compose-de-développement)).

**Point d'attention.** Les variables `VITE_*` sont figées **à la compilation**,
pas au démarrage du conteneur. Une même image ne peut donc pas servir deux
environnements sans un mécanisme de substitution à l'exécution (fichier
`config.js` généré par l'entrypoint et lu par l'application). À décider
explicitement plutôt qu'à découvrir en déployant.

**Terminé quand.** `docker build -t chiron-frontend frontend/` produit une image
servie par nginx, et l'application fonctionne depuis cette image.

---

## 3 — Hygiène du dépôt

### 3.1 — Supprimer les six fichiers `.bak`

**Constat.** Six sauvegardes manuelles sont versionnées :

| Fichier | Taille |
|---|---|
| [`backend/main.py.bak`](../backend/main.py.bak) | 40 Ko |
| [`frontend/src/pages/Viewer.tsx.bak`](../frontend/src/pages/Viewer.tsx.bak) | 1 732 lignes |
| [`docker-compose.yml.bak`](../docker-compose.yml.bak) | 3 Ko |
| [`frontend/vite.config.ts.bak`](../frontend/vite.config.ts.bak) | 454 o |
| [`instanseg/Dockerfile.bak`](../instanseg/Dockerfile.bak) | 788 o |
| [`instanseg/requirements.txt.bak`](../instanseg/requirements.txt.bak) | 182 o |

**Pourquoi c'est un problème.** C'est exactement le rôle de git, et ces copies
sont activement nuisibles : une recherche `grep` dans le dépôt renvoie deux
fois chaque résultat, ce qui fait perdre du temps et conduit régulièrement à
modifier la mauvaise copie. `Viewer.tsx.bak` en particulier est un quasi-doublon
de 1 732 lignes du fichier actif. Ils échappent au typecheck et au linter, donc
personne ne voit qu'ils pourrissent.

**Correctif.** `git rm` les six. Si un contenu doit être conservé, le retrouver
dans l'historique ou poser une étiquette git. Ajouter `*.bak` au `.gitignore`
et un hook `pre-commit` qui les refuse ([8.7](#87--pre-commit)).

**Terminé quand.** `find . -name "*.bak"` ne renvoie rien hors `node_modules`.

---

### 3.2 — Fichiers d'éditeur versionnés

**Constat.** `.DS_Store` (8 Ko) est présent à la racine **alors que
[`.gitignore:19`](../.gitignore#L19) le couvre** — signe qu'il a été ajouté
avant la règle et n'a jamais été retiré de l'index. Le répertoire
[`.obsidian/`](../.obsidian/) (configuration personnelle d'Obsidian, dont
`workspace.json`) est également versionné.

**Pourquoi c'est un problème.** `workspace.json` change à chaque ouverture de
l'éditeur, ce qui produit des modifications parasites permanentes et des
conflits de fusion sur un fichier sans aucune valeur pour le projet. C'est
aussi la configuration d'un poste précis, imposée à toute l'équipe.

**Correctif.** `git rm --cached .DS_Store` et `git rm -r --cached .obsidian/`,
puis ajouter `.obsidian/` au `.gitignore`. Pour `.DS_Store`, la bonne place est
le `.gitignore` global du poste (`~/.config/git/ignore`), en plus de celui du
projet.

**Terminé quand.** `git status` est propre après une simple ouverture de
l'éditeur.

---

### 3.3 — Les données du seeder sont ignorées par git

**Constat.** [`.gitignore:36-38`](../.gitignore#L36-L38) exclut `*.tif`, `*.dcm`
et `*.DCM`. Or `backend/images_initiales/` contient précisément
`radiologie/0002.DCM`, `radiologie/Anonymized_20260410.dcm`,
`radiologie/image-00000.dcm` et `biopsie/HE_example.tif` — les fichiers que
[`seed_images.py`](../backend/seed_images.py) injecte au démarrage.

**Pourquoi c'est un problème.** **Sur un clone frais, le seeder n'a rien à
injecter.** Le service `image_seeder` du compose se terminera sans rien faire,
et le nouvel arrivant obtiendra une application vide, sans comprendre pourquoi
— alors que la documentation lui promet un jeu de démonstration. C'est aussi
un futur échec du smoke test de [5.7](#57--smoke-test-de-la-stack-compose), qui
tournera en CI sur un clone propre.

**Correctif.** Trois options, à trancher explicitement :

1. **Git LFS** pour ces quatre fichiers — simple, mais impose LFS à tout le
   monde et consomme du quota ;
2. **téléchargement au démarrage** du seeder depuis une source externe
   (release GitHub, stockage objet) — propre, mais ajoute une dépendance
   réseau ;
3. **assumer l'absence** et documenter la procédure manuelle de dépôt des
   images, en faisant échouer le seeder avec un message explicite.

Quelle que soit l'option, la règle « aucune image médicale réelle dans le
dépôt » reste absolue.

**Terminé quand.** Un clone frais suivi de `docker compose up` produit une
application peuplée, ou un message d'erreur explicite indiquant quoi faire.

---

### 3.4 — Artefacts générés sur le disque de travail

**Constat.** `backend/dzi_data/HE_example/` contient plusieurs dizaines de
tuiles JPEG générées, et `backend/__pycache__/` ainsi que
`backend/workflow/__pycache__/` contiennent des `.pyc` compilés pour
Python 3.9. Ces chemins sont bien dans `.gitignore`.

**Pourquoi c'est un problème.** Ils ne devraient pas être dans le suivi, et il
faut le **vérifier dans l'historique** : un `dzi_data/` entré une fois dans un
commit reste dans l'historique pour toujours et le fait grossir durablement. Les
`.pyc` en 3.9 deviendront du bruit après [1.15](#115--versions-de-python-divergentes).

**Correctif.** Vérifier par `git log --all --diff-filter=A -- backend/dzi_data`
et `git count-objects -vH` si ces fichiers ont un jour été commités. Si oui,
décider si la réécriture d'historique en vaut le coût (sur un projet
universitaire de cette taille, probablement pas — mais il faut le savoir).
Nettoyer localement, et vérifier que
[`backend/.dockerignore`](../backend/.dockerignore) exclut bien `dzi_data/` et
`__pycache__/` du contexte de build.

**Terminé quand.** Le contexte de build Docker du backend fait moins de
quelques mégaoctets, et aucun artefact généré n'est suivi.

---

### 3.5 — 400 Ko de markdown, dont un cours de 108 Ko

**Constat.** [`docs/`](README.md) contient environ 400 Ko de markdown, dont
[`11-react-vite-de-zero.md`](11-react-vite-de-zero.md) à **108 Ko** — un cours
complet de React et Vite pour débutant, explicitement présenté comme tel dans
l'index.

**Pourquoi c'est un problème.** Ce n'est pas de la documentation de projet mais
du support de formation. Mélangé au reste, il dilue la documentation utile :
une recherche dans `docs/` renvoie majoritairement des extraits de cours. Il
vieillira aussi indépendamment du projet (une nouvelle version de React ne
change rien à Chiron mais périme le cours).

**Correctif.** Séparer `docs/projet/` (01 à 10, plus le présent document) et
`docs/formation/` (11), avec une phrase dans l'index expliquant la distinction.
Solution plus radicale si le cours n'est plus utile à personne : le sortir du
dépôt. Décision d'équipe, pas technique.

**Terminé quand.** L'index distingue clairement documentation projet et support
de formation.

---

### 3.6 — Fichiers de gouvernance manquants

**Constat.** Absents du dépôt : `LICENSE` (le `README.md` racine le reconnaît :
« Aucune licence n'est encore associée à ce dépôt »), `CONTRIBUTING.md`,
`CHANGELOG.md`, `SECURITY.md`.

**Pourquoi c'est un problème.** Sans licence, le statut juridique du code est
indéterminé : personne ne peut légalement le réutiliser, y compris les membres
du groupe après la SAÉ, et un éventuel commanditaire ne sait pas ce qu'il
reçoit. Sans `CONTRIBUTING`, chaque nouvel arrivant réinvente la convention de
branches et découvre les règles en se faisant reprendre en revue.

**Correctif.** Ajouter les quatre. `LICENSE` est une décision à prendre avec
l'encadrant (propriétaire du code d'une SAÉ). `CHANGELOG.md` sera généré
automatiquement ([7.10](#710--versionnement-et-changelog)). `CONTRIBUTING.md`
est détaillé en [8.8](#88--contributingmd).

**Terminé quand.** Les quatre fichiers existent et sont référencés depuis le
`README.md` racine.

---

### 3.7 — Pas de `.env.example`

**Constat.** [`.gitignore:41-43`](../.gitignore#L41-L43) contient déjà
l'exception `!.env.example` — **mais le fichier n'existe pas**. Quelqu'un a
prévu l'emplacement sans jamais le remplir. Aucun `.env` n'est présent non
plus : toute la configuration vit dans le compose.

**Pourquoi c'est un problème.** Il n'existe aucune liste des variables
d'environnement du projet. Le `README.md` en documente une partie
(`SEED_BASE_DIR`, `DZI_FOLDER`, `ALEMBIC_URL`…), le compose en injecte d'autres
— dont quatre qui ne sont lues par personne
([1.4](#14--couche-de-configuration-unique)). Personne ne peut dire de mémoire
ce qu'il faut renseigner pour démarrer hors Docker, et c'est un prérequis de
[4.5](#45--secrets-en-clair-dans-le-compose).

**Correctif.** Créer `.env.example` à la racine, listant **toutes** les
variables avec un commentaire d'une ligne et une valeur de développement
inoffensive. Le générer à partir de `config.py`
([1.4](#14--couche-de-configuration-unique)) et **vérifier en CI** que les deux
sont synchronisés — sinon il divergera en trois semaines.

**Terminé quand.** `cp .env.example .env && docker compose up` démarre une
stack fonctionnelle, et la CI échoue si une variable de `config.py` manque dans
l'exemple.

---

## 4 — Docker et Compose

### 4.1 — Un seul compose, qui est un compose de développement

**Constat.** [`docker-compose.yml`](../docker-compose.yml) est l'unique
description de la stack, et elle est entièrement orientée développement :
montage du code source en volume (`./backend:/app`, `./frontend:/app`),
frontend lancé en `npm run dev`, ports d'infrastructure publiés, identifiants
par défaut en clair.

**Pourquoi c'est un problème.** Il n'existe aucune description de la stack
telle qu'elle devrait tourner ailleurs que sur un poste de développeur. La
[section 7](#7--déploiement-continu-cd) n'a donc rien à déployer, et les montages
de code en volume masquent les erreurs de `COPY` dans les Dockerfiles : une
image peut être cassée sans que personne s'en aperçoive, puisque le code est
monté par-dessus.

**Correctif.** Découper selon la convention Compose :

- `compose.yml` — la base commune : services, réseau, volumes de données,
  healthchecks, `image:` ([4.2](#42--aucun-image-sur-les-services-buildés--verrou-n3)) ;
- `compose.override.yml` — appliqué automatiquement en local : `build:`,
  volumes de code, `Dockerfile.dev` du frontend, ports publiés ;
- `compose.prod.yml` — images tirées du registry, aucun volume de code, aucun
  port d'infrastructure exposé, secrets par `env_file`.

**Terminé quand.** `docker compose -f compose.yml -f compose.prod.yml up`
démarre une stack qui n'utilise aucun fichier du dépôt en dehors des images.

---

### 4.2 — Aucun `image:` sur les services buildés — verrou n°3

**Constat.** `backend`, `frontend`, `instanseg` et `image_seeder` ne déclarent
que `build:`. Aucun nom d'image, donc aucun tag.

**Pourquoi c'est un problème.** **C'est le verrou n°3 de la CD.** Sans nom
d'image, il n'y a rien à pousser vers un registry, rien à tirer sur un serveur,
rien à référencer dans un rollback. Docker Compose nomme l'image d'après le
répertoire du projet, ce qui est local et non reproductible. Toute la
[section 7](#7--déploiement-continu-cd) est bloquée tant que ce point n'est pas
réglé.

**Correctif.** Sur chaque service buildé :

```yaml
image: ghcr.io/<org>/chiron-backend:${TAG:-dev}
```

`TAG` non défini en local, la valeur du tag publié en déploiement
([7.2](#72--stratégie-de-tags)). `image_seeder` réutilise l'image du backend
avec une commande différente — pas besoin d'une image dédiée.

**Terminé quand.** `docker compose config` affiche un nom d'image complet pour
chaque service, et `TAG=sha-abc1234 docker compose pull` fonctionne.

---

### 4.3 — `container_name` figé sur tous les services

**Constat.** Les sept services fixent leur nom de conteneur : `p6_postgres`,
`p6_backend`, `p6_frontend`, etc. Et ce nom est utilisé comme nom d'hôte
ailleurs : `DATABASE_URL=postgresql://user:password@p6_postgres:5432/p6_db`,
`target: 'http://p6_orthanc:8042'` dans
[`vite.config.ts:15`](../frontend/vite.config.ts#L15).

**Pourquoi c'est un problème.** Un nom de conteneur est unique sur un démon
Docker : impossible de lancer deux stacks en parallèle (la CI et le
développement sur la même machine, ou deux branches en test), impossible de
faire `--scale`. Le couplage au nom de conteneur plutôt qu'au **nom de
service** est par ailleurs inutile : Docker résout déjà `postgres` et `orthanc`
sur le réseau du projet, comme le fait correctement `minio`, qui a un `alias`
explicite.

**Correctif.** Supprimer tous les `container_name` et référencer les services
par leur nom de service (`postgres`, `orthanc`, `minio`, `instanseg`). Docker
Compose préfixe automatiquement par le nom de projet, ce qui isole les stacks.
Mettre à jour `DATABASE_URL` et le proxy Vite en conséquence.

**Terminé quand.** Deux `docker compose -p chiron-a up` et
`docker compose -p chiron-b up` coexistent sur la même machine.

---

### 4.4 — `depends_on` sans condition de santé

**Constat.** Le backend déclare `depends_on: [postgres, minio]`, sans
condition. Seul `instanseg` définit un `healthcheck`. `postgres`, `minio`,
`orthanc`, `backend` et `frontend` n'en ont aucun — alors que le backend expose
déjà un endpoint `/health` ([main.py:466](../backend/main.py#L466)) qui vérifie
réellement ses dépendances.

**Pourquoi c'est un problème.** `depends_on` sans condition attend seulement
que le conteneur **démarre**, pas qu'il soit **prêt**. PostgreSQL met plusieurs
secondes à accepter des connexions : au premier `up`, le backend démarre avant,
les migrations échouent, et comme elles sont dans un `try/except` silencieux
([1.3](#13--sortir-les-migrations-du-démarrage-de-lapplication)), l'API se met
à servir sur une base vide. C'est le grand classique du « ça marche au
deuxième `docker compose up` », et c'est exactement ce qui fera clignoter le
job de [5.7](#57--smoke-test-de-la-stack-compose) en CI.

**Correctif.** Un `healthcheck` sur chaque service (`pg_isready` pour
PostgreSQL, `/minio/health/live`, `/system` pour Orthanc, `/health` pour le
backend), et des dépendances qualifiées :

```yaml
depends_on:
  postgres:
    condition: service_healthy
  migrate:
    condition: service_completed_successfully
```

**Terminé quand.** `docker compose up` sur une machine sans volume préexistant
aboutit à une stack fonctionnelle du premier coup, de façon reproductible.

---

### 4.5 — Secrets en clair dans le compose

**Constat.** `POSTGRES_PASSWORD: password`, `MINIO_ROOT_PASSWORD: minioadmin`,
la chaîne `postgresql://user:password@...`, et les identifiants Orthanc dans
[`vite.config.ts:25`](../frontend/vite.config.ts#L25). Tout est versionné.
[`ACCES.md`](../ACCES.md) l'assume explicitement et prévient qu'aucune de ces
valeurs n'est un secret.

**Pourquoi c'est un problème.** L'intention est saine, mais la **structure**
est fausse : puisqu'il n'existe aucun mécanisme pour fournir des valeurs
différentes, le jour où quelqu'un doit déployer, il n'a que deux options —
garder les mots de passe publics, ou modifier un fichier versionné et
finir par y commiter un vrai secret. Le second cas est la façon dont la
majorité des fuites de secrets se produisent.

**Correctif.** Remplacer les valeurs littérales par des références
d'environnement (`POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?}` — la syntaxe `:?`
fait échouer le démarrage si la variable manque), fournies par un `env_file`
non versionné, documentées dans `.env.example`
([3.7](#37--pas-de-envexample)). En production, secrets injectés par
l'environnement de déploiement, jamais par un fichier du dépôt. Ajouter
`gitleaks` en CI ([6.11](#611--job-security)) et en `pre-commit`.

**Terminé quand.** Aucun mot de passe littéral dans les fichiers versionnés, et
un démarrage sans `.env` échoue avec un message explicite.

---

### 4.6 — Ports d'infrastructure publiés sur l'hôte

**Constat.** Le compose publie `5432` (PostgreSQL), `9000`/`9001` (MinIO),
`8042`/`4242` (Orthanc) sur l'hôte, en plus des ports applicatifs.

**Pourquoi c'est un problème.** En développement, c'est utile et voulu (la
console MinIO, `psql`…). Sur un serveur, cela expose une base de données et un
PACS avec leurs identifiants par défaut directement sur le réseau, c'est-à-dire
un accès complet aux données d'imagerie sans passer par l'application.

**Correctif.** Conserver les `ports:` d'infrastructure dans
`compose.override.yml` (développement) uniquement. Dans `compose.prod.yml`, ne
publier que le frontend et, si nécessaire, le backend — idéalement derrière un
reverse proxy terminant le TLS. Les services se joignent entre eux par le
réseau Docker, qui n'a pas besoin de ports publiés.

**Terminé quand.** `docker compose -f compose.yml -f compose.prod.yml config`
ne publie aucun port de PostgreSQL, MinIO ni Orthanc.

---

### 4.7 — Le seeder fait partie de la stack principale

**Constat.** `image_seeder` est un service ordinaire du compose : il démarre à
chaque `docker compose up`, exécute `python seed_images.py` et sort en 0.
[`ACCES.md`](../ACCES.md) doit d'ailleurs préciser que `docker compose ps -a`
le montre arrêté, ce qui est normal.

**Pourquoi c'est un problème.** Un conteneur qui sort immédiatement pollue
l'état de la stack et fait douter à chaque consultation. Surtout, injecter des
données de démonstration est une opération de développement : on ne veut
**jamais** qu'elle parte en production, et rien ne l'en empêche aujourd'hui.

**Correctif.** Passer le service en `profiles: [seed]`, invoqué explicitement
par `docker compose --profile seed up image_seeder`. Le retirer de la stack par
défaut et documenter la commande dans `ACCES.md` et `CONTRIBUTING.md`.

**Terminé quand.** `docker compose up` ne démarre que les six services
permanents, et `docker compose ps -a` ne montre aucun conteneur sorti.

---

### 4.8 — Dépendances InstanSeg non épinglées

**Constat.** [`backend/requirements.txt`](../backend/requirements.txt) est
exemplaire : tout est épinglé, avec un commentaire expliquant pourquoi (« un
build doit produire deux fois le même environnement »).
[`instanseg/requirements.txt`](../instanseg/requirements.txt) fait l'inverse :

```
fastapi
uvicorn[standard]
python-multipart
torch
Pillow
numpy<2.0.0
instanseg-torch @ git+https://github.com/instanseg/instanseg.git
```

Aucune version, et une dépendance git **sans révision** : le build tire le
`HEAD` de la branche par défaut d'un dépôt tiers.

**Pourquoi c'est un problème.** Deux builds de la même révision de code
produisent deux images différentes. Une modification poussée en amont par
l'équipe InstanSeg casse le build — ou pire, le fait réussir avec un
comportement différent, sans qu'aucun fichier du dépôt n'ait changé. Le
diagnostic est alors très coûteux : tout indique un code identique. Cela ruine
aussi la reproductibilité que la [section 7](#7--déploiement-continu-cd) est
censée garantir.

**Correctif.** Épingler toutes les versions, y compris celle de `torch`
(installé depuis l'index CPU dans le Dockerfile), et figer la dépendance git
sur un commit :
`instanseg-torch @ git+https://github.com/instanseg/instanseg.git@<sha>`.
Appliquer la même discipline que côté backend, en conservant les commentaires
qui expliquent les contraintes (`numpy<2.0.0`, index CPU de PyTorch).

**Terminé quand.** Deux builds de l'image InstanSeg à une semaine d'intervalle
produisent le même ensemble de paquets.

---

### 4.9 — Durcissement des Dockerfiles

**Constat.** Sur les trois images :

- aucun `USER` : tout tourne en `root` ;
- aucun `HEALTHCHECK` déclaré dans les images (seul le compose en définit un,
  pour InstanSeg) ;
- images de base par tag mouvant (`python:3.9-slim`, `node:20-alpine`), et
  `minio/minio` sans tag du tout dans le compose — donc `latest` ;
- [`backend/Dockerfile:22`](../backend/Dockerfile#L22) fait `COPY . .`, dont le
  périmètre dépend entièrement de [`.dockerignore`](../backend/.dockerignore),
  à vérifier contre `dzi_data/`, `images_initiales/` et `__pycache__/` ;
- `instanseg/Dockerfile` fait un `apt-get purge` en couche séparée après
  l'installation, ce qui **ne réduit pas** la taille de l'image (la couche
  précédente reste dans l'historique).

**Pourquoi c'est un problème.** Un processus `root` dans un conteneur
transforme une exécution de code arbitraire en compromission de l'hôte, sur une
application qui manipule des données de santé. Les tags mouvants signifient que
l'image de base peut changer sous les pieds du projet entre deux builds, ce qui
est la même perte de reproductibilité qu'en
[4.8](#48--dépendances-instanseg-non-épinglées). Et `COPY . .` sur un contexte
mal filtré recopie potentiellement des centaines de mégaoctets de tuiles dans
l'image.

**Correctif.** Créer un utilisateur non privilégié et `USER app` avant le `CMD`
dans les trois images. Ajouter un `HEALTHCHECK` dans chaque image (plutôt que
dans le compose, pour qu'il suive l'image partout). Épingler les images de base
par digest (`python:3.12-slim@sha256:...`), avec Dependabot pour les mises à
jour ([6.12](#612--réglages-transverses-du-pipeline)). Vérifier et compléter
les `.dockerignore`. Pour InstanSeg, fusionner installation et purge dans une
seule instruction `RUN`, ou passer en multi-stage. Ajouter `hadolint` en CI.

**Terminé quand.** `hadolint` passe sur les trois Dockerfiles, `docker run`
montre un utilisateur non-root, et la taille des images est mesurée et suivie.

---

## 5 — Tests

**État actuel : il n'existe aucun test dans le dépôt.** Ni `pytest.ini`, ni
`conftest.py`, ni fichier `test_*.py`, ni `vitest`, ni `*.test.ts(x)`. Aucune
dépendance de test n'est déclarée, ni côté Python, ni côté npm.

Deux prérequis conditionnent toute cette section :
[1.2](#12--app-factory-et-lifespan--verrou-n1) (sans app factory, rien
d'important n'est importable en test) et
[1.14](#114--outillage-python-absent) (sans `pyproject.toml`, rien à
configurer). Les items ci-dessous sont classés du plus rentable au moins.

### 5.1 — Tests unitaires backend — commencer ici

**Constat.** Certains modules sont **déjà testables en l'état**, sans aucune
refonte préalable, parce qu'ils sont purs ou n'ont que des dépendances
injectables.

**Pourquoi c'est le bon point de départ.** Ils donnent une première suite verte
en une journée, ce qui permet de brancher la CI ([6.5](#65--job-test-backend))
tout de suite, au lieu d'attendre la fin de la refonte backend. Une CI qui
tourne dès le début est ce qui empêche la dette de se reformer pendant la
refonte.

**Correctif — par ordre de rentabilité.**

1. [`workflow/service.py`](../backend/workflow/service.py) (255 lignes, le cœur
   métier du projet) : ordre des étapes, refus d'une étape verrouillée
   (`step_locked`), champs obligatoires manquants (`missing_fields`), charge
   utile invalide (`invalid_payload`), retour arrière via `goto_step`,
   reconstruction de l'état au premier appel. C'est la logique dont une
   régression a le plus d'impact métier — un compte rendu anatomopathologique
   validé à tort.
2. [`storage.py`](../backend/storage.py) : `candidate_object_keys` doit
   produire les emplacements **dans l'ordre documenté** (disposition
   applicative avant vestiges de l'ancien script) ; `find_object_key` avec un
   client MinIO simulé.
3. `safe_folder_name` ([1.7](#17--triple-implémentation-de-safe_folder_name)) :
   chaîne vide, espaces multiples, accents, `../`, caractères Unicode.
4. [`instanseg_client.py`](../backend/instanseg_client.py) : réponses nominales,
   timeout, erreur HTTP, corps malformé — avec `respx` ou un transport httpx
   simulé, sans réseau.

**Terminé quand.** `pytest backend/tests/unit` passe en moins de cinq secondes,
sans conteneur ni réseau, et couvre les quatre modules ci-dessus.

---

### 5.2 — Test de contrat OpenAPI

**Constat.** FastAPI génère déjà un schéma OpenAPI complet (visible sur
`/docs`), mais rien ne le surveille. Le frontend déclare ses propres types en
TypeScript ([`services/api.ts:6-29`](../frontend/src/services/api.ts#L6-L29),
[`olga/types.ts`](../frontend/src/features/workflow/olga/types.ts)), écrits à
la main et **sans aucun lien mécanique avec le backend**.

**Pourquoi c'est un problème.** Renommer un champ dans un schéma Pydantic
compile côté backend, compile côté frontend, passe toutes les revues — et casse
l'application à l'exécution. C'est la classe de bug la plus fréquente sur ce
type d'architecture, et la moins détectable par relecture.

**Correctif.** Deux niveaux, le premier suffisant pour commencer :

1. **Snapshot.** Un test qui sérialise `app.openapi()` dans
   `backend/tests/openapi.json` et échoue si le fichier versionné diffère. Le
   développeur régénère volontairement, et **le diff apparaît dans la PR** :
   toute rupture de contrat devient visible en revue au lieu d'être découverte
   en production.
2. **Génération des types.** Produire les types TypeScript depuis ce schéma
   (`openapi-typescript`) et vérifier en CI qu'ils sont à jour. Supprime par
   construction la divergence des types écrits à la main.

**Terminé quand.** Modifier un schéma Pydantic sans régénérer fait échouer la
CI, avec un diff lisible.

---

### 5.3 — Validation des schémas JSON OLGA

**Constat.** Quatre schémas de formulaire sont versionnés dans
[`features/workflow/schemas/`](../frontend/src/features/workflow/schemas/) :
`prelevement.json`, `preparation.json`, `microscopie.json`, `diagnostic.json`.
Ils sont produits par le script
[`scripts/generate-olga-schemas.ts`](../frontend/scripts/generate-olga-schemas.ts)
(`npm run olga:schemas`), consommés par
[`JsonSchemaForm.tsx`](../frontend/src/features/workflow/components/JsonSchemaForm.tsx)
et traduits par
[`olga/olgaAdapter.ts`](../frontend/src/features/workflow/olga/olgaAdapter.ts)
(219 lignes). Rien ne les valide.

**Pourquoi c'est un problème.** Ces schémas sont un **instantané d'un service
externe** que Chiron ne contrôle pas : ils servent de repli quand OLGA est
absent, ce qui est le cas sur toutes les machines de l'équipe. Un schéma
régénéré avec un type de champ qu'`olgaAdapter` ne sait pas traduire produit
un formulaire silencieusement incomplet — et c'est l'étape du compte rendu
médical. Par ailleurs, les champs obligatoires du schéma doivent correspondre
aux `missing_fields` que le backend vérifie
([`workflow/constants.py`](../backend/workflow/constants.py)) : rien ne garantit
aujourd'hui cet alignement.

**Correctif.**

1. Valider les quatre fichiers contre le méta-schéma JSON Schema (Ajv).
2. Test de l'adaptateur : pour chaque type de champ présent dans les quatre
   schémas, `olgaAdapter` produit un rendu — un type inconnu doit faire échouer
   le test, pas être ignoré.
3. **Test de cohérence inter-couches** : les champs requis des schémas JSON
   correspondent aux constantes de `workflow/constants.py`. C'est le test qui
   attrape la désynchronisation front/back sur le workflow.
4. Test de non-régression de `npm run olga:schemas` : le script ne doit pas
   produire de sortie vide ni perdre de champ.

**Terminé quand.** Les quatre schémas sont validés en CI, et une divergence
entre champs requis côté front et côté back fait échouer le build.

---

### 5.4 — Tests de migration Alembic

**Constat.** Une seule révision existe
([`719b309ce4d3_schema_initial.py`](../backend/alembic/versions/)), et les
migrations sont exécutées **au démarrage de l'application**
([1.3](#13--sortir-les-migrations-du-démarrage-de-lapplication)). Rien ne les
teste.

**Pourquoi c'est un problème.** C'est le test le plus critique du projet :
une migration fautive ne se manifeste qu'au déploiement, sur la base réelle,
au pire moment. Le mécanisme actuel aggrave le cas puisqu'il avale l'échec.
Et [1.12](#112--modèle-de-données) prévoit plusieurs migrations de conversion
de données (dates en chaîne vers `Date`), exactement le type d'opération qui
peut corrompre silencieusement des données de production.

**Correctif.** Sur un PostgreSQL éphémère (service container en CI) :

1. `alembic upgrade head` sur une base vide — la migration s'applique ;
2. `alembic downgrade base` puis `upgrade head` — l'aller-retour fonctionne,
   ce qui garantit qu'un rollback est possible
   ([7.9](#79--procédure-de-rollback)) ;
3. **`alembic check`** — l'autogénération ne produit aucun diff, donc les
   modèles SQLAlchemy et le schéma migré sont bien synchronisés. C'est ce test
   qui attrape le classique « j'ai ajouté une colonne au modèle en oubliant la
   migration » ;
4. pour toute migration de données : insérer un jeu représentatif avant
   l'`upgrade` et vérifier après la conversion.

**Terminé quand.** Les quatre contrôles tournent en CI à chaque PR touchant
`models.py` ou `alembic/`.

---

### 5.5 — Tests d'intégration de l'API

**Constat.** Aucune route n'est testée. Le seul moyen actuel de vérifier une
modification est de lancer la stack complète et de cliquer.

**Pourquoi c'est un problème.** Les règles métier les plus importantes ne sont
écrites nulle part ailleurs que dans le code des routes : une lame unique par
dossier ([main.py:173-181](../backend/main.py#L173-L181)), les extensions
acceptées, les suppressions en cascade, le refus de créer un patient depuis
`/extract-roi` (une régression explicitement corrigée, décrite en commentaire
lignes [706-718](../backend/main.py#L706-L718)). Rien n'empêche quelqu'un de
les réintroduire.

**Correctif.** Avec `httpx.AsyncClient` sur l'application construite par
`create_app()` ([1.2](#12--app-factory-et-lifespan--verrou-n1)), PostgreSQL en
service container, MinIO et InstanSeg remplacés par des doubles injectés.
Couvrir en priorité les règles déjà corrigées une fois — ce sont celles dont on
sait qu'elles peuvent régresser :

- `POST /patients` puis seconde lame → 409 avec le message attendu ;
- upload d'une extension non autorisée → 400 ;
- `POST /extract-roi` sur un `folder_id` inconnu → 404 et **aucun patient
  fantôme créé** ;
- `DELETE /patients/{id}` → extractions, annotations et état de workflow
  supprimés, études Orthanc conservées (le contrat annoncé par
  `DeletePatientReport`) ;
- `/health` en état dégradé quand une dépendance est absente.

**Terminé quand.** Les cinq scénarios passent en CI, sans MinIO ni InstanSeg
réels.

---

### 5.6 — Tests frontend et typecheck

**Constat.** Aucun outil de test n'est installé. `tsc -b` n'est exécuté que
comme effet de bord de `npm run build`
([`package.json:8`](../frontend/package.json#L8)).

**Pourquoi c'est un problème.** Le typecheck est noyé dans le build : quand
celui-ci échoue, il faut lire la sortie pour savoir s'il s'agit d'une erreur de
type ou d'un problème de bundling. Et surtout, aucune logique frontend n'est
vérifiée — `olgaAdapter` (219 lignes de traduction de schémas) et `useWorkflow`
(165 lignes de machine à états) sont du code non trivial, entièrement non
testé.

**Correctif.**

1. **`tsc -b --noEmit` comme job séparé** ([6.4](#64--job-typecheck)) : le
   contrôle le plus rentable du frontend, et il est déjà configuré
   strictement ([`tsconfig.app.json`](../frontend/tsconfig.app.json) active
   `strict`, `noUnusedLocals`, `noUnusedParameters`).
2. Vitest + `@testing-library/react` sur, par ordre de valeur :
   [`olgaAdapter.ts`](../frontend/src/features/workflow/olga/olgaAdapter.ts)
   (pur, testable immédiatement),
   [`useWorkflow.ts`](../frontend/src/features/workflow/useWorkflow.ts)
   (transitions, erreurs serveur),
   [`useOlgaForm.ts`](../frontend/src/features/workflow/useOlgaForm.ts)
   (repli quand OLGA est absent — le cas nominal sur les postes de l'équipe),
   `JsonSchemaForm` (rendu et validation par type de champ).
3. MSW pour simuler le backend, plutôt que de mocker axios.

**Terminé quand.** `npm run typecheck` et `npm run test` existent et passent
en CI.

---

### 5.7 — Smoke test de la stack Compose

**Constat.** Rien ne vérifie que la stack démarre. Le seul contrôle est
manuel : `docker compose up -d` puis `curl`, documenté dans
[`ACCES.md`](../ACCES.md).

**Pourquoi c'est un problème.** C'est le test qui attrape la majorité des
casses réelles de ce projet : un service qui ne démarre plus, une dépendance
manquante dans une image, une variable d'environnement renommée d'un côté
seulement, une migration qui échoue au premier `up`
([4.4](#44--depends_on-sans-condition-de-santé)). Aucun test unitaire ne les
détecte, parce qu'ils ne concernent pas le code mais son assemblage.

**Correctif.** Un job qui, sur un clone propre : construit les images, lance la
stack, attend que tous les healthchecks
([4.4](#44--depends_on-sans-condition-de-santé)) passent au vert avec un
délai maximal, puis appelle `GET /health` (en vérifiant le corps, pas seulement
le code) et `GET /extractions/workflow/steps` (qui doit renvoyer les quatre
étapes), et enfin `docker compose down -v`. En cas d'échec, publier
`docker compose logs` comme artefact — sinon le diagnostic est impossible.

**Terminé quand.** Le job tourne à chaque PR et échoue si un service ne devient
pas sain en moins de trois minutes.

---

### 5.8 — Tests de bout en bout

**Constat.** Aucun test d'interface.

**Pourquoi c'est un problème.** Les parcours critiques (ouvrir une lame,
dessiner une région, lancer l'analyse IA, remplir les quatre étapes du compte
rendu) traversent cinq services. Rien ne garantit qu'ils fonctionnent encore
après une modification.

**Correctif.** Playwright, **après** 5.1 à 5.7 : les tests de bout en bout sont
les plus coûteux à écrire et les plus fragiles, ils ne rentabilisent que si la
base est déjà couverte. Commencer par un unique parcours
(connexion → tableau de bord → ouverture d'un viewer) et ne l'étendre qu'en
réaction à des régressions réellement constatées. À faire tourner en nocturne
plutôt qu'à chaque PR, pour ne pas allonger la boucle de retour.

**Terminé quand.** Un parcours nominal est vérifié automatiquement chaque nuit.

---

### 5.9 — Seuil de couverture à cliquet

**Constat.** Aucune mesure de couverture.

**Pourquoi c'est un problème.** Sans mesure, la couverture redescend dès que la
pression baisse. Mais un objectif fixé trop haut d'emblée (80 % sur un projet à
0 %) est ignoré, puis désactivé — ce qui est pire que pas de seuil du tout.

**Correctif.** Mesurer d'abord sans seuil pendant deux semaines. Puis fixer le
seuil **au niveau atteint**, avec un cliquet : la CI échoue si la couverture
baisse, jamais parce qu'elle n'atteint pas un objectif arbitraire. Exiger en
revanche une couverture élevée sur les modules critiques
(`workflow/service.py`, `storage.py`), configurée par chemin. Publier le
rapport en commentaire de PR pour le rendre visible.

**Terminé quand.** Une PR qui baisse la couverture globale échoue, avec le
détail des lignes découvertes.

---

## 6 — Intégration continue (CI)

> **Rappel de périmètre.** La copie auditée ne contient aucun `.github/`. Ce
> qui suit décrit la cible ; chaque item est à confronter aux workflows
> réellement présents sur le dépôt distant, et à supprimer s'il existe déjà.

**Principe directeur : un job par responsabilité.** Un pipeline monolithique
qui échoue ne dit pas ce qui a cassé, et son temps de retour décourage de le
lancer. Des jobs séparés s'exécutent en parallèle, et la page de la PR indique
immédiatement la nature du problème.

**Ce qui n'est vérifié par rien aujourd'hui** — et qui devrait l'être avant
tout le reste : que le projet compile (`tsc`), qu'il se construit
(`vite build`), que les images Docker se fabriquent, et que la stack démarre.
Ce sont les quatre jobs `P0` de cette section.

### 6.1 — Filtrage par chemin

**Quoi.** `dorny/paths-filter` en job préliminaire, produisant des sorties
`backend`, `frontend`, `instanseg`, `docker`, `docs`, consommées en `if:` par
les jobs suivants.

**Pourquoi.** Une PR qui ne touche qu'à `docs/` n'a aucune raison de
reconstruire trois images Docker. Sans filtrage, le pipeline complet dure
plusieurs minutes sur chaque PR, et l'équipe prend l'habitude de ne plus
regarder son résultat.

**Attention.** Filtrer correctement, sinon on n'exécute pas les tests qu'il
fallait. Les fichiers transverses (`compose.yml`, `.github/**`,
`pyproject.toml`) doivent déclencher **tout**.

**Terminé quand.** Une PR ne touchant que `docs/` n'exécute que les jobs de
documentation.

---

### 6.2 — Job `lint-backend`

**Quoi.** `ruff check`, `black --check`, `mypy` sur `backend/` et `instanseg/`.

**Pourquoi.** Dépend de [1.14](#114--outillage-python-absent). `ruff` avec la
règle `T20` fait par ailleurs respecter automatiquement
[1.9](#19--journalisation) : plus aucun `print` ne peut réapparaître.

**Progressivité.** `mypy` sur un code non annoté produit des centaines
d'erreurs. Démarrer en mode permissif sur l'ensemble, et en mode strict sur les
modules propres (`workflow/`, `storage.py`), en élargissant le périmètre
strict au fil de la refonte. Un linter qui hurle est un linter qu'on désactive.

**Terminé quand.** Le job passe au vert et interdit toute régression de style.

---

### 6.3 — Job `lint-frontend`

**Quoi.** `npm ci`, `npm run lint`, `npx prettier --check .`.

**Pourquoi.** Voir [2.6](#26--eslint-sous-configuré-et-jamais-exécuté) : le
linter existe mais n'est exécuté par rien. Le formateur est ce qui rend les
diffs de PR lisibles, donc les revues utiles — c'est un prérequis de la
[section 8](#8--process-de-pr-et-règles-de-dépôt).

**Terminé quand.** Le job passe, avec le cache npm activé.

---

### 6.4 — Job `typecheck`

**Quoi.** `npm ci && npx tsc -b --noEmit`.

**Pourquoi.** Le contrôle le plus rentable du frontend : la configuration
TypeScript est déjà stricte
([`tsconfig.app.json`](../frontend/tsconfig.app.json)), elle n'est simplement
jamais exécutée de façon isolée. En job séparé, un échec de typage est
identifiable en un coup d'œil, sans démêler la sortie du bundler.

**Terminé quand.** Une erreur de type fait échouer un job nommé `typecheck`, et
non `build`.

---

### 6.5 — Job `test-backend`

**Quoi.** `pytest` avec couverture, PostgreSQL en `services:`, rapport publié.

**Pourquoi.** Porte les sections [5.1](#51--tests-unitaires-backend--commencer-ici),
[5.4](#54--tests-de-migration-alembic) et [5.5](#55--tests-dintégration-de-lapi).
Découper en deux étapes — `unit` (rapide, sans service) puis `integration`
(avec PostgreSQL) — pour que l'échec le plus fréquent remonte le plus vite.

**Attention.** Pas de MinIO ni d'InstanSeg en service : ce sont des doubles
injectés ([1.2](#12--app-factory-et-lifespan--verrou-n1)). Monter une stack
complète pour des tests d'intégration les rend lents et intermittents ; c'est
le rôle du smoke test ([6.10](#610--job-compose-smoke)).

**Terminé quand.** Le job tourne en moins de trois minutes et publie sa
couverture.

---

### 6.6 — Job `test-frontend`

**Quoi.** `npx vitest run --coverage`.

**Pourquoi.** Porte [5.6](#56--tests-frontend-et-typecheck).

**Terminé quand.** Le job passe et publie sa couverture.

---

### 6.7 — Job `schema`

**Quoi.** Trois contrôles de contrat réunis : diff du snapshot OpenAPI
([5.2](#52--test-de-contrat-openapi)), `alembic check`
([5.4](#54--tests-de-migration-alembic)), validation des schémas JSON OLGA et
cohérence des champs requis front/back ([5.3](#53--validation-des-schémas-json-olga)).

**Pourquoi.** Ces trois vérifications partagent la même nature — détecter une
**désynchronisation entre deux couches** — et le même mode d'échec : tout
compile de chaque côté, et l'application casse à l'exécution. Les regrouper
sous un nom explicite rend le message clair en revue : « le contrat a changé,
est-ce voulu ? »

**Terminé quand.** Modifier un schéma Pydantic, un modèle SQLAlchemy ou un
schéma OLGA sans mettre à jour sa contrepartie fait échouer le job.

---

### 6.8 — Job `build-frontend`

**Quoi.** `npm ci && npm run build`, `dist/` publié en artefact.

**Pourquoi.** **Rien ne garantit aujourd'hui que le frontend se construit.**
Le build n'est exécuté ni en CI ni au démarrage du conteneur, puisque celui-ci
lance `npm run dev` ([2.8](#28--aucune-image-frontend-de-production--verrou-n2)).
Une erreur qui ne se manifeste qu'au build (import circulaire, dépendance
absente en production, variable d'environnement manquante) reste donc
indétectée jusqu'au jour du déploiement.

**Terminé quand.** Le job passe, et l'artefact `dist/` est téléchargeable
depuis la page du run.

---

### 6.9 — Job `docker-build`

**Quoi.** `docker/build-push-action` en matrice sur les trois images, avec
buildx, cache GitHub Actions (`cache-from`/`cache-to: type=gha`), et
`push: false` sur les PR.

**Pourquoi.** Prouve que les trois images se construisent, **sans rien
publier**. Sur une PR, on veut la preuve, pas l'artefact. C'est aussi le job
qui détectera les régressions de
[4.8](#48--dépendances-instanseg-non-épinglées) tant que les versions ne sont
pas épinglées.

**Attention.** L'image InstanSeg installe PyTorch : sans cache, le job dure
très longtemps. Le cache buildx est indispensable, et il faut surveiller le
quota de stockage des artefacts de cache.

**Terminé quand.** Les trois images se construisent à chaque PR touchant leur
répertoire, en moins de cinq minutes avec cache chaud.

---

### 6.10 — Job `compose-smoke`

**Quoi.** L'automatisation de [5.7](#57--smoke-test-de-la-stack-compose) :
`docker compose up -d`, attente des healthchecks, appels de vérification,
`docker compose logs` publié en artefact en cas d'échec, puis
`docker compose down -v`.

**Pourquoi.** C'est le job qui vérifie l'**assemblage**, ce qu'aucun test
unitaire ne fait. Sur un projet à sept conteneurs, c'est là que se produisent
la plupart des casses.

**Attention.** Tourne sur un clone propre, donc sans les images de
démonstration ([3.3](#33--les-données-du-seeder-sont-ignorées-par-git)) : le
smoke test ne doit pas dépendre de leur présence, ou bien 3.3 doit être traité
d'abord.

**Terminé quand.** Le job est vert de façon stable sur dix exécutions
consécutives — un smoke test intermittent est pire qu'aucun smoke test.

---

### 6.11 — Job `security`

**Quoi.** Cinq contrôles, échouant sur les vulnérabilités hautes et critiques :

| Outil | Cible |
|---|---|
| `pip-audit` | dépendances Python (backend et InstanSeg) |
| `npm audit --omit=dev` | dépendances npm de production |
| `trivy image` | les trois images construites en [6.9](#69--job-docker-build) |
| `gitleaks` | secrets dans le dépôt et l'historique |
| `hadolint` | les trois Dockerfiles ([4.9](#49--durcissement-des-dockerfiles)) |

**Pourquoi.** L'application manipule des données de santé et embarque une
surface importante : PyTorch, PyVips, un PACS, plus de 250 paquets npm
transitifs. `gitleaks` est le plus urgent des cinq : il est le garde-fou
structurel de [4.5](#45--secrets-en-clair-dans-le-compose), le jour où
quelqu'un remplacera une valeur d'exemple par un vrai secret.

**Attention.** `trivy` sur une image PyTorch remonte beaucoup de CVE de
paquets système non exploitables ici. Prévoir un fichier d'exceptions
**commenté et daté**, sinon le job sera ignoré puis désactivé.

**Terminé quand.** Les cinq outils tournent, et un secret ajouté par erreur
fait échouer la PR.

---

### 6.12 — Réglages transverses du pipeline

**Quoi.** À appliquer à tous les workflows :

- **`concurrency`** avec `cancel-in-progress: true`, groupé par branche :
  annule les runs obsolètes quand on pousse plusieurs fois d'affilée ;
- **`permissions:` minimales** sur le `GITHUB_TOKEN`, déclarées par job
  (`contents: read` par défaut, élargi seulement là où c'est nécessaire) ;
- **actions épinglées par SHA** et non par tag mouvant — une action tierce
  compromise s'exécute avec les droits du dépôt ;
- **caches** pip et npm activés partout ;
- **`timeout-minutes`** sur chaque job, pour éviter qu'un job bloqué ne
  consomme le quota pendant six heures ;
- **Dependabot ou Renovate** sur `pip`, `npm`, `docker` et `github-actions`,
  regroupé par écosystème pour ne pas noyer l'équipe sous les PR.

**Pourquoi.** Ce sont les réglages qui font la différence entre une CI qu'on
regarde et une CI qu'on subit. Les permissions et l'épinglage relèvent de la
sécurité de la chaîne d'approvisionnement, d'autant plus que la
[section 7](#7--déploiement-continu-cd) donnera au pipeline des droits de
publication d'images.

**Terminé quand.** Aucun workflow n'utilise le `GITHUB_TOKEN` par défaut en
écriture sans le déclarer explicitement.

---

## 7 — Déploiement continu (CD)

**État actuel : il n'y a pas de CD**, et trois verrous l'en empêchent
matériellement — [2.8](#28--aucune-image-frontend-de-production--verrou-n2)
(pas d'image frontend déployable), [4.2](#42--aucun-image-sur-les-services-buildés--verrou-n3)
(pas de nom d'image) et [4.1](#41--un-seul-compose-qui-est-un-compose-de-développement)
(pas de description de stack hors développement). Ils sont à traiter avant
toute cette section.

### 7.1 — Registry d'images

**Quoi.** GitHub Container Registry :
`ghcr.io/<org>/chiron-backend`, `chiron-frontend`, `chiron-instanseg`.

**Pourquoi.** GHCR s'authentifie avec le `GITHUB_TOKEN` du workflow — aucun
secret à gérer — et hérite de la visibilité du dépôt. Pour un projet
universitaire, c'est le choix qui ajoute le moins de pièces mobiles.

**Attention.** Définir dès le départ une politique de rétention : les images
`sha-*` s'accumulent vite, surtout avec PyTorch. Conserver les tags de version
indéfiniment, purger les `sha-*` au-delà de trente jours.

**Terminé quand.** Les trois paquets existent et sont visibles sur la page du
dépôt.

---

### 7.2 — Stratégie de tags

**Quoi.** Trois tags, produits par `docker/metadata-action` :

| Tag | Posé sur | Sert à |
|---|---|---|
| `sha-<court>` | chaque build de `main` | tracer une image jusqu'à un commit |
| `main` | dernière intégration | déployer en pré-production |
| `v<semver>` | tag git `v*` | déployer en production, et rollback |

**Pourquoi.** Le tag `sha-*` est celui qui rend un incident diagnosticable : à
partir d'une image en cours d'exécution, on retrouve le commit exact. Le tag de
version est ce qui rend [7.9](#79--procédure-de-rollback) possible.

**Attention.** **Ne jamais déployer `latest` seul.** Un tag mouvant rend
impossible de savoir ce qui tourne, et un redémarrage de conteneur peut changer
de version sans que personne ne l'ait décidé.

**Terminé quand.** `docker inspect` sur une image déployée permet de retrouver
le commit correspondant.

---

### 7.3 — Job `publish`

**Quoi.** Sur `main` et sur les tags `v*` : buildx avec `push: true`,
plateformes `linux/amd64` **et** `linux/arm64`, cache partagé avec
[6.9](#69--job-docker-build).

**Pourquoi.** Le multi-arch n'est pas cosmétique ici : l'équipe développe sur
Mac Apple Silicon (arm64) et le serveur cible sera très probablement amd64. Une
image construite pour une seule architecture produit soit un échec au
déploiement, soit une émulation QEMU aux performances désastreuses sur une
charge PyVips et PyTorch.

**Attention.** Le build arm64 de l'image InstanSeg est long. Envisager de le
restreindre aux tags de version, l'amd64 seul suffisant sur `main`.

**Terminé quand.** `docker manifest inspect` montre les deux architectures pour
chaque image publiée.

---

### 7.4 — Provenance : SBOM et signature

**Quoi.** `syft` génère un SBOM attaché à chaque image, `cosign` la signe en
mode keyless (OIDC GitHub), et la politique de déploiement vérifie la signature
avant de tirer.

**Pourquoi.** Répondre à « que contient exactement l'image qui tourne en
production ? » sans l'ouvrir — et le jour où une CVE sort sur une dépendance
transitive, savoir en quelques secondes si le projet est concerné. Sur une
application de santé, la traçabilité de la chaîne d'approvisionnement n'est pas
un luxe académique.

**Terminé quand.** Chaque image publiée porte un SBOM et une signature
vérifiable.

---

### 7.5 — Environnements et approbation manuelle

**Quoi.** Deux environnements GitHub : `staging`, déployé automatiquement à
chaque `main`, et `production`, déclenché par un tag `v*` et **soumis à une
approbation manuelle**. Les secrets de déploiement sont portés par
l'environnement, pas par le dépôt.

**Pourquoi.** L'approbation obligatoire est le mécanisme le plus simple pour
éviter qu'un `merge` de vendredi soir n'atteigne la production. Les secrets
portés par l'environnement garantissent qu'un workflow de PR issue d'un fork
ne peut pas y accéder.

**Terminé quand.** Un déploiement en production requiert le clic d'une personne
autorisée, tracé dans l'historique du dépôt.

---

### 7.6 — Mécanique de déploiement

**Quoi.** Sur le serveur cible : `compose.prod.yml`
([4.1](#41--un-seul-compose-qui-est-un-compose-de-développement)) référençant
les images du registry, et un `docker compose pull && docker compose up -d`
déclenché par le workflow — via `docker context` sur SSH (préférable) ou une
action SSH.

**Pourquoi.** C'est la façon la plus simple de déployer une stack Compose sans
introduire d'orchestrateur. Le serveur ne contient aucun code source : il tire
des images versionnées, ce qui rend son état entièrement déterminé par le tag
déployé.

**Attention.** Séquence obligatoire : **migrations
([7.7](#77--migrations-en-étape-de-déploiement-dédiée)) → déploiement → smoke
test ([7.8](#78--smoke-test-post-déploiement))**. Prévoir aussi la gestion des
volumes (`postgres_data`, `minio_data`, `orthanc_data`) : ils survivent aux
déploiements, et leur sauvegarde est une décision à prendre avant le premier
déploiement, pas après le premier incident.

**Terminé quand.** Un tag `v*` approuvé met à jour le serveur sans aucune
intervention manuelle.

---

### 7.7 — Migrations en étape de déploiement dédiée

**Quoi.** Une étape `docker run --rm <image-backend> alembic upgrade head`
exécutée **avant** la bascule des conteneurs applicatifs, faisant échouer le
déploiement en cas d'erreur.

**Pourquoi.** Contrepartie directe de
[1.3](#13--sortir-les-migrations-du-démarrage-de-lapplication) : une migration
ne doit jamais s'exécuter au démarrage d'un processus applicatif. En étape
dédiée, elle s'exécute **une fois**, son échec est visible et bloquant, et son
journal est isolé.

**Attention.** Sauvegarder la base avant la migration, et vérifier que
`alembic downgrade` a été testé ([5.4](#54--tests-de-migration-alembic)) — sans
quoi [7.9](#79--procédure-de-rollback) est un vœu pieux. Pour les migrations
non rétrocompatibles, appliquer la règle en deux temps (ajouter la nouvelle
colonne, déployer le code qui gère les deux, supprimer l'ancienne au
déploiement suivant).

**Terminé quand.** Une migration en échec interrompt le déploiement avant toute
bascule, base intacte.

---

### 7.8 — Smoke test post-déploiement

**Quoi.** Après la bascule : `GET /health` en vérifiant le **corps** de la
réponse, plus un appel métier en lecture seule
(`GET /extractions/workflow/steps`), avec quelques tentatives espacées. Échec ⇒
déclenchement de [7.9](#79--procédure-de-rollback).

**Pourquoi.** Un conteneur qui démarre n'est pas une application qui
fonctionne. `/health` existe déjà et vérifie réellement les dépendances
([main.py:466](../backend/main.py#L466)) : c'est exactement ce qu'il faut
interroger. Sans ce contrôle, la découverte d'un déploiement raté vient d'un
utilisateur.

**Terminé quand.** Un déploiement cassé est détecté par le pipeline, pas par un
utilisateur.

---

### 7.9 — Procédure de rollback

**Quoi.** Un workflow `rollback` prenant un tag de version en entrée,
redéployant cette version et exécutant le smoke test. Complété par une page de
procédure : quand l'utiliser, qui décide, quoi faire si la base a été migrée.

**Pourquoi.** Un rollback improvisé à chaud, la première fois, sous pression,
se passe mal. La question difficile n'est d'ailleurs pas le code — revenir à
une image précédente est trivial — mais le **schéma de base** : c'est pourquoi
[5.4](#54--tests-de-migration-alembic) impose de tester le `downgrade`.

**Attention.** **Répéter le rollback une fois, à froid, sur `staging`.** Une
procédure jamais exécutée n'est pas une procédure.

**Terminé quand.** Un retour à la version précédente a été effectué avec succès
sur `staging` en moins de dix minutes, procédure en main.

---

### 7.10 — Versionnement et CHANGELOG

**Quoi.** Semver, `CHANGELOG.md` et release GitHub générés automatiquement
depuis les messages de commit (`release-please` ou équivalent), sur la base des
Conventional Commits ([8.5](#85--conventional-commits-et-lint-du-titre-de-pr)).

**Pourquoi.** Relie un tag d'image à une liste de changements lisible :
indispensable pour décider vers quelle version revenir pendant un incident.
Automatiser évite le CHANGELOG rédigé à la main, abandonné après trois
versions.

**Terminé quand.** Un `merge` sur `main` met à jour une PR de release, dont la
fusion pose le tag, publie les images et met à jour le CHANGELOG.

---

## 8 — Process de PR et règles de dépôt

Cette section est la moins coûteuse du backlog et celle dont l'effet est le
plus immédiat : elle empêche la dette décrite dans les sections précédentes de
se reformer pendant qu'on la résorbe.

### 8.1 — Gabarit de pull request

**Quoi.** Un `.github/pull_request_template.md` comportant : contexte et
problème résolu, périmètre du changement, captures avant/après pour toute
modification d'interface, **plan de test** (ce qui a été vérifié, comment), et
une checklist de points structurellement oubliés :

- [ ] Migration Alembic incluse ? Testée en `downgrade` ?
- [ ] Nouvelle variable d'environnement ? Ajoutée à `.env.example` et au compose ?
- [ ] Rupture de contrat d'API ? Frontend mis à jour ?
- [ ] Documentation de `docs/` impactée ?
- [ ] Aucun fichier `.bak`, aucune donnée médicale, aucun secret ajouté ?

**Pourquoi.** L'audit montre que les régressions de ce projet suivent toujours
les mêmes chemins : une configuration ajoutée au compose mais jamais lue
([1.4](#14--couche-de-configuration-unique)), un contrat d'API modifié d'un
seul côté ([5.2](#52--test-de-contrat-openapi)), un fichier de sauvegarde
commité ([3.1](#31--supprimer-les-six-fichiers-bak)). Une checklist qui
mentionne explicitement ces cas les attrape avant la revue.

**Terminé quand.** Le gabarit est en place et les PR le remplissent réellement.

---

### 8.2 — Gabarits d'issue

**Quoi.** `.github/ISSUE_TEMPLATE/` avec deux formulaires : *bug* (version ou
tag d'image déployé, étapes de reproduction, comportement attendu, journaux) et
*tâche* (contexte, critère d'acceptation).

**Pourquoi.** Le champ « tag d'image » n'a de sens qu'une fois
[7.2](#72--stratégie-de-tags) en place, mais c'est lui qui rendra les rapports
de bug exploitables — sans lui, la première question est toujours « sur quelle
version ? ».

**Terminé quand.** Les deux formulaires existent.

---

### 8.3 — `CODEOWNERS`

**Quoi.** Un `.github/CODEOWNERS` attribuant des relecteurs par zone :
`/backend/`, `/frontend/`, `/instanseg/`, `/docs/`, et les fichiers transverses
(`compose*.yml`, `.github/`) à l'ensemble de l'équipe.

**Pourquoi.** Assigne automatiquement la bonne personne, et garantit qu'une
modification d'infrastructure ne passe pas inaperçue. Sur un projet de groupe,
cela répartit aussi la connaissance au lieu de la concentrer.

**Terminé quand.** Chaque PR a un relecteur assigné automatiquement.

---

### 8.4 — Protection de la branche `main`

**Quoi.** Sur `main` : PR obligatoire (pas de push direct), au moins une
approbation, **checks requis** (`lint-backend`, `lint-frontend`, `typecheck`,
`test-backend`, `test-frontend`, `schema`, `build-frontend`, `docker-build`),
résolution des conversations avant fusion, historique linéaire, branches à
jour avant fusion.

**Pourquoi.** Sans checks requis, toute la [section 6](#6--intégration-continue-ci)
est décorative : un pipeline rouge n'empêche rien. C'est la règle qui
transforme la CI en garde-fou.

**Attention.** N'exiger que des checks **stables**. Un job intermittent
(typiquement `compose-smoke`, cf. [6.10](#610--job-compose-smoke)) bloque les
fusions pour de mauvaises raisons et pousse l'équipe à demander des dérogations,
ce qui vide la règle de son sens. Le rendre requis seulement une fois fiable.

**Terminé quand.** Un push direct sur `main` est refusé, et une PR rouge ne
peut pas être fusionnée.

---

### 8.5 — Conventional Commits et lint du titre de PR

**Quoi.** Convention `type(scope): description` (`feat`, `fix`, `refactor`,
`chore`, `docs`, `test`, `ci`), vérifiée par `commitlint` en `pre-commit` et
par une action de lint du titre de PR.

**Pourquoi.** C'est le **prérequis technique** de
[7.10](#710--versionnement-et-changelog) : la génération automatique du
CHANGELOG et le calcul de la version suivante lisent ces messages. Effet
secondaire utile : `git log` devient lisible, et un `git log --grep="^fix"`
donne l'historique des correctifs.

**Attention.** Puisque l'historique sera linéaire ([8.4](#84--protection-de-la-branche-main))
avec fusion en squash, c'est le **titre de la PR** qui devient le message de
commit — d'où l'importance de le linter, davantage encore que les commits
individuels.

**Terminé quand.** Une PR au titre non conforme ne peut pas être fusionnée.

---

### 8.6 — Étiquetage automatique

**Quoi.** `actions/labeler` posant des étiquettes selon les chemins modifiés
(`backend`, `frontend`, `docker`, `docs`, `ci`), plus une étiquette de taille.

**Pourquoi.** Confort de tri, et signal utile : une PR étiquetée « très
grosse » est une PR qui ne sera pas relue sérieusement. Rendre cette
information visible incite au découpage — ce que les sections
[1.1](#11--éclater-mainpy-en-modules-métier) et
[2.1](#21--découper-les-pages-géantes) demandent explicitement.

**Terminé quand.** Les étiquettes se posent seules.

---

### 8.7 — `pre-commit`

**Quoi.** Un `.pre-commit-config.yaml` exécutant, avant chaque commit : `ruff`,
`black`, `eslint` et `prettier` sur les fichiers modifiés, `gitleaks`,
`check-added-large-files`, `check-merge-conflict`, `end-of-file-fixer`, et un
hook refusant les fichiers `*.bak`.

**Pourquoi.** C'est le mécanisme qui rend **structurellement impossible** la
réapparition de plusieurs problèmes de la [section 3](#3--hygiène-du-dépôt) :
`check-added-large-files` bloque un `.DCM` ou un `.tif` avant le commit,
`gitleaks` bloque un secret, le hook `*.bak` bloque une sauvegarde manuelle. En
CI, ces problèmes sont détectés après coup, quand ils sont déjà dans
l'historique — un secret commité puis retiré reste compromis.

**Terminé quand.** `pre-commit install` est documenté dans `CONTRIBUTING.md` et
les mêmes hooks tournent aussi en CI (pour ceux qui ne l'installent pas).

---

### 8.8 — `CONTRIBUTING.md`

**Quoi.** Un document court et opérationnel : prérequis, démarrage local,
convention de branches et de commits, comment lancer tests et linters, comment
créer une migration Alembic, et les **règles non négociables** issues de cet
audit :

- toute opération PyVips ou MinIO passe par `run_in_threadpool`
  ([1.8](#18--routes-synchrones-qui-bloquent-la-boucle-dévénements)) ;
- toute configuration passe par `config.py`, jamais par `os.getenv` dispersé
  ([1.4](#14--couche-de-configuration-unique)) ;
- le nouveau code va dans un module de domaine, jamais dans `main.py`
  ([1.1](#11--éclater-mainpy-en-modules-métier)) ;
- aucune image médicale réelle dans le dépôt
  ([3.3](#33--les-données-du-seeder-sont-ignorées-par-git)) ;
- aucun secret, même « de développement », en dur dans un fichier versionné
  ([4.5](#45--secrets-en-clair-dans-le-compose)).

**Pourquoi.** Le `README.md` racine énonce déjà une partie de ces règles (« le
nouveau code va dans les modules dédiés »), mais noyée dans un document de
21 Ko que personne ne relit avant de contribuer. Un `CONTRIBUTING.md` court est
lu ; il est aussi la référence à citer en revue, ce qui dépersonnalise les
remarques.

**Terminé quand.** Un nouvel arrivant démarre le projet et ouvre une PR
conforme en suivant ce seul document.

---

## 9 — Sécurité (corrections)

> Ces items corrigent des défauts de l'existant. Ils ne sont pas des
> fonctionnalités nouvelles — sauf [9.2](#92--aucune-authentification-sur-lapi)
> et [9.7](#97--aucun-journal-daudit), qui supposent de construire un
> mécanisme absent, et sont signalés comme tels.
>
> L'état réel est déjà documenté sans détour dans
> [`ACCES.md`](../ACCES.md), [`docs/README.md`](README.md#avertissement-de-sécurité-état-réel-pas-objectif)
> et [09 — Pièges, dettes et bugs](09-pieges-et-bugs.md). Cette section ne
> découvre donc rien : elle transforme des constats en tâches.

### 9.1 — CORS ouvert avec credentials

**Constat.** [main.py:56-61](../backend/main.py#L56-L61) :

```python
allow_origins=["*"],
allow_credentials=True,
allow_methods=["*"],
allow_headers=["*"],
```

**Pourquoi c'est un problème.** La combinaison `allow_origins=["*"]` +
`allow_credentials=True` est explicitement invalide selon la spécification
CORS : les navigateurs la rejettent, et Starlette la contourne en renvoyant
l'origine de l'appelant — ce qui revient à **autoriser toutes les origines à
envoyer des requêtes authentifiées**. Aujourd'hui l'impact est limité puisqu'il
n'y a aucune authentification, mais le jour où
[9.2](#92--aucune-authentification-sur-lapi) sera fait, cette ligne
transformera n'importe quel site visité par un médecin en client de l'API.

**Correctif.** Liste d'origines explicite, venant de la configuration
([1.4](#14--couche-de-configuration-unique)) : l'URL du frontend en
développement, celle du domaine déployé en production. Restreindre également
les méthodes aux verbes réellement utilisés.

**Coût.** Quelques lignes. À faire tout de suite.

**Terminé quand.** Une requête depuis une origine non déclarée est refusée par
le navigateur.

---

### 9.2 — Aucune authentification sur l'API

**Constat.** Aucune route backend ne vérifie d'identité. Côté frontend,
[`App.tsx:9`](../frontend/src/App.tsx#L9) pose `isAuthenticated = true`, et
[`Login.tsx`](../frontend/src/pages/Login.tsx) n'exploite jamais le champ mot
de passe : le nom saisi part dans `localStorage` sous la clé `biopsie_user`, et
sert uniquement à signer les annotations
(colonnes `owner` et `pathologist` de [`models.py`](../backend/models.py)).

**Pourquoi c'est un problème.** Toute personne ayant accès au réseau peut lire,
téléverser et **supprimer** n'importe quel dossier patient, en une requête HTTP.
C'est le défaut structurel principal du projet, et il conditionne la sécurité
de tout le reste : le journal d'audit de [9.7](#97--aucun-journal-daudit) n'a
aucune valeur sans identité vérifiée, et les restrictions CORS de
[9.1](#91--cors-ouvert-avec-credentials) ne protègent rien tant qu'il n'y a
rien à protéger.

**Correctif.** C'est un chantier à part entière, à cadrer avec l'encadrant :
authentification côté backend (jetons signés à durée limitée, mots de passe
hachés), dépendance FastAPI appliquée à toutes les routes de données,
propagation du jeton par l'intercepteur de `lib/http.ts`
([2.2](#22--trois-clients-http-concurrents)), et remplacement du garde factice
de [2.5](#25--gardes-de-route-factices).

**À faire immédiatement, en attendant** : conserver et rendre plus visible
l'avertissement « aucune donnée de patient réelle », et retirer la fausse
allégation de certification ([9.3](#93--allégation-de-certification-hds-fausse)).

**Terminé quand.** Aucune route de données n'est accessible sans jeton valide.

---

### 9.3 — Allégation de certification HDS fausse

**Constat.** [`Login.tsx:52`](../frontend/src/pages/Login.tsx#L52) affiche sous
le formulaire :

> Système certifié HDS (Hébergeur Données Santé) v2.4

Sur une page dont le champ mot de passe n'est même pas lu.

**Pourquoi c'est un problème.** La certification HDS est un agrément
réglementaire délivré par un organisme accrédité, encadré par le code de la
santé publique. L'afficher sans l'avoir est une allégation fausse, sur une
application qui n'a aucune authentification — c'est-à-dire l'exact opposé de ce
qu'elle affirme. Pour un livrable de SAÉ présenté à un jury ou à un
commanditaire, c'est un problème de crédibilité avant d'être un problème
juridique.

**Correctif.** Supprimer la ligne. La remplacer, le cas échéant, par un
avertissement honnête : « Environnement de démonstration — ne pas déposer de
données de patients réelles », ce que la documentation dit déjà partout
ailleurs.

**Coût.** Une ligne. Aucune raison d'attendre.

**Terminé quand.** Aucune allégation de conformité non détenue n'apparaît dans
l'interface.

> ✅ **Fait** (refonte graphique). La ligne a été supprimée de
> [`Login.tsx`](../frontend/src/pages/Login.tsx) et remplacée par
> « Environnement de démonstration. Ne déposez aucune donnée de patient réel. »,
> exactement la formulation recommandée ci-dessus.

---

### 9.4 — Traversée de chemin sur les chemins issus de la base

**Constat.** Les colonnes `image_url` et `dzi_url` sont concaténées à des
chemins du système de fichiers, notamment dans
[`_supprimer_tuiles`](../backend/main.py#L1085) (appelée par
`DELETE /biopsies/{id}`, [main.py:1130](../backend/main.py#L1130)) et
[`download_biopsy_source`](../backend/main.py#L499). `safe_folder_name`
assainit bien le `folder_id`, mais **pas** ces deux colonnes, dont la valeur
vient d'un nom de fichier téléversé par l'utilisateur au moment de l'import.

**Pourquoi c'est un problème.** Le chemin de suppression est le plus sensible :
une valeur contenant des séquences de remontée pourrait faire porter la
suppression hors de `dzi_data/`. La surface est réduite (il faut passer par
l'upload, dont l'extension est contrôlée), mais la conséquence — une
suppression récursive hors du répertoire prévu — est grave, et la protection
est triviale.

**Correctif.** Une fonction unique de résolution confinée, utilisée par tout
code construisant un chemin depuis une donnée en base :

```python
def chemin_confine(racine: Path, relatif: str) -> Path:
    cible = (racine / relatif).resolve()
    if not cible.is_relative_to(racine.resolve()):
        raise ValueError(f"Chemin hors du répertoire autorisé : {relatif}")
    return cible
```

Assainir également `image_url` à l'écriture, au moment de l'upload. Couvrir par
des tests unitaires ([5.1](#51--tests-unitaires-backend--commencer-ici)) avec
des valeurs de remontée explicites.

**Terminé quand.** Aucune concaténation de chemin ne se fait sans passer par
cette fonction, et les tests de traversée passent.

---

### 9.5 — Uploads sans limite de taille ni validation de contenu

**Constat.** `upload_biopsy` ([main.py:161](../backend/main.py#L161)) et
`upload_radiology` ([main.py:247](../backend/main.py#L247)) lisent le corps de
la requête par blocs de 8 Mo dans un fichier temporaire, **sans borne
supérieure**. La seule validation est celle de l'extension du nom de fichier
([main.py:183-185](../backend/main.py#L183-L185)).

**Pourquoi c'est un problème.** Sans authentification
([9.2](#92--aucune-authentification-sur-lapi)), n'importe qui peut remplir le
disque du serveur, ce qui fait tomber PostgreSQL et MinIO avec l'application.
Et un fichier renommé en `.tif` mais contenant tout autre chose est transmis
tel quel à PyVips, dont la surface d'attaque (une bibliothèque C de décodage
d'images) est justement celle qu'on préfère ne pas exposer à du contenu
arbitraire.

**Correctif.** Une taille maximale configurable, vérifiée pendant la lecture
par blocs — pas seulement via l'en-tête `Content-Length`, qui est déclaratif —
avec abandon et nettoyage du temporaire au dépassement. Vérifier le **type réel**
du fichier (nombre magique) avant de le confier à PyVips, et pour la
radiologie, valider le préambule DICOM. Documenter la limite dans la réponse
d'erreur pour que l'interface puisse l'afficher.

**Terminé quand.** Un fichier trop volumineux est refusé avec une 413, sans
avoir été écrit intégralement sur le disque.

---

### 9.6 — Fuite d'informations dans les messages d'erreur

**Constat.** Motif répété, par exemple [main.py:240](../backend/main.py#L240) :

```python
raise HTTPException(status_code=500, detail=f"Échec de l'upload de biopsie : {error}")
```

**Pourquoi c'est un problème.** Le texte de l'exception peut contenir des
chemins internes, des noms d'hôtes de services, des fragments de requête SQL ou
des identifiants de bucket — autant d'informations de reconnaissance offertes
à l'appelant. Sur une API sans authentification, elles sont offertes à tout le
monde.

**Correctif.** Découle directement de
[1.10](#110--gestion-derreurs-homogène) : le client reçoit un code métier et un
message générique, la trace complète part dans les journaux structurés
([1.9](#19--journalisation)) avec le `request_id` permettant de la retrouver.
Les erreurs de validation (400, 409, 422) restent explicites : ce sont des
informations métier, pas des internes.

**Terminé quand.** Aucune réponse 500 ne contient de texte d'exception.

---

### 9.7 — Aucun journal d'audit

**Constat.** Rien n'enregistre qui consulte ou modifie un dossier. Les colonnes
`owner`, `pathologist` et `validated_by` existent
([`models.py`](../backend/models.py), [`workflow/schemas.py`](../backend/workflow/schemas.py))
mais ne consignent qu'un nom déclaré, non vérifié
([9.2](#92--aucune-authentification-sur-lapi)), et seulement sur l'objet
modifié — pas les consultations, pas les suppressions, pas l'historique.

**Pourquoi c'est un problème.** La traçabilité des accès aux données de santé
est une exigence réglementaire, pas une fonctionnalité de confort : il faut
pouvoir répondre à « qui a consulté ce dossier, et quand ». C'est aussi ce qui
manque le jour où une suppression accidentelle doit être expliquée —
`DELETE /patients/{id}` efface aujourd'hui les extractions, les annotations et
les tuiles **sans laisser de trace**.

**Correctif.** Une table d'audit en ajout seul (horodatage, sujet, action,
ressource, résultat), alimentée par une dépendance FastAPI appliquée aux routes
de données. Utile même sans authentification (l'adresse d'origine et l'identité
déclarée valent mieux que rien), mais ne prend tout son sens qu'après
[9.2](#92--aucune-authentification-sur-lapi). Prévoir la durée de conservation
et l'interdiction de modification a posteriori.

**Terminé quand.** Toute lecture ou modification de donnée patient laisse une
ligne d'audit immuable.

---

### 9.8 — Authentification Orthanc portée par le serveur de développement

**Constat.** [`vite.config.ts:25`](../frontend/vite.config.ts#L25) : le proxy
du serveur de développement Vite injecte les identifiants Orthanc dans un
en-tête `Authorization`. Le commentaire du fichier et
[`ACCES.md`](../ACCES.md) l'assument comme un dispositif de développement
uniquement.

**Pourquoi c'est un problème.** Ce proxy **n'existe pas** dans une image de
production ([2.8](#28--aucune-image-frontend-de-production--verrou-n2)) : dès
le premier déploiement, tous les appels au PACS cesseront de fonctionner. Ce
n'est donc pas seulement un problème de sécurité mais une régression
fonctionnelle garantie, à traiter en même temps que la construction de l'image
frontend. Par ailleurs, faire porter des identifiants par la configuration du
frontend les expose à quiconque lit le dépôt.

**Correctif.** Faire transiter les requêtes Orthanc **par le backend**, via le
client de [1.5](#15--extraire-un-client-orthanc) : le frontend appelle une
route Chiron, le backend parle au PACS avec des identifiants issus de sa
configuration, jamais exposés au navigateur. Solution intermédiaire acceptable :
un reverse proxy devant la stack. Retirer dans tous les cas les identifiants
par défaut de `vite.config.ts`.

**Terminé quand.** Le viewer de radiologie fonctionne depuis l'image de
production, sans que le navigateur ne voie jamais d'identifiant Orthanc.

---

## 10 — Plan d'exécution

### Les trois verrous

Trois items bloquent mécaniquement tout le reste. Tant qu'ils ne sont pas
levés, les sections correspondantes ne peuvent pas avancer, quels que soient
les efforts investis ailleurs.

| Verrou | Ce qu'il bloque | Pourquoi |
|---|---|---|
| [1.2](#12--app-factory-et-lifespan--verrou-n1) — app factory | Toute la [section 5](#5--tests) | Importer `main.py` exige PostgreSQL, MinIO et `/app` : aucun test n'est possible |
| [2.8](#28--aucune-image-frontend-de-production--verrou-n2) — image frontend | Toute la [section 7](#7--déploiement-continu-cd) | Le conteneur lance `npm run dev` : il n'existe rien à déployer |
| [4.2](#42--aucun-image-sur-les-services-buildés--verrou-n3) — nom d'image | Toute la [section 7](#7--déploiement-continu-cd) | Sans tag, rien à pousser, rien à tirer, rien à rollbacker |

### Jalons

**Jalon 1 — Rendre le projet testable et mesurable** *(≈ 1 semaine)*

[1.2](#12--app-factory-et-lifespan--verrou-n1) ·
[1.14](#114--outillage-python-absent) ·
[3.1](#31--supprimer-les-six-fichiers-bak) ·
[3.7](#37--pas-de-envexample) ·
[9.1](#91--cors-ouvert-avec-credentials) ·
[9.3](#93--allégation-de-certification-hds-fausse)

Les deux derniers coûtent quelques lignes et corrigent l'allégation fausse la
plus visible : à faire le premier jour. Le reste lève le verrou n°1.

**Jalon 2 — Une CI qui dit la vérité** *(≈ 1 semaine)*

[6.4](#64--job-typecheck) ·
[6.8](#68--job-build-frontend) ·
[6.9](#69--job-docker-build) ·
[6.2](#62--job-lint-backend) ·
[6.3](#63--job-lint-frontend) ·
[6.12](#612--réglages-transverses-du-pipeline) ·
[2.6](#26--eslint-sous-configuré-et-jamais-exécuté) ·
[2.7](#27--npm-install-au-lieu-de-npm-ci)

Objectif : savoir, à chaque PR, si le projet compile, se construit et
s'image. **Aujourd'hui personne ne le sait.**

**Jalon 3 — Premiers tests et garde-fous de process** *(≈ 2 semaines)*

[5.1](#51--tests-unitaires-backend--commencer-ici) ·
[5.4](#54--tests-de-migration-alembic) ·
[5.7](#57--smoke-test-de-la-stack-compose) ·
[6.5](#65--job-test-backend) ·
[6.10](#610--job-compose-smoke) ·
[8.1](#81--gabarit-de-pull-request) ·
[8.4](#84--protection-de-la-branche-main) ·
[8.7](#87--pre-commit) ·
[8.8](#88--contributingmd) ·
[4.4](#44--depends_on-sans-condition-de-santé) ·
[1.3](#13--sortir-les-migrations-du-démarrage-de-lapplication)

Les items de la [section 8](#8--process-de-pr-et-règles-de-dépôt) coûtent peu
et doivent arriver **avant** la grosse refonte : c'est ce qui empêche la dette
de se reformer pendant qu'on la résorbe.

**Jalon 4 — Refonte backend** *(≈ 3 semaines, une PR par domaine)*

[1.4](#14--couche-de-configuration-unique) ·
[1.1](#11--éclater-mainpy-en-modules-métier) ·
[1.7](#17--triple-implémentation-de-safe_folder_name) ·
[1.5](#15--extraire-un-client-orthanc) ·
[1.6](#16--url-absolue-en-dur-dans-une-réponse-dapi) ·
[1.8](#18--routes-synchrones-qui-bloquent-la-boucle-dévénements) ·
[1.9](#19--journalisation) ·
[1.10](#110--gestion-derreurs-homogène) ·
[1.11](#111--apis-dépréciées-pydantic-v2-fastapi) ·
[5.2](#52--test-de-contrat-openapi) ·
[5.5](#55--tests-dintégration-de-lapi) ·
[6.7](#67--job-schema) ·
[9.4](#94--traversée-de-chemin-sur-les-chemins-issus-de-la-base) ·
[9.6](#96--fuite-dinformations-dans-les-messages-derreur)

Commencer par [1.4](#14--couche-de-configuration-unique) : la configuration est
touchée par tous les autres items, autant la stabiliser en premier.

**Jalon 5 — Rendre le déploiement possible** *(≈ 2 semaines)*

[2.8](#28--aucune-image-frontend-de-production--verrou-n2) ·
[4.1](#41--un-seul-compose-qui-est-un-compose-de-développement) ·
[4.2](#42--aucun-image-sur-les-services-buildés--verrou-n3) ·
[4.3](#43--container_name-figé-sur-tous-les-services) ·
[4.5](#45--secrets-en-clair-dans-le-compose) ·
[4.6](#46--ports-dinfrastructure-publiés-sur-lhôte) ·
[4.8](#48--dépendances-instanseg-non-épinglées) ·
[7.1](#71--registry-dimages) ·
[7.2](#72--stratégie-de-tags) ·
[7.3](#73--job-publish) ·
[7.7](#77--migrations-en-étape-de-déploiement-dédiée) ·
[9.8](#98--authentification-orthanc-portée-par-le-serveur-de-développement)

**Jalon 6 — Déploiement continu complet** *(≈ 2 semaines)*

[7.5](#75--environnements-et-approbation-manuelle) ·
[7.6](#76--mécanique-de-déploiement) ·
[7.8](#78--smoke-test-post-déploiement) ·
[7.9](#79--procédure-de-rollback) ·
[7.10](#710--versionnement-et-changelog) ·
[6.11](#611--job-security) ·
[4.9](#49--durcissement-des-dockerfiles)

**Jalon 7 — Découpe frontend et finitions** *(en continu)*

[2.1](#21--découper-les-pages-géantes) ·
[2.2](#22--trois-clients-http-concurrents) ·
[2.3](#23--urls-en-dur-hors-des-clients) ·
[2.4](#24--erreurs-avalées-dans-la-couche-api) ·
[5.6](#56--tests-frontend-et-typecheck) ·
[6.6](#66--job-test-frontend) ·
[1.12](#112--modèle-de-données) ·
[1.15](#115--versions-de-python-divergentes) ·
[3.2](#32--fichiers-déditeur-versionnés) à
[3.6](#36--fichiers-de-gouvernance-manquants)

**Hors jalons — à cadrer séparément**

[9.2](#92--aucune-authentification-sur-lapi) et
[9.7](#97--aucun-journal-daudit) sont des chantiers à part entière, à décider
avec l'encadrant : ils construisent un mécanisme absent plutôt que de corriger
l'existant, et leur dimensionnement dépend des attentes du projet.
[5.8](#58--tests-de-bout-en-bout) n'a de sens qu'une fois le reste stabilisé.

### Règle de découpage

Aucun item de la [section 1](#1--architecture-backend) ni de la
[section 2](#2--architecture-frontend) ne doit être livré en une seule grosse
PR. `main.py` fait 1 166 lignes et `Viewer.tsx` 1 749 : une refonte
« big-bang » sur ces fichiers est irrelisable, donc non revue, donc plus
risquée que la dette qu'elle corrige. **Un domaine ou un hook par PR**, chaque
PR restant déployable.

---

## 11 - Évolutions fonctionnelles

> **Nature de cette section.** Contrairement aux sections 1 à 10, les items qui
> suivent **ajoutent des fonctionnalités**. Ils viennent de l'équipe projet, pas
> de l'audit. Le gabarit change en conséquence : il n'y a pas de « constat »
> d'un défaut, mais un besoin, l'état réel de l'existant sur lequel il se
> greffe, et ce qu'il faut construire.
>
> Les chiffrages sont donnés hors dépendances : un item marqué `M` dont le
> prérequis est `L` coûte `L + M`.

### 11.1 - Entraîner un modèle de détection de zones problématiques

**Besoin.** Signaler au pathologiste les zones suspectes d'une lame, avec une
probabilité associée, plutôt que de lui laisser balayer toute la lame.

**Ce qui existe aujourd'hui, et ce que ce n'est pas.** Le micro-service
[`instanseg/`](../instanseg/) segmente les **noyaux cellulaires** d'un patch et
renvoie leur nombre et leurs contours. Le backend en dérive trois indicateurs
par seuils codés en dur ([main.py:622-643](../backend/main.py#L622-L643)) :
densité, aire moyenne, et un libellé de « pléomorphisme ».

C'est une **description morphométrique**, pas une classification. InstanSeg ne
produit aucune probabilité, ne connaît pas la notion de malignité, et le mot
« pléomorphisme » y est un seuil sur une aire moyenne, pas un grade
anatomopathologique. La fonctionnalité demandée suppose donc d'**entraîner un
modèle**, ce qui est un projet en soi et non un réglage de l'existant.

**Ce qu'il faut construire, dans l'ordre.**

1. **Un jeu de données annoté.** Poste dominant, et de loin : des patchs
   étiquetés par un pathologiste, en nombre suffisant, avec une répartition
   connue entre classes. Sans lui, rien de ce qui suit n'a de sens. Regarder
   d'abord les jeux publics d'histopathologie : ils évitent d'annoter à la
   main, et ils ne contiennent aucune donnée de l'établissement.
2. **Un protocole d'entraînement reproductible.** Script versionné, graine
   fixée, hyperparamètres écrits. Un modèle qu'on ne sait pas réentraîner à
   l'identique n'est pas maintenable.
3. **Une évaluation honnête** sur un jeu de test jamais vu à l'entraînement :
   sensibilité, spécificité, matrice de confusion, et le seuil de décision
   retenu. Ces chiffres sont le livrable, autant que le modèle.
4. **Un service d'inférence** au contrat stable :
   `POST /classify` → `{ label, probability, model_version }`.
5. **La traçabilité côté base.** Enregistrer avec l'extraction le score **et la
   version du modèle** qui l'a produit. Sans la version, un score relu dans six
   mois n'est pas interprétable, et une régression du modèle devient
   indétectable.
6. **L'affichage.** Surcouche sur la lame, score visible, mention explicite
   d'aide au diagnostic. Le compte rendu officiel reste écrit par le médecin.

**Le piège qui ruine ce genre de projet : la fuite entre les jeux.** Le
découpage entraînement / validation / test doit se faire **par patient**, ou au
minimum par lame, **jamais par patch**. Deux patchs voisins d'une même lame sont
quasi identiques : découpés au hasard, ils se retrouvent des deux côtés de la
frontière, le modèle reconnaît la lame au lieu d'apprendre la lésion, et les
métriques affichent 97 % pour un modèle sans aucune valeur. C'est l'erreur la
plus fréquente en apprentissage sur lames numérisées, et elle ne se voit qu'à la
mise en service.

**Où faire tourner quoi.** L'équipe ne dispose pas d'une machine capable
d'entraîner un modèle : c'est ce qui a motivé la piste d'un hébergement externe.
La question mérite d'être scindée, parce que les deux moitiés n'ont ni le même
besoin ni les mêmes conséquences.

| | Entraînement | Inférence |
|---|---|---|
| Fréquence | ponctuel, quelques campagnes | à chaque zone analysée |
| Besoin matériel | GPU, plusieurs heures | un patch de 1500×1500 au plus |
| Données traitées | le jeu annoté, potentiellement public | des lames de patients |

**Pour l'entraînement**, louer de la puissance est légitime et sans conséquence
sur les données de l'établissement si le jeu est public ou anonymisé. Avant de
payer, demander au département : un cluster universitaire est gratuit et reste
interne. Sinon, Railway, Colab ou Kaggle font le travail.

**Pour l'inférence, le projet a déjà son précédent.** InstanSeg tourne **sur
CPU** dans la pile Compose : `_get_device()` retombe sur `cpu` faute de GPU, et
le Dockerfile installe explicitement la roue PyTorch sans CUDA. Il traite déjà
des patchs plafonnés à 1500×1500 par le backend
([main.py:585](../backend/main.py#L585)). Classer un patch coûte moins cher que
d'y segmenter chaque noyau : l'inférence a donc de bonnes chances de tenir en
local, comme InstanSeg, sur les mêmes machines.

**Mesurer avant de trancher.** Chronométrer une inférence sur le poste de
développement. Si elle passe sous quelques secondes, garder le modèle dans la
pile et la question ne se pose plus. Si elle ne passe pas, héberger l'inférence
dehors devient un choix assumé, qui fait sortir des tuiles de lame de
l'établissement et doit être écrit noir sur blanc : une image de tissu reste une
donnée de santé, même sans nom de patient attaché. Tant que la plateforme ne
porte aucune donnée réelle ([9.2](#92--aucune-authentification-sur-lapi)), la
question est théorique ; elle cesse de l'être le jour d'une mise en service.

**Ce qu'un score engage.** Une probabilité affichée à un médecin sans son seuil
ni son domaine de validité est pire qu'une absence de probabilité : elle donne
une assurance que rien ne fonde. Le seuil, la sensibilité et la spécificité
mesurés au point 3 s'affichent avec le résultat, ou au moins restent accessibles
depuis lui.

**Priorité / effort.** `P2` / `L`. Le jeu de données et l'entraînement dominent
le coût ; l'intégration dans Chiron est un `M`.

**Terminé quand.** Le découpage des jeux est fait par patient ; les métriques
sont mesurées sur un jeu de test jamais vu et publiées avec le seuil retenu ; un
patch envoyé au service renvoie une classe, une probabilité et une version de
modèle ; le score et la version sont stockés avec l'extraction ; l'interface
affiche le score et la mention d'aide au diagnostic.

---

### 11.2 - Plusieurs lames et examens par dossier, et frise chronologique

**Besoin.** Suivre un patient dans le temps : biopsie initiale, contrôle à trois
mois, examen de suivi. Aujourd'hui, un dossier ne porte qu'une lame et qu'un
examen.

**Ce qui existe aujourd'hui.** La contrainte n'est **pas** dans le modèle de
données : [`models.py`](../backend/models.py) déclare déjà
`biopsies = relationship("Biopsy", ...)` et
`radiology_studies = relationship("RadiologyStudy", ...)`, donc des relations
un-à-plusieurs. Ce sont les **routes d'import** qui refusent le second élément,
par un `409` : [main.py:176](../backend/main.py#L176) pour la lame,
[main.py:259](../backend/main.py#L259) pour l'examen radiologique.

Côté interface, la limitation est recopiée en dur :
[`PatientCard.tsx`](../frontend/src/components/PatientCard.tsx) n'affiche que
`patient.biopsies[0]` et `patient.radiology_studies[0]`.

**Il manque une date sur la lame.** `RadiologyStudy` porte une colonne `date`,
mais `Biopsy` n'a que `id`, `patient_id`, `image_url` et `status`. Une frise
chronologique est impossible sans elle.

**Ce qu'il faut construire.**

1. Ajouter `Biopsy.performed_at` (date du prélèvement, distincte de la date
   d'import) et une migration Alembic. Rétro-remplir les lignes existantes avec
   une valeur nulle assumée plutôt qu'une date inventée.
2. Lever les deux `409`, en conservant un garde-fou utile : refuser le même
   fichier deux fois, pas le second examen.
3. Adapter les routes de lecture : renvoyer la collection triée par date.
4. Interface : une frise par patient, et un sélecteur de lame dans la
   visionneuse, puisque `Viewer` reçoit aujourd'hui une seule `image_url`.

**Dépendances.** Verrou de la section : [11.3](#113--comparaison-côte-à-côte-avec-zoom-synchronisé)
en dépend entièrement, [11.1](#111--entraîner-un-modèle-de-détection-de-zones-problématiques)
n'a de sens en suivi longitudinal qu'avec elle.

**Priorité / effort.** `P1` / `L`.

**Terminé quand.** Un même dossier accepte deux lames et deux examens datés, la
fiche patient affiche une frise chronologique, et la visionneuse permet de
choisir la lame ouverte.

---

### 11.3 - Comparaison côte à côte avec zoom synchronisé

**Besoin.** Afficher deux lames ou deux examens du même patient l'un à côté de
l'autre, avec un zoom et un déplacement synchronisés, pour juger de l'évolution
d'une lésion.

**Ce qui existe aujourd'hui.** [`Viewer.tsx`](../frontend/src/pages/Viewer.tsx)
instancie **une** visionneuse OpenSeadragon dans un conteneur unique
(`openseadragon-viewer`), conservée dans `viewerRef`. Même chose pour Cornerstone
dans [`RadiologyViewer.tsx`](../frontend/src/pages/RadiologyViewer.tsx).

**Ce qu'il faut construire.** Deux instances au lieu d'une, et la
synchronisation : OpenSeadragon émet `zoom` et `pan` sur son `viewport`, il
suffit de répercuter l'un sur l'autre en se gardant de la boucle infinie (un
drapeau « je suis en train de propager »). Prévoir un mode découplé, tout le
monde ne veut pas la synchronisation en permanence.

**Point de vigilance.** Deux pyramides de tuiles ouvertes en même temps, c'est
deux fois la mémoire et deux fois les requêtes de tuiles. À tester sur une lame
réelle de plusieurs gigaoctets avant de promettre la fonctionnalité.

**Dépendances.** [11.2](#112--plusieurs-lames-et-examens-par-dossier-et-frise-chronologique) :
comparer deux lames suppose que le dossier puisse en porter deux.

**Priorité / effort.** `P2` / `M`.

**Terminé quand.** Deux lames du même patient s'affichent côte à côte, le zoom
et le déplacement se propagent de l'une à l'autre, et la synchronisation se
désactive.

---

### 11.4 - Commentaires sur un dossier

**Besoin.** Qu'un second médecin donne un avis sur une extraction ou un examen
**sans modifier le compte rendu officiel**.

**Ce qui existe aujourd'hui.** Rien. Les sept tables métier
([`models.py`](../backend/models.py)) ne comportent aucune notion de discussion.
Le seul texte libre partagé est le compte rendu radiologique
(`RadiologyStudy.report`), écrasé à chaque enregistrement par le dernier
rédacteur.

**Ce qu'il faut construire.** Une table `comments` (cible, auteur, texte,
horodatage), quatre routes CRUD, et un fil dans le panneau latéral. La cible
doit pouvoir être une extraction **ou** un examen radiologique : soit deux
colonnes nullables avec une contrainte d'exclusivité, soit une table par cible.
Trancher explicitement, la première option vieillit mal.

**Dépendances.** [9.2](#92--aucune-authentification-sur-lapi) pour que l'auteur
soit fiable. Sans elle, l'auteur d'un commentaire est déclaratif, comme l'est
déjà celui d'une annotation : n'importe qui peut écrire sous n'importe quel nom.
Livrable sans, mais la valeur clinique d'un avis non authentifié est faible.

**Priorité / effort.** `P2` / `M`.

**Terminé quand.** Un médecin peut écrire, lire et supprimer ses commentaires
sur une extraction et sur un examen, sans que le compte rendu officiel change.

---

### 11.5 - Demande de second avis

**Besoin.** Marquer un dossier « en attente d'avis », l'assigner à un confrère,
et donner à chacun une liste « mes dossiers à revoir ».

**Ce qui existe aujourd'hui.** Aucune notion d'utilisateur en base, aucune
d'assignation. L'identité tient dans une clé de `localStorage`
(`biopsie_user`), relue indépendamment par plusieurs composants, et vérifiée par
aucun service.

**Ce qu'il faut construire.** Un statut d'avis et un destinataire sur
l'extraction, une vue filtrée par destinataire, et la transition d'état
correspondante.

**Dépendances.** **[9.2](#92--aucune-authentification-sur-lapi) est un
prérequis strict**, pas un confort. Assigner un dossier à un utilisateur
suppose qu'il existe une liste d'utilisateurs, ce qui n'est pas le cas. C'est
l'item de cette section dont le prérequis est le plus lourd.

**Priorité / effort.** `P2` / `M` une fois les comptes en place.

**Terminé quand.** Un dossier peut être assigné à un utilisateur existant, et
celui-ci le retrouve dans une liste dédiée.

---

### 11.6 - Recherche et filtres sur le tableau de bord

**Besoin.** Retrouver un patient par son nom, filtrer par statut ou par
pathologiste.

**Ce qui existe aujourd'hui.**
[`Dashboard.tsx`](../frontend/src/pages/Dashboard.tsx) affiche la liste brute
renvoyée par `getPatients()`, sans champ de recherche ni filtre. La route
`GET /patients` n'est par ailleurs pas paginée
([1.13](#113--get-patients-non-paginé)).

**Ce qu'il faut construire.** Deux étapes, à ne pas confondre :

- **Le gain rapide** : filtrage et recherche **côté client**, sur la liste déjà
  chargée. Un `useMemo` sur `patients`, un champ de saisie, deux sélecteurs.
  Une demi-journée, aucune modification du backend.
- **La version qui tient la charge** : recherche et filtres **côté serveur**,
  avec la pagination de [1.13](#113--get-patients-non-paginé). Indispensable dès
  quelques centaines de dossiers, inutile avant.

Commencer par le premier, en sachant qu'il sera jeté. C'est acceptable ici :
le code jeté tient en un composant.

**Attention au filtre par statut.** Le statut de biopsie écrit par le backend
est **toujours** `"Non analysé"`
([main.py:232](../backend/main.py#L232), [seed_images.py:118](../backend/seed_images.py#L118)),
alors que le tableau de bord teste `"termine"`, `"archive"` et `"Validé"`, qui
ne sont jamais écrits. Un filtre par statut construit sur ces valeurs
n'affichera jamais rien. Ce désaccord est à régler d'abord : c'est une décision
métier, pas un correctif d'affichage.

**Priorité / effort.** `P1` / `S`.

**Terminé quand.** La liste se filtre par nom saisi, et par statut à partir de
valeurs que le backend écrit réellement.

---

### 11.7 - File d'attente par priorité

**Besoin.** Marquer un dossier urgent et le faire remonter en tête de liste.

**Ce qui existe aujourd'hui.** Aucun champ de priorité. L'ordre d'affichage est
celui renvoyé par la base, sans `ORDER BY` explicite.

**Ce qu'il faut construire.** Une colonne de priorité sur le dossier, un tri
explicite, et un repère visuel dans la liste. Le liseré gauche de la carte
patient encode déjà la composition du dossier : ajouter l'urgence **à côté**,
pas à sa place, sous peine de rendre les deux illisibles. La couleur ne doit pas
porter l'information seule.

**Priorité / effort.** `P2` / `S`.

**Terminé quand.** Un dossier marqué urgent apparaît en tête de la file, et son
urgence est lisible autrement que par une couleur.

---

### 11.8 - Notifications

**Besoin.** Prévenir un médecin quand un dossier lui est assigné, ou quand un
confrère a validé une étape.

**Ce qui existe aujourd'hui.** Rien. L'interface ne se rafraîchit que sur action
de l'utilisateur.

**Ce qu'il faut construire.** Commencer par du **sondage périodique** : un appel
toutes les trente secondes sur une route « nouveautés depuis tel horodatage ».
C'est laid, et c'est suffisant pour quelques dizaines d'utilisateurs. Le
WebSocket n'a d'intérêt qu'au-delà, et il coûte une gestion de connexion, de
reconnexion et d'état partagé.

**Dépendances.** [9.2](#92--aucune-authentification-sur-lapi) pour savoir qui
notifier, [11.5](#115--demande-de-second-avis) pour avoir quelque chose à
notifier. Partage son transport avec
[11.10](#1110--visualisation-et-modification-en-temps-réel-entre-praticiens) :
si le temps réel est retenu, le WebSocket sert les deux et le sondage devient
inutile.

**Priorité / effort.** `P3` / `M`.

**Terminé quand.** Un médecin voit apparaître, sans recharger la page, qu'un
dossier lui a été assigné.

---

### 11.9 - Changement de nom : WiGo devient Chiron

**Fait.** Le produit s'appelle **Chiron.**, du nom du centaure guérisseur qui
enseigna la médecine à Asclépios. Le logotype comporte le point final.

**Ce qui a été renommé.** Toutes les occurrences visibles par l'utilisateur et
tous les commentaires : interface, titre de page, favicon, pied du compte rendu
PDF exporté, nom affiché du serveur Orthanc, `README.md`, `ACCES.md` et
l'intégralité de `docs/`. Le logo est désormais le centaure porte-étendard, en
deux variantes selon la clarté du fond
([`Logo.tsx`](../frontend/src/components/Logo.tsx)).

**Ce qui a été volontairement préservé, et pourquoi.**

- **`wigo:workflow:prelevement`** et ses trois voisins : ce sont les `$id` des
  instantanés JSON Schema et les `schemaId` du registre d'étapes
  ([`steps.ts`](../frontend/src/features/workflow/steps.ts)), qui doivent
  correspondre exactement. Espace de noms technique, jamais affiché. Le
  renommer n'apporterait rien et casserait le repli hors ligne si les deux
  côtés divergeaient d'un caractère.
- **La clé `localStorage["biopsie_user"]`** : la renommer déconnecterait tous
  les postes. À traiter avec [9.2](#92--aucune-authentification-sur-lapi), qui
  la remplacera de toute façon.
- **Le dossier du dépôt**, encore nommé `WiGo-main`. À renommer lorsque le dossier
  sera repris proprement dans le dépôt distant.

**La présentation a été reprise.** `Chiron-Presentation.pptx` ne porte plus
aucune occurrence de l'ancien nom, et sa charte suit désormais celle du poster :
fond marine en dégradé, vert du logotype en accent, titres en condensé, centaure
et signature des auteurs sur la diapositive de titre.

---

### 11.10 - Visualisation et modification en temps réel entre praticiens

**Besoin.** Que deux praticiens ouvrent le même dossier en même temps, voient
les modifications de l'autre apparaître sans recharger, et sachent qui d'autre
est présent sur le dossier.

**Ce qui existe aujourd'hui.** Rien, ni côté transport ni côté modèle d'écriture.
Aucun WebSocket, aucun SSE, aucun sondage : l'interface ne se rafraîchit que sur
action de l'utilisateur, comme le note déjà [11.8](#118--notifications).

**Le vrai obstacle n'est pas le transport, c'est la façon dont on enregistre.**
[`POST /annotations/save`](../backend/main.py#L806) écrit la totalité du
formulaire d'un coup, puis **supprime toutes les annotations de l'extraction et
les réinsère** ([main.py:841-852](../backend/main.py#L841-L852)) :

```python
db.query(models.Drawing).filter(models.Drawing.extraction_id == ext.id).delete()
for d in data.drawings:
    ...
```

C'est un « le dernier qui écrit gagne » intégral. Aujourd'hui, deux
pathologistes sur le même dossier : celui qui enregistre en second efface
silencieusement le travail du premier, y compris les annotations qu'il n'a
jamais vues. `RadiologyStudy.report` a exactement le même comportement
([11.4](#114--commentaires-sur-un-dossier)).

**Conséquence directe : brancher du temps réel sur ce modèle d'écriture ne
corrige pas la perte de données, il l'accélère.** Chacun verrait le dossier de
l'autre en direct, et l'écraserait quand même à l'enregistrement. L'ordre des
travaux n'est donc pas négociable.

**Ce qu'il faut construire, dans l'ordre.**

1. **Rendre l'écriture incrémentale.** Une annotation créée, déplacée ou
   supprimée devient une opération sur **cet objet-là**
   (`POST` / `PATCH` / `DELETE /drawings/{id}`), et non un renvoi de la
   collection entière. C'est le prérequis de tout le reste, et c'est utile
   **même sans temps réel** : il supprime la perte de données actuelle.
2. **Un garde-fou de concurrence sur le compte rendu.** Un numéro de version ou
   un `updated_at` sur l'extraction, renvoyé par le client à l'enregistrement,
   et un `409` si la version a bougé entre-temps. Mieux vaut un conflit
   affiché qu'un écrasement muet.
3. **La présence.** Qui d'autre a ce dossier ouvert, affiché en tête de panneau.
   C'est le poste le moins cher de la liste et celui qui rend le plus de
   service : savoir qu'un confrère est sur le dossier suffit le plus souvent à
   éviter la collision, sans aucune synchronisation d'état.
4. **La diffusion en direct.** Un WebSocket par extraction, qui rediffuse les
   opérations du point 1 aux autres clients connectés. Le client applique
   l'opération reçue à son état local.

**Ce qu'il ne faut pas construire.** L'édition simultanée d'un même champ de
texte par deux personnes, caractère par caractère. Cela demande un CRDT ou de
l'OT, c'est un projet à part entière, et le besoin clinique ne l'exige pas :
deux pathologistes ne rédigent pas la même phrase du même compte rendu au même
instant. Verrouiller le champ en cours d'édition par un confrère, en signalant
qui le tient, répond au besoin réel pour une fraction du coût.

**Point de vigilance : plusieurs processus backend.** Un WebSocket garde son
état **en mémoire du worker** qui porte la connexion. Dès qu'`uvicorn` tourne
avec plus d'un worker, ou que le service est répliqué, deux praticiens tombés
sur deux workers différents ne se voient pas — et le symptôme est intermittent,
donc pénible à diagnostiquer. Il faut alors un bus de messages (Redis pub/sub)
entre les workers. À décider **avant** d'écrire le code, pas après : c'est la
même erreur que les migrations au démarrage ([1.3](#13--sortir-les-migrations-du-démarrage-de-lapplication)),
un choix qui marche sur un poste et casse au déploiement.

**Second point de vigilance : la boucle d'événements.** Les routes synchrones
bloquent la boucle pendant plusieurs secondes sur les opérations PyVips
([1.8](#18--routes-synchrones-qui-bloquent-la-boucle-dévénements)). Un WebSocket
sur une boucle bloquée gèle pour **tous** les clients connectés, et les
déconnecte au-delà du délai de ping. [1.8](#18--routes-synchrones-qui-bloquent-la-boucle-dévénements)
devient un prérequis dur, alors que c'est aujourd'hui un `P1` de confort.

**Dépendances.** [1.8](#18--routes-synchrones-qui-bloquent-la-boucle-dévénements)
(prérequis dur, voir ci-dessus) ; [9.2](#92--aucune-authentification-sur-lapi)
pour que « qui est présent » et « qui a écrit » veuillent dire quelque chose —
sans elle, la présence affiche un nom de `localStorage` que n'importe qui peut
saisir, et le WebSocket s'ouvre sans contrôle d'accès ;
[11.8](#118--notifications) partage le même transport et se livre avec.

**Priorité / effort.** `P3` / `L`. Mais le point 1 seul, **détaché du temps
réel**, est un `P1` / `M` : il corrige une perte de données qui existe déjà.

**Terminé quand.** Une annotation créée par un praticien apparaît chez l'autre
sans rechargement ; les deux voient qui est présent sur le dossier ; deux
enregistrements concurrents du compte rendu produisent un conflit signalé, et
non un écrasement silencieux.

---

### 11.11 - Application web tablette et téléphone

**Besoin.** Utiliser Chiron sur tablette, et consulter un dossier sur téléphone.
La tablette est prioritaire : c'est l'appareil qui a un sens au lit du patient
ou en réunion de concertation, et le seul dont l'écran supporte une lame.

**Ce qui existe aujourd'hui.** Une interface conçue pour une souris et un grand
écran. Le seul élément correct est la balise `viewport`, présente dans
[`index.html`](../frontend/index.html). Tout le reste est à reprendre :

- **Aucun point de rupture, ou presque.** [`index.css`](../frontend/src/index.css)
  ne contient **pas une seule** règle `@media` sur ses 604 lignes. Les préfixes
  responsives Tailwind se comptent sur les doigts : 6 dans `Dashboard.tsx`, 4
  dans `AppShell.tsx`, 2 dans `RadiologyViewer.tsx`, 2 dans `Login.tsx`, 2 dans
  `AddPatientModal.tsx`, et **zéro dans [`Viewer.tsx`](../frontend/src/pages/Viewer.tsx)**,
  qui est pourtant l'écran principal du produit.
- **Des panneaux latéraux à largeur fixe.** `w-[450px]` dans
  [Viewer.tsx:1588](../frontend/src/pages/Viewer.tsx#L1588), `w-[380px]` dans
  [RadiologyViewer.tsx:505](../frontend/src/pages/RadiologyViewer.tsx#L505). Sur
  une tablette en portrait (768 points de large), le panneau de la visionneuse
  occupe **plus de la moitié de l'écran** et ne laisse pas de quoi lire une lame.
- **Des cibles tactiles trop petites.** `.wg-overlay-btn` fait 36 px et
  `.wg-overlay-action` 40 px ([index.css:506](../frontend/src/index.css#L506),
  [index.css:548](../frontend/src/index.css#L548)), contre 44 px recommandés par
  Apple et 48 par Material. Ces boutons sont ceux de la barre d'outils
  d'annotation, donc les plus sollicités.
- **Des interactions liées à la souris.** Le dessin d'annotation passe par
  `onMouseDown` / `onMouseMove` / `onMouseUp`
  ([Viewer.tsx:1265-1267](../frontend/src/pages/Viewer.tsx#L1265-L1267)), et
  chaque forme a son propre `onMouseDown`. Sous un doigt, rien ne se déclenche.
- **Quinze `title=` dans `Viewer.tsx`.** Une infobulle ne s'affiche jamais au
  tactile : sur tablette, ces boutons à icône seule deviennent muets.

**Ce qu'il faut construire.**

1. **Passer aux Pointer Events.** `onPointerDown` / `Move` / `Up` remplacent
   leurs équivalents souris et couvrent d'un coup souris, doigt **et stylet**.
   C'est l'argument décisif : sur tablette, l'outil naturel pour annoter une
   lame est le stylet, et `pointerType === "pen"` avec la pression est donné
   gratuitement par cette API. Ajouter `touch-action: none` sur la surface de
   dessin, faute de quoi le navigateur défile au lieu de laisser dessiner.
2. **Configurer les gestes de la visionneuse.** OpenSeadragon ne reçoit
   aujourd'hui que `gestureSettingsMouse`
   ([Viewer.tsx:158](../frontend/src/pages/Viewer.tsx#L158)) ; il faut régler
   `gestureSettingsTouch` explicitement. Et trancher le conflit de fond : **un
   glissement à un doigt ne peut pas à la fois déplacer la lame et tracer une
   annotation.** Sur souris on s'en sort avec les modificateurs ou le bouton
   droit, qui n'existent pas ici. Un basculement de mode explicite, visible à
   l'écran, est la seule sortie honnête.
3. **Activer réellement le tactile sur la radiologie.** `hammerjs` est bien
   importé et branché (`cornerstoneTools.external.Hammer`,
   [RadiologyViewer.tsx:27](../frontend/src/pages/RadiologyViewer.tsx#L27) et
   [:38](../frontend/src/pages/RadiologyViewer.tsx#L38)), donc la brique est là.
   Mais les outils sont activés avec `mouseButtonMask: 1` seul
   ([RadiologyViewer.tsx:200-204](../frontend/src/pages/RadiologyViewer.tsx#L200-L204),
   [:252](../frontend/src/pages/RadiologyViewer.tsx#L252),
   [:382](../frontend/src/pages/RadiologyViewer.tsx#L382)) : `cornerstone-tools`
   traite le tactile par des liaisons distinctes, et un masque de bouton de
   souris n'en active aucune. Les outils restent donc inertes sous un doigt.
4. **Reprendre la mise en page.** Les panneaux fixes deviennent un tiroir
   escamotable sous une certaine largeur ; la barre d'outils passe en deux
   rangées plutôt que de déborder ; les cibles montent à 44 px au minimum.
5. **Remplacer les infobulles** par des libellés visibles, ou au minimum un
   `aria-label` doublé d'une légende accessible au tactile.

**Où s'arrêter, et le dire franchement.** Trois cibles, trois ambitions
différentes :

| | Rôle | Ce qu'on y fait |
|---|---|---|
| Poste fixe | Référence | Tout, sans restriction |
| Tablette (≥ 1024 pt) | **Prioritaire** | Lire, annoter au stylet, valider |
| Téléphone | Dépannage | Consulter un dossier, lire un compte rendu |

Annoter une lame sur un écran de 375 points n'est pas un cas d'usage : c'est une
case cochée dans un cahier des charges. Écrire noir sur blanc que le téléphone
est un mode **consultation** évite de dépenser des semaines à rendre
manipulable ce que personne ne manipulera.

**Point de vigilance.** [`Viewer.tsx`](../frontend/src/pages/Viewer.tsx) fait
1741 lignes et ne contient aucune règle responsive : y introduire des points de
rupture sans l'avoir découpé au préalable
([2.1](#21--découper-les-pages-géantes)) revient à empiler des conditions de
mise en page dans un fichier déjà illisible. Ce n'est pas un prérequis strict,
mais faire l'un avant l'autre coûte moins cher que l'inverse.

**Tester sur un vrai appareil.** Une fenêtre de navigateur rétrécie ne dit rien
de la taille réelle d'un doigt, du clavier virtuel qui recouvre un champ, du
`100vh` de Safari iOS qui inclut une barre qui disparaît, ni des zones sûres
autour de l'encoche. Ces quatre pièges ne se voient que sur l'appareil.

**Hors périmètre, à décider séparément.** L'installation sur l'écran d'accueil
(PWA, `manifest.json`, service worker) et le fonctionnement hors ligne : ce sont
des capacités nouvelles, pas une adaptation de l'existant. Rendre l'interface
utilisable au doigt ne les suppose pas.

**Priorité / effort.** `P2` / `L`.

**Terminé quand.** Sur une tablette de 1024 points en paysage, un praticien
ouvre un dossier, lit une lame, trace une annotation au stylet et l'enregistre,
sans qu'aucune commande soit hors d'atteinte ou impossible à déclencher au
doigt ; sur téléphone, le tableau de bord et la fiche patient se lisent sans
défilement horizontal.

---

## Annexe A — Ce que ce backlog ne contient pas

Écarté par construction : ce document ne traite que de modifications de
l'existant. Les éléments suivants ont été identifiés pendant l'audit mais
relèvent de l'évolution fonctionnelle, et doivent faire l'objet d'une décision
séparée :

- **Gestion d'état serveur côté frontend** (React Query ou équivalent) — le
  rechargement manuel des données est un choix d'architecture à revoir, mais
  l'introduire est un ajout de dépendance structurante, pas un correctif.
- **Observabilité** : endpoint `/ready` distinct de `/health`, métriques
  Prometheus, traçage distribué. Utile dès qu'il y a un déploiement, mais
  c'est une capacité nouvelle. Seule la journalisation structurée
  ([1.9](#19--journalisation)) est retenue ici, parce qu'elle remplace un
  existant défaillant (47 `print`).
- **Sauvegarde et restauration** des volumes PostgreSQL, MinIO et Orthanc :
  mentionnée en [7.6](#76--mécanique-de-déploiement) comme décision à prendre,
  mais sa mise en œuvre est un nouveau dispositif.
- ~~**Multi-lames par dossier patient**~~ : écarté lors de l'audit comme un
  choix assumé, cet item est **entré au programme** à la demande de l'équipe.
  Voir [11.2](#112--plusieurs-lames-et-examens-par-dossier-et-frise-chronologique).
- **Purge des études dans Orthanc** lors de la suppression d'un patient : le
  comportement actuel (conservation) est documenté et intentionnel.

## Annexe B — Méthode et limites de l'audit

**Ce qui a été examiné.** L'intégralité du code source Python et TypeScript,
les trois Dockerfiles, le fichier Compose, les fichiers de configuration
(`tsconfig`, `eslint`, `vite`, `alembic`, `.gitignore`, `.dockerignore`), les
manifestes de dépendances, ainsi que `README.md`, `ACCES.md` et l'index de
`docs/`.

**Ce qui n'a pas pu être examiné.**

- **La chaîne d'intégration continue existante.** La copie auditée n'est pas
  un dépôt git et ne contient pas de répertoire `.github/`. Les items de la
  [section 6](#6--intégration-continue-ci) décrivent une cible : ceux qui
  existent déjà sur le dépôt distant sont à retirer de ce backlog.
- **L'historique git**, d'où l'impossibilité de vérifier
  [3.4](#34--artefacts-générés-sur-le-disque-de-travail) (des artefacts
  générés ont-ils été commités ?) et les règles de protection de branche
  actuelles ([8.4](#84--protection-de-la-branche-main)).
- **Le service externe OLGA**, absent de la machine auditée. Les constats de
  [5.3](#53--validation-des-schémas-json-olga) portent sur les schémas
  enregistrés dans le dépôt, pas sur le service lui-même.
- **Le comportement à l'exécution.** Aucun conteneur n'a été démarré : tous
  les constats sont issus de la lecture du code. Les items décrits comme des
  défaillances futures (déploiement, montée en charge) sont des déductions, à
  confirmer par les tests des sections [5](#5--tests) et
  [7](#7--déploiement-continu-cd).

**Convention de référence.** Les numéros de ligne correspondent à l'état du
code au **21 septembre 2026**. Ils se décaleront dès les premières
modifications : en cas de divergence, se fier au nom du symbole cité, pas au
numéro.
