# Accès et identifiants — Chiron

Tous les identifiants ci-dessous sont les **valeurs par défaut de développement**,
définies en clair dans `docker-compose.yml`. Aucun n'est un secret : ils sont
publics dans le dépôt. À ne pas réutiliser en production.

## Interfaces web

| Service | URL | Identifiant | Mot de passe |
|---|---|---|---|
| Frontend Chiron | http://localhost:5173 | *n'importe lequel* | *n'importe lequel* |
| API backend (Swagger) | http://localhost:8002/docs | — | — |
| InstanSeg (API IA) | http://localhost:7001/health | — | — |
| Console MinIO | http://localhost:9001 | `minioadmin` | `minioadmin` |
| Orthanc (PACS) | http://localhost:8042 | `orthanc` | `orthanc` |

## Bases de données et services internes

| Service | Accès | Identifiant | Mot de passe |
|---|---|---|---|
| PostgreSQL | `localhost:5432`, base `p6_db` | `user` | `password` |
| MinIO (S3) | `localhost:9000`, bucket `biopsie` | `minioadmin` | `minioadmin` |
| Orthanc DICOM | `localhost:4242` (AET `ORTHANC`) | `orthanc` | `orthanc` |

Chaîne de connexion PostgreSQL utilisée par le backend :

    postgresql://user:password@p6_postgres:5432/p6_db

## Points d'attention

**Le portail médecin ne vérifie aucun mot de passe.** Dans
`frontend/src/pages/Login.tsx`, le champ mot de passe n'est jamais lu : il n'a ni
`value` ni `onChange`, et `handleLogin` se contente d'enregistrer le nom saisi
dans `localStorage` sous la clé `biopsie_user`. N'importe quel couple
identifiant / mot de passe non vide ouvre l'application. Il n'y a donc pas de
comptes utilisateurs à connaître — le nom saisi sert uniquement à signer les
annotations.

**Orthanc n'affiche plus de fenêtre de connexion.** Le proxy Vite porte
désormais l'authentification (`auth` dans `frontend/vite.config.ts`).
Surchargeable par les variables `VITE_ORTHANC_USER` et `VITE_ORTHANC_PASSWORD`.
Ce mécanisme n'existe qu'en mode développement : en production, il faudra faire
passer les requêtes Orthanc par le backend ou par un reverse proxy.

**OLGA** (formulaires du workflow, http://localhost:9091) est une stack externe,
absente de cette machine. Aucun identifiant n'est requis côté Chiron : en son
absence, l'application sert un instantané de formulaire enregistré.

## Commandes utiles

    docker compose up -d                                  # démarrer
    docker compose ps -a                                  # état (y compris le seeder, qui sort en 0)
    docker compose up -d --force-recreate image_seeder    # réinjecter les données
    docker compose exec postgres psql -U user -d p6_db    # console SQL
    docker compose down -v                                # tout supprimer, volumes compris
