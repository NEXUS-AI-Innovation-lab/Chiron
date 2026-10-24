# Documentation technique Chiron. - prise en main complète

> **Objectif de ce dossier.** Permettre à un développeur qui ne connaît pas le
> projet de le maîtriser en deux jours de travail intensif : architecture,
> endpoints, vocabulaire métier, et capacité à corriger un bug.

Cette documentation est **dérivée du code**, pas de l'intention. Chaque
affirmation renvoie à un fichier et une ligne. Quand le code et le `README.md`
racine divergent, c'est le code qui fait foi — les écarts sont signalés
explicitement.

---

## Plan de lecture recommandé (2 jours)

| Ordre | Document | Durée | Ce que vous saurez faire après |
|---|---|---|---|
| 1 | [01 — Architecture générale](01-architecture-generale.md) | 1 h | Situer chaque composant, suivre une requête de bout en bout |
| 2 | [08 — Lexique médical](08-lexique-medical.md) | 1 h | Lire le code sans buter sur `sbr_grade`, `HES`, `WSI`, `DZI` |
| 3 | [03 — Docker](03-docker.md) | 1 h 30 | Démarrer la pile, diagnostiquer un conteneur mort |
| 4 | [02 — Base de données](02-base-de-donnees.md) | 2 h | Écrire une requête, ajouter une colonne, créer une migration |
| 5 | [04 — Backend](04-backend.md) | 3 h | Naviguer dans `main.py` et `workflow/`, ajouter une route |
| 6 | [05 — Endpoints d'API](05-api-endpoints.md) | 2 h | Appeler n'importe quelle route, connaître ses codes d'erreur |
| 7 | [11 — React + Vite de zéro](11-react-vite-de-zero.md) | 3 h | **Si React vous est inconnu :** comprendre composants, hooks, état, stores, routage |
| 8 | [06 — Frontend](06-frontend.md) | 3 h | Situer chaque `.tsx` de Chiron, fichier par fichier |
| 9 | [07 — Stack et librairies](07-stack-librairies.md) | 2 h | Utiliser OpenSeadragon, Cornerstone, MUI, Recharts… |
| 10 | [09 — Pièges, dettes et bugs](09-pieges-et-bugs.md) | 1 h 30 | Corriger un bug sans en créer un autre |
| 11 | [10 — Parcours de bout en bout](10-parcours-bout-en-bout.md) | 1 h | Rejouer mentalement les 6 scénarios métier |

> **Le document 11 est un cours complet React + Vite**, écrit pour quelqu'un
> qui n'a jamais touché ni l'un ni l'autre : schémas, cycle de vie des hooks,
> emplacements possibles de l'état (dont les « stores »), routage, TypeScript,
> Tailwind, table de débogage. Tous les exemples sont tirés du code de Chiron.
> Si vous connaissez déjà React, sautez directement au document 06.

---

## Le projet en une page

**Chiron** est une plateforme de dossier patient qui réunit **deux mondes
d'imagerie médicale** qui ne se parlent normalement pas :

- la **radiologie DICOM** (scanner, IRM, radio) — servie par un PACS Orthanc,
  affichée par Cornerstone.js ;
- l'**anatomopathologie** et ses **lames numérisées** (WSI, 100 Mo à plusieurs
  Go) — stockées dans MinIO, découpées en pyramide de tuiles DZI par PyVips,
  affichées par OpenSeadragon.

S'y ajoutent :

- une **aide au diagnostic** : le micro-service InstanSeg segmente les noyaux
  cellulaires d'une région et renvoie densité, taille moyenne et pléomorphisme ;
- un **compte rendu anatomopathologique protocolaire** en 4 étapes ordonnées
  (Prélèvement → Préparation → Microscopie → Diagnostic), dont les formulaires
  proviennent du service externe **OLGA** et dont le moteur d'états vit côté
  serveur Chiron.

### Chiffres réels (vérifiés dans le code)

| Élément | Valeur |
|---|---|
| Conteneurs Docker | **7** (`postgres`, `minio`, `orthanc`, `backend`, `instanseg`, `frontend`, `image_seeder`) |
| Routes d'API backend | **20** (+ 1 point de montage statique `/dzi_data`) |
| Routes du micro-service InstanSeg | **4** |
| Tables métier | **7** (+ `alembic_version`) |
| Lignes de code backend | ~2 370 (Python) |
| Lignes de code frontend | ~4 960 (TypeScript / TSX) |
| Étapes du workflow | **4** |

> La présentation `Chiron-Presentation.pptx` annonce « 18 routes d'API ». Le
> décompte réel du code est de **20** routes backend. Voir
> [05 — Endpoints d'API](05-api-endpoints.md) pour la liste exhaustive.

### Contexte académique

SAÉ 5.Real.01 — Parcours A, BUT 3 Informatique. « Développement avancé d'une
solution informatique : conception, développement, validation. »

### Avertissement de sécurité (état réel, pas objectif)

**L'authentification n'est pas implémentée.** L'identité de l'utilisateur vient
du `localStorage` du navigateur (clé `biopsie_user`, posée par
[Login.tsx](../frontend/src/pages/Login.tsx)) et n'est vérifiée par aucun
service. Le mot de passe saisi n'est jamais transmis. Conséquence directe :
**ne jamais déposer de données de patients réels.** Détail complet dans
[09 — Pièges, dettes et bugs](09-pieges-et-bugs.md#sécurité).

---

## Accès rapides

| Service | URL | Identifiants |
|---|---|---|
| Application | http://localhost:5173 | orthanc/orthanc |
| API + Swagger | http://localhost:8002/docs | — |
| InstanSeg | http://localhost:7000/docs | — |
| Console MinIO | http://localhost:9001 | `minioadmin` / `minioadmin` |
| Orthanc | http://localhost:8042 | `orthanc` / `orthanc` |
| OLGA (stack externe) | http://localhost:9091 | — |

```bash
docker compose up -d --build     # démarrage complet
docker compose logs -f backend   # journaux du backend
docker compose restart backend   # après une modification Python
curl http://localhost:8002/health
```
