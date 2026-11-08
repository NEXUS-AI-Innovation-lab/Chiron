# Accès et identifiants — Chiron

Tous les identifiants ci-dessous sont les **valeurs par défaut de développement**,
définies en clair dans `docker-compose.yml`. Aucun n'est un secret : ils sont
publics dans le dépôt. À ne pas réutiliser en production.

## Interfaces web

| Service | URL | Identifiant | Mot de passe |
|---|---|---|---|
| Frontend Chiron | http://localhost:5173 | compte créé sur `/inscription` | (le vôtre) |
| Supabase Studio | http://127.0.0.1:56323 | — | — |
| Mailpit (e-mails locaux) | http://127.0.0.1:56324 | — | — |
| API backend (Swagger) | http://localhost:8002/docs | — | — |
| InstanSeg (API IA) | http://localhost:7001/health | — | — |
| Orthanc (PACS) | http://localhost:8042 | `orthanc` | `orthanc` |

## Bases de données et services internes

| Service | Accès | Identifiant | Mot de passe |
|---|---|---|---|
| PostgreSQL (Supabase) | `127.0.0.1:56322`, base `postgres` | `postgres` | `postgres` |
| API Supabase | `http://127.0.0.1:56321` | clé publishable `sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH` | — |
| Garage (S3) | `http://localhost:3900`, région `garage`, bucket `biopsie` | `GK7f5b9f737e5d1f5b2d907639` | `baa7d18ca1d495315d4bf859e05dd3a3f2898ccff58f634c7f309f1764c47939` |
| Garage (administration) | `http://localhost:3903`, jeton Bearer | — | `e9fa5a405b6f343b8f6db6fdd3043cd75e2f07997317e9c1` |
| Orthanc DICOM | `localhost:4242` (AET `ORTHANC`) | `orthanc` | `orthanc` |

Chaîne de connexion PostgreSQL utilisée par le backend (depuis son conteneur) :

    postgresql://postgres:postgres@host.docker.internal:56322/postgres

Supabase se lance avec `supabase start`, avant `docker compose up`
(voir `docs/16-supabase.md`).

## Points d'attention

**Les comptes sont gérés par Supabase Auth.** Il n'existe pas de compte par
défaut : chacun crée le sien sur http://localhost:5173/inscription (adresse
e-mail, nom affiché, profession, mot de passe d'au moins 10 caractères avec
minuscule, majuscule et chiffre). Les e-mails de réinitialisation du mot de
passe arrivent dans Mailpit (http://127.0.0.1:56324). Détail :
`docs/16-supabase.md`.

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
