# 15 — Stockage objet : Garage et boto3

> **En une phrase :** les lames sources et les extractions sont stockées dans
> **Garage**, un stockage objet compatible S3, et le backend lui parle avec
> **boto3**, le client S3 officiel d'AWS. Ils remplacent le serveur MinIO et
> la bibliothèque Python `minio`.

---

## Sommaire

1. [Pourquoi ce changement](#1-pourquoi-ce-changement)
2. [Ce qui est stocké, et ce qui ne l'est pas](#2-ce-qui-est-stocké-et-ce-qui-ne-lest-pas)
3. [Les trois pièces : Garage, `garage_init`, boto3](#3-les-trois-pièces--garage-garage_init-boto3)
4. [Le service `garage`](#4-le-service-garage)
5. [Le service `garage_init`](#5-le-service-garage_init)
6. [Le client boto3 : `clients/object_storage.py`](#6-le-client-boto3--clientsobject_storagepy)
7. [Configuration](#7-configuration)
8. [Migrer ses données depuis MinIO](#8-migrer-ses-données-depuis-minio)
9. [Inspecter le stockage](#9-inspecter-le-stockage)
10. [Dépannage](#10-dépannage)
11. [Ce qui a changé, fichier par fichier](#11-ce-qui-a-changé-fichier-par-fichier)
12. [Comment le changement a été vérifié](#12-comment-le-changement-a-été-vérifié)

---

## 1. Pourquoi ce changement

| Problème avec MinIO | Avec Garage |
|---|---|
| MinIO ne publie plus d'images Docker depuis fin 2025. Le projet dépendait d'un fork communautaire (`pgsty/minio`). | Image officielle `dxflrs/garage`, publiée par l'association Deuxfleurs. |
| La console web de MinIO a perdu la plupart de ses fonctions dans l'édition libre. | Pas de console : on administre par l'API d'administration ou par la commande `garage`. |
| Licence AGPL, avec un éditeur qui pousse vers son offre commerciale. | Licence AGPL, projet associatif, financé par des fonds publics européens (NGI). |
| Le client Python `minio` ne fonctionne qu'avec un serveur compatible MinIO. | **boto3** fonctionne avec **n'importe quel** service S3 : Garage, MinIO, AWS, Scaleway, OVH... |

Le second point compte le plus pour l'avenir : le backend ne dépend plus d'un
fournisseur. Changer de stockage S3 se fait dans `config.py`, sans toucher au
code.

---

## 2. Ce qui est stocké, et ce qui ne l'est pas

| Donnée | Où | Clé ou chemin |
|---|---|---|
| **Lame source** (`.svs`, `.tif`, `.tiff`) | Garage, bucket `biopsie` | `{folder_id}/{nom}.svs` |
| **Extraction** (TIFF pyramidal) | Garage, bucket `biopsie` | `{folder_id}/extractions/extraction_{horodatage}.svs` |
| Tuiles DZI affichées par le viewer | **Disque** (`backend/dzi_data/`) | `{folder_id}/{nom}.dzi` + `{nom}_files/` |
| Examens DICOM | **Orthanc** | identifiant d'étude Orthanc |

Les tuiles ne passent **pas** par Garage : OpenSeadragon les lit directement
sur `/dzi_data`. En revanche, l'analyse IA, la création d'extraction et la
régénération des tuiles relisent la **lame source** dans Garage.

La disposition des clés n'a pas changé : voir
[03 — Docker §2](03-docker.md#2-garage--le-stockage-objet-des-lames) et
[`storage.py`](../backend/storage.py).

---

## 3. Les trois pièces : Garage, `garage_init`, boto3

```
                   docker compose up
                          │
          ┌───────────────▼────────────────┐
          │ garage   (dxflrs/garage:v2.5.0) │  S3 :3900 · admin :3903
          └───────────────┬────────────────┘
                          │ API d'administration
          ┌───────────────▼────────────────┐
          │ garage_init   (python, 1 fois)  │  disposition → clé → bucket
          └───────────────┬────────────────┘
                          │ se termine avec le code 0
            ┌─────────────┴──────────────┐
            ▼                            ▼
   ┌─────────────────┐          ┌──────────────────┐
   │ backend          │          │ image_seeder     │
   │ boto3 → :3900    │          │ boto3 → :3900    │
   └─────────────────┘          └──────────────────┘
```

**Pourquoi un conteneur d'initialisation ?** MinIO créait tout seul son
compte administrateur au démarrage. Garage, non : un nœud neuf n'a aucun rôle
de stockage, aucune clé d'accès et aucun bucket, et refuse donc toute requête
S3. `garage_init` prépare tout cela, puis s'arrête. Le backend et le seeder
attendent qu'il ait **réussi** avant de démarrer
(`condition: service_completed_successfully`).

---

## 4. Le service `garage`

```yaml
garage:
  image: dxflrs/garage:v2.5.0
  container_name: p6_garage
  ports:
    - "3900:3900"   # API S3
    - "3903:3903"   # API d'administration
  environment:
    GARAGE_RPC_SECRET: ...     # secret entre nœuds (64 hexa)
    GARAGE_ADMIN_TOKEN: ...    # jeton de l'API d'administration
  volumes:
    - ./garage/garage.toml:/etc/garage.toml:ro
    - garage_meta:/var/lib/garage/meta
    - garage_data:/var/lib/garage/data
```

| Élément | Détail |
|---|---|
| **Configuration** | [`garage/garage.toml`](../garage/garage.toml), sans aucun secret : Garage lit `GARAGE_RPC_SECRET` et `GARAGE_ADMIN_TOKEN` dans l'environnement. |
| **Un seul nœud** | `replication_factor = 1` : une seule copie de chaque objet. Suffisant en développement. En production, on monte au moins 3 nœuds dans des zones différentes. |
| **Région S3** | `s3_region = "garage"`. Le client doit annoncer **exactement** cette région, sinon Garage refuse la signature. |
| **Métadonnées** | Volume `garage_meta`, base SQLite (`db_engine = "sqlite"`). |
| **Données** | Volume `garage_data` : les objets, découpés en blocs. |
| **Port 3901** | Communication entre nœuds (RPC). Non publié : un seul nœud. |
| **Pas de console web** | Voir [§9](#9-inspecter-le-stockage) pour inspecter le bucket. |

L'image ne contient **que** le binaire `/garage`, sans shell. On ne peut donc
pas faire `docker exec p6_garage sh`, mais on peut lancer la commande
`garage` :

```bash
docker exec p6_garage /garage status
docker exec p6_garage /garage bucket info biopsie
```

---

## 5. Le service `garage_init`

Script : [`garage/init_garage.py`](../garage/init_garage.py). Il n'utilise que
la bibliothèque standard de Python et tourne dans `python:3.12-alpine`.

Il appelle l'**API d'administration v2** de Garage
(`http://garage:3903/v2/...`, jeton en `Authorization: Bearer`) :

| Étape | Appels | Si c'est déjà fait |
|---|---|---|
| 1. Attendre Garage | `GetClusterStatus`, toutes les 2 s, pendant 2 minutes au plus | — |
| 2. Donner un rôle au nœud | `UpdateClusterLayout` (zone `dc1`, capacité 10 Go), puis `ApplyClusterLayout` | « disposition déjà en place » |
| 3. Créer la clé d'accès | `ImportKey` avec l'identifiant et le secret de `S3_ACCESS_KEY` / `S3_SECRET_KEY` | « clé déjà présente » |
| 4. Créer le bucket | `CreateBucket` (`biopsie`) | « bucket déjà présent » |
| 5. Donner les droits | `AllowBucketKey` : lecture, écriture, propriétaire | réappliqué sans effet |

Le script est **idempotent** : il tourne à chaque `docker compose up` et ne
change rien sur un Garage déjà prêt. Ses messages :

```
[+] disposition appliquee (version 1, 1 noeud(s))
[+] cle GK7f5b9f737e5d1f5b2d907639 importee
[+] bucket 'biopsie' cree
[=] cle autorisee en lecture/ecriture sur 'biopsie'
Garage pret.
```

**Pourquoi « importer » une clé plutôt que la générer ?** Garage sait créer une
clé aléatoire, mais il faudrait alors la recopier dans la configuration du
backend après chaque réinitialisation. Avec une clé importée, ses valeurs sont
fixées dans `docker-compose.yml` et identiques pour toute l'équipe. Garage
impose leur format : un identifiant `GK` suivi de 24 caractères hexadécimaux,
et un secret de 64 caractères hexadécimaux.

---

## 6. Le client boto3 : `clients/object_storage.py`

Le reste du code n'importe **jamais** boto3. Il passe par l'objet partagé
`object_storage`, qui n'expose que les opérations dont Chiron a besoin :

| Méthode | Opération S3 | Utilisée par |
|---|---|---|
| `upload_file(key, path)` | `PutObject`, ou envoi en plusieurs morceaux au-delà de 8 Mo | import de lame, extraction, seeder |
| `download_file(key, path)` | `GetObject` | analyse IA, extraction, régénération des tuiles |
| `exists(key)` | `HeadObject` (ne télécharge rien) | `storage.find_object_key`, seeder |
| `delete(key)` | `DeleteObject` (sans erreur si déjà absent) | suppression de patient, de lame, d'extraction |
| `list_keys(prefix)` | `ListObjectsV2`, pages comprises | suppression de patient, `storage.candidate_object_keys` |
| `ensure_bucket()` | `HeadBucket`, puis `CreateBucket` si absent | import de lame, seeder (filet de sécurité) |
| `ping()` | `ListBuckets` | attente du seeder |

Les réglages du client, et la raison de chacun :

```python
boto3.client(
    "s3",
    endpoint_url=config.S3_ENDPOINT,            # http://garage:3900
    region_name=config.S3_REGION,               # "garage", = garage.toml
    config=Config(
        signature_version="s3v4",
        s3={"addressing_style": "path"},        # 1
        request_checksum_calculation="when_required",   # 2
        response_checksum_validation="when_required",   # 2
        retries={"max_attempts": 3, "mode": "standard"},
    ),
)
```

1. **Adressage par chemin** : `http://garage:3900/biopsie/cle`. Par défaut,
   boto3 met le bucket dans le nom d'hôte (`http://biopsie.garage:3900/cle`),
   un nom qui ne résout pas dans le réseau Docker.
2. **Sommes de contrôle** : depuis 2025, boto3 ajoute d'office une somme CRC
   à chaque envoi. Ce réglage ne l'envoie que lorsque l'opération l'exige,
   ce qui est le comportement attendu par les services compatibles S3.

**boto3 est synchrone.** Comme avec l'ancien client, tout appel depuis une
fonction `async` passe par `run_in_threadpool`, sinon toute l'API se fige
pendant l'envoi d'une lame.

**Pourquoi boto3 1.42.97 ?** C'est la dernière série qui accepte le Python 3.9
de l'image du backend. boto3 affiche un avertissement de dépréciation au
démarrage : AWS ne suit plus Python 3.9 depuis avril 2026. Passer l'image du
backend à Python 3.12 le ferait disparaître (point 1.15 de
[12 — Backlog](12-backlog-refonte.md)).

> **Effet de bord.** Sous Python 3.9, botocore impose `urllib3` < 2. La
> bibliothèque `requests`, qui sert à appeler Orthanc, utilise donc
> `urllib3` 1.26. Seul le texte des erreurs réseau change, par exemple dans
> « Orthanc indisponible : ... ».

---

## 7. Configuration

Lue dans [`config.py`](../backend/config.py), par l'API **et** par le seeder :

| Variable | Défaut | Rôle |
|---|---|---|
| `S3_ENDPOINT` | `http://garage:3900` | Adresse de l'API S3 |
| `S3_REGION` | `garage` | Doit être égale à `s3_region` dans `garage.toml` |
| `S3_ACCESS_KEY` | `GK7f5b9f737e5d1f5b2d907639` | Identifiant de la clé (dev) |
| `S3_SECRET_KEY` | `baa7d18c…` | Secret de la clé (dev) |
| `S3_BUCKET` | `biopsie` | Bucket des lames |

Côté Garage et `garage_init` :

| Variable | Où | Rôle |
|---|---|---|
| `GARAGE_RPC_SECRET` | `garage` | Secret partagé entre les nœuds |
| `GARAGE_ADMIN_TOKEN` | `garage`, `garage_init` | Jeton de l'API d'administration (même valeur des deux côtés) |
| `GARAGE_ADMIN_URL` | `garage_init` | `http://garage:3903` |
| `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET` | `garage_init` | Clé et bucket à créer (mêmes valeurs que le backend) |

> ⚠️ **Toutes ces valeurs sont des secrets de développement**, écrits en clair
> dans `docker-compose.yml`, comme l'étaient `minioadmin` / `minioadmin`. En
> déploiement, il faut en générer de nouveaux et les sortir dans un fichier
> `.env` non versionné :
>
> ```bash
> python -c "import secrets; print('GK' + secrets.token_hex(12))"   # S3_ACCESS_KEY
> python -c "import secrets; print(secrets.token_hex(32))"          # S3_SECRET_KEY, GARAGE_RPC_SECRET
> ```

**Les anciennes variables `MINIO_*` n'existent plus**, ni dans le compose ni
dans le code. Le seeder lit désormais la même configuration que l'API, ce qui
règle la dernière partie du piège B12
([09 — Pièges](09-pieges-et-bugs.md)).

---

## 8. Migrer ses données depuis MinIO

**Qui est concerné ?** Ceux qui ont importé des lames avec l'ancienne pile.
Leurs lames sources sont dans le volume Docker `wigo-main_minio_data`. Après
le passage à Garage :

- les tuiles restent sur le disque, donc **le viewer affiche toujours les
  lames** ;
- mais l'analyse IA et les extractions cherchent la lame source dans Garage,
  et répondent **404 « Lame source introuvable »** tant qu'elle n'y a pas été
  copiée.

Les lames de démonstration n'ont pas besoin d'être migrées : à **chaque**
démarrage, le seeder renvoie dans Garage celles de `images_initiales/` qui y
manquent, même si la base est déjà peuplée.

> Constaté sur un volume réel : un ancien MinIO peut ne plus reconnaître son
> propre bucket (`NoSuchBucket`, aucune liste de buckets), alors que les
> fichiers sont bien sur le disque. Le script de migration ne peut alors rien
> copier. Si le volume ne contenait que la lame de démonstration, le seeder
> suffit.

Le script [`backend/migrate_minio_to_garage.py`](../backend/migrate_minio_to_garage.py)
copie tous les objets de l'ancien bucket vers Garage. Procédure, depuis la
racine du dépôt :

```bash
# 1. Démarrer la nouvelle pile (Garage est initialisé au passage)
docker compose up -d
```

```bash
# 2. Relancer l'ancien MinIO sur son volume, dans le réseau de la pile
docker run -d --rm --name old-minio --network wigo-main_app_network -v wigo-main_minio_data:/data -e MINIO_ROOT_USER=minioadmin -e MINIO_ROOT_PASSWORD=minioadmin pgsty/minio:RELEASE.2026-08-04T00-00-00Z server /data
```

```bash
# 3. Vérifier ce qui sera copié, sans rien copier
docker compose exec -e SOURCE_S3_ENDPOINT=http://old-minio:9000 backend python migrate_minio_to_garage.py --dry-run
```

```bash
# 4. Copier
docker compose exec -e SOURCE_S3_ENDPOINT=http://old-minio:9000 backend python migrate_minio_to_garage.py
```

```bash
# 5. Arrêter l'ancien MinIO
docker stop old-minio
```

Le script ignore les objets déjà présents dans Garage avec la même taille. On
peut donc le relancer après une interruption. Il affiche un bilan :

```
2 objet(s) copie(s), 0 deja present(s), 0 echec(s).
```

Une fois la migration vérifiée, l'ancien volume peut être supprimé avec
`docker volume rm wigo-main_minio_data`. Cette suppression est
**irréversible**. Le volume `minio_data` reste déclaré dans
`docker-compose.yml` justement pour ne pas le perdre avant la migration.

---

## 9. Inspecter le stockage

Garage n'a pas de console web. Trois façons de regarder le bucket :

**Avec la commande `garage`** (état du cluster, taille du bucket) :

```bash
docker exec p6_garage /garage bucket info biopsie
```

**Avec boto3 depuis le backend** (liste des objets) :

```bash
docker compose exec backend python -c "from clients.object_storage import object_storage as s; print(*s.list_keys(), sep='\n')"
```

**Avec n'importe quel client S3** depuis l'hôte (`aws` CLI, `rclone`,
Cyberduck...) : endpoint `http://localhost:3900`, région `garage`, adressage
par chemin, clé et secret de `S3_ACCESS_KEY` / `S3_SECRET_KEY`. Par exemple :

```bash
aws --endpoint-url http://localhost:3900 --region garage s3 ls s3://biopsie --recursive
```

---

## 10. Dépannage

| Symptôme | Cause probable | Que faire |
|---|---|---|
| Le backend ne démarre pas, `garage_init` est en échec | Garage injoignable ou jeton d'administration différent | `docker logs p6_garage_init`. Vérifier que `GARAGE_ADMIN_TOKEN` est identique dans `garage` et `garage_init`. |
| `garage_init` : `HTTP 400 ... invalid access key` | Format de `S3_ACCESS_KEY` incorrect | `GK` + 24 caractères hexadécimaux ; secret de 64 caractères hexadécimaux |
| Import de lame : `500 Échec de l'upload de biopsie : Could not connect to the endpoint URL` | `S3_ENDPOINT` faux, ou Garage arrêté | `docker ps` ; l'adresse vue du backend est `http://garage:3900` |
| `SignatureDoesNotMatch` ou `AuthorizationHeaderMalformed` | `S3_REGION` différent de `s3_region` dans `garage.toml` | Les mettre tous deux à `garage` |
| `AccessDenied` | La clé n'a pas les droits sur le bucket | Relancer l'initialisation : `docker compose up garage_init` |
| `404 Lame source introuvable dans le stockage S3` sur une ancienne lame | Lame importée du temps de MinIO, pas migrée | [§8](#8-migrer-ses-données-depuis-minio) |
| `NoSuchBucket` | Volumes Garage recréés sans relancer l'initialisation | `docker compose up garage_init` |
| Avertissement `PythonDeprecationWarning` au démarrage | boto3 et Python 3.9 | Sans conséquence ; voir [§6](#6-le-client-boto3--clientsobject_storagepy) |

**Repartir de zéro** (efface toutes les lames sources stockées) :

```bash
docker compose down
```

```bash
docker volume rm wigo-main_garage_meta wigo-main_garage_data
```

```bash
docker compose up -d
```

---

## 11. Ce qui a changé, fichier par fichier

| Fichier | Changement |
|---|---|
| `docker-compose.yml` | Service `minio` remplacé par `garage` et `garage_init`. Variables `MINIO_*` remplacées par `S3_*`, aussi pour le seeder. `backend` et `image_seeder` attendent la fin de `garage_init`. Nouveaux volumes `garage_meta` et `garage_data`. |
| `garage/garage.toml` | **Nouveau.** Configuration de Garage. |
| `garage/init_garage.py` | **Nouveau.** Initialisation idempotente. |
| `backend/requirements.txt` | `minio` remplacé par `boto3` et `botocore` 1.42.97. |
| `backend/config.py` | `MINIO_*` remplacées par `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` et `S3_BUCKET`. |
| `backend/clients/object_storage.py` | Réécrit : client boto3 et classe `ObjectStorage`. |
| `backend/storage.py` | Les fonctions reçoivent un `ObjectStorage` au lieu de `(minio_client, bucket)`. |
| `backend/services/biopsies.py`, `extractions.py`, `patients.py` | Appels `minio_client.*` remplacés par `object_storage.*`. |
| `backend/seed_images.py` | Utilise `object_storage` et `config.py` ; n'a plus ses propres variables MinIO. |
| `backend/migrate_minio_to_garage.py` | **Nouveau.** Migration des objets. |

**Ce qui n'a pas changé :**

- Les routes, les paramètres et les réponses de l'API.
- La disposition des clés dans le bucket.
- Le nom du bucket (`biopsie`).
- Les tuiles sur le disque.
- Le nom de la clé `minio_objects` dans les réponses de suppression : le
  frontend la lit ([api.ts](../frontend/src/services/api.ts)). Elle compte
  désormais les objets supprimés dans Garage.

---

## 12. Comment le changement a été vérifié

Tous les tests ont tourné sur une pile Docker jetable : Garage v2.5.0,
PostgreSQL 15 et Orthanc 1.12, avec la nouvelle image du backend.

1. **Initialisation** : `garage_init` lancé deux fois. Au premier passage, il
   crée la disposition, la clé et le bucket. Au second, il ne change rien.
2. **Même scénario de 35 requêtes qu'au découpage du backend.** Il couvre
   l'import d'une vraie lame, l'envoi dans Garage, l'analyse IA (qui relit la
   lame dans Garage), l'extraction, les suppressions et toutes les erreurs.
   Résultat : réponses **identiques** à la version MinIO, sauf le texte d'une
   erreur réseau d'Orthanc (effet de `urllib3`, voir [§6](#6-le-client-boto3--clientsobject_storagepy)).
   Le bucket est vide à la fin, ce qui prouve que les suppressions atteignent
   bien Garage.
3. **Seeder** : injection de la lame de démonstration et des trois DICOM ;
   puis régénération des tuiles effacées, à partir de la lame relue dans
   Garage.
4. **Import DICOM réussi par l'API** (`201`), avec Orthanc.
5. **Migration** : un MinIO jetable avec deux objets, dont un de 12 Mo envoyé
   en plusieurs morceaux. Simulation, copie, puis relance qui ne recopie rien.
6. **Vrai `docker-compose.yml`** : `garage` puis `garage_init` démarrés dans un
   projet Compose séparé ; initialisation réussie (code de sortie 0).

**Non vérifié :** une analyse IA complète avec InstanSeg (image de plusieurs
Go non construite pour ce test) et le démarrage de la pile entière avec le
frontend. Avant de fusionner, lancer `docker compose up` et tester un import,
une analyse et une extraction depuis l'interface.
