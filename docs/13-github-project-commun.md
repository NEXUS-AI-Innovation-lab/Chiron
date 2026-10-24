# GitHub Project commun : Chiron et PathoCollab

Un seul tableau de pilotage pour les deux groupes. Chaque dépôt garde ses issues, ses user stories et sa stack. Le projet les rassemble, et une pastille « Groupe » dit à qui appartient chaque carte.

> **Pourquoi ça marche.** Un GitHub Project (version « Projects », pas l'ancien « Projects classic ») n'appartient à aucun dépôt. Il appartient à un compte et peut contenir des issues venant de n'importe quel dépôt auquel on a accès. Les deux dépôts restent indépendants : fermer une issue dans pathocollab ne touche pas Chiron, mais les deux apparaissent sur le même tableau.

**Dans ce document :**

| Élément | Valeur |
|---|---|
| Propriétaire du projet | votre compte personnel |
| Dépôt Chiron | `github.com/<votre-compte>/<chiron>` (remplacez par le vrai chemin) |
| Dépôt PathoCollab | `github.com/NEXUS-AI-Innovation-lab-for-Health/pathocollab` |

Durée totale de la mise en place : 30 à 45 minutes.

---

## 1. Créer le projet

1. Sur GitHub, cliquez sur votre avatar en haut à droite, puis **Your projects**, puis **New project**.
2. Choisissez le modèle **Board** (Kanban), puis **Create project**.
3. Nommez-le, par exemple **« Pathologie collaborative : Chiron et PathoCollab »**.
4. En haut à droite, menu **…**, puis **Settings**, et remplissez :
   - **Short description :** « Pilotage commun des deux implémentations de la plateforme de collaboration en anatomopathologie. »
   - **README :** collez la section 8 de ce document, les conventions. C'est la page que l'autre groupe lira en premier.
   - **Visibility :** *Private* si vous voulez limiter l'accès aux deux groupes, *Public* si le jury doit pouvoir le consulter sans compte.

---

## 2. Créer les champs

Dans **Settings**, section **Custom fields**, puis **+ New field**.

Les noms sont volontairement **sans accent**. On les tape dans les filtres (`groupe:Chiron`), et un accent y crée des erreurs de frappe.

### 2.1 `Groupe` (Single select) : la pastille qui différencie les deux équipes

| Option | Couleur | Usage |
|---|---|---|
| Chiron | Vert | Issues du dépôt Chiron |
| PathoCollab | Bleu | Issues du dépôt pathocollab |
| Commun | Violet | Besoins partagés, décisions, soutenance, intégration entre les deux |

C'est ce champ qui s'affiche en pastille sur les cartes du Kanban.

### 2.2 `Type` (Single select)

| Option | Usage |
|---|---|
| User story | « En tant que…, je veux…, afin de… » |
| Tache | Travail technique sans valeur directe pour l'utilisateur (configuration, refactorisation) |
| Bug | Comportement incorrect |
| Doc | Documentation, soutenance, rapport |

### 2.3 `Epic` (Single select) : la fonctionnalité commune

Les deux groupes construisent les mêmes fonctionnalités avec des stacks différentes. L'epic est le point de rencontre : en filtrant sur une epic, on voit où en est chaque groupe sur le même besoin.

| Epic | Contenu |
|---|---|
| Authentification et roles | Connexion, comptes, droits par rôle |
| Dossiers patients | Création, fiche, recherche, filtres |
| Import imagerie | Lames (WSI) et examens (DICOM) |
| Visionneuse | Lecture de lame et de radiologie, zoom, outils |
| Annotations | Tracés, auteurs, couches |
| Workflow et compte rendu | Les 4 étapes, formulaires, validation |
| Detection IA | Modèle, zones détectées, scores |
| Collaboration | Commentaires, second avis, notifications |
| Infra et deploiement | Docker, CI, environnements, monitoring |
| Soutenance | Rapport, vidéo, démonstration |

### 2.4 Les champs restants

- **`Priorite`** (Single select) :
  - P0 : bloquant ;
  - P1 : indispensable au livrable ;
  - P2 : important ;
  - P3 : bonus.
- **`Estimation`** (Number) : points de complexité, sur l'échelle 1, 2, 3, 5 ou 8.
- **`Sprint`** (Iteration) :
  - durée de **2 semaines** ;
  - date de début : le lundi de votre premier sprint ;
  - ajoutez les itérations jusqu'à la date de rendu ;
  - les deux groupes partagent le même calendrier de sprints.

### 2.5 Adapter le champ `Status` existant

Le modèle Board crée déjà un champ `Status`. Renommez ou ajoutez ses options pour obtenir cinq colonnes :

| Colonne | Signification |
|---|---|
| Backlog | Identifié, pas encore planifié |
| A faire | Planifié dans le sprint en cours |
| En cours | Quelqu'un travaille dessus |
| En revue | Pull request ouverte ou démonstration à valider |
| Termine | Fermé ou fusionné |

---

## 3. Créer les vues

Une vue est un onglet en haut du projet. Chaque vue garde son propre filtre, son regroupement et ses champs affichés. Pour en créer une : **+ New view** à droite des onglets. Pour la renommer, double-cliquez sur son nom.

| Vue | Disposition | Réglages |
|---|---|---|
| **Kanban commun** | Board | Colonnes : `Status`. Champs affichés sur les cartes (menu de la vue, *Fields*) : `Groupe`, `Epic`, `Priorite`, `Estimation`, `Repository`. Pas de filtre. |
| **Kanban Chiron** | Board | Comme ci-dessus, filtre `groupe:Chiron,Commun` |
| **Kanban PathoCollab** | Board | Comme ci-dessus, filtre `groupe:PathoCollab,Commun` |
| **Par epic** | Table | *Group by* `Epic`, puis colonnes `Groupe`, `Status`, `Sprint`. Pour comparer l'avancement des deux groupes, fonctionnalité par fonctionnalité. |
| **Sprint en cours** | Board | Filtre `sprint:@current`, *Group by* `Groupe`. On voit les deux équipes l'une sous l'autre, pour la réunion de sprint. |
| **Feuille de route** | Roadmap | Dates : champ `Sprint`, *Group by* `Groupe`. À montrer au jury. |
| **Backlog** | Table | Filtre `status:Backlog`, tri par `Priorite`. Pour préparer le sprint suivant. |

Dans le Kanban commun, vous pouvez aussi activer **Slice by `Groupe`** (menu de la vue). Une barre latérale permet alors de basculer entre Chiron, PathoCollab et Commun en un clic, sans changer de vue.

---

## 4. Automatiser

Menu **…**, puis **Workflows**. Activez ces règles intégrées :

| Workflow | Réglage |
|---|---|
| Item added to project | Status = **Backlog** |
| Item reopened | Status = **A faire** |
| Item closed | Status = **Termine** |
| Pull request merged | Status = **Termine** |
| Auto-add to project | Voir ci-dessous |

**Ajout automatique des nouvelles issues.**

- **Pour Chiron :** créez une règle *Auto-add* avec le dépôt Chiron et le filtre `is:issue,pr is:open`.
- **Pour pathocollab :** ajoutez une deuxième règle avec ce dépôt. Comme il appartient à une organisation et le projet à votre compte, GitHub peut ne pas le proposer dans la liste. Dans ce cas, ses issues s'ajoutent à la main, voir section 6.

**La pastille `Groupe` ne se remplit pas toute seule.** Pour gagner du temps, dans la vue Table, triez par `Repository`, sélectionnez toutes les lignes d'un même dépôt, puis donnez une valeur à `Groupe` d'un coup : la modification s'applique à toute la sélection.

---

## 5. Donner l'accès à l'autre groupe

Menu **…**, puis **Settings**, puis **Manage access**, puis **Invite collaborators**. Ajoutez chaque membre des deux groupes avec le rôle **Write**, et gardez **Admin** pour vous.

Être collaborateur du projet ne donne **aucun** droit sur votre dépôt Chiron. Pour qu'un membre de l'autre groupe puisse aussi ouvrir des issues dans Chiron, invitez-le séparément dans les réglages du dépôt.

---

## 6. Ajouter des issues existantes

Trois façons :

1. **Depuis le projet.** En bas d'une colonne, **+ Add item**. Collez l'URL d'une issue, ou tapez `#` puis choisissez le dépôt et l'issue.
2. **Depuis l'issue.** Dans la colonne de droite d'une issue, section **Projects**, cochez le projet. C'est la méthode à utiliser pour pathocollab si l'ajout automatique ne marche pas.
3. **En masse.** Dans la vue Table, **+ Add item**, puis **Add items from repository**. Choisissez le dépôt, filtrez, puis sélectionnez plusieurs issues.

---

## 7. Les besoins communs : des brouillons avec la pastille « Commun »

Ce qui concerne les deux groupes n'a pas sa place dans un dépôt plutôt que dans l'autre. On le crée directement dans le projet : **+ Add item**, tapez le titre, puis Entrée. On obtient un **brouillon** (*draft issue*), avec `Groupe` = **Commun**.

**Une limite à connaître.** Un brouillon ne peut pas avoir de sous-issues. On ne peut donc pas relier formellement « Second avis (commun) » à l'issue Chiron et à l'issue PathoCollab qui le réalisent. On compense avec le champ `Epic` : les trois cartes partagent la même epic, et la vue « Par epic » les montre ensemble.

**Brouillons à créer pour démarrer :**

| Titre | Type | Epic |
|---|---|---|
| Arrêter la liste commune des statuts d'un dossier | Tache | Workflow et compte rendu |
| Aligner les 4 étapes du workflow et leurs formulaires OLGA | Tache | Workflow et compte rendu |
| Définir le jeu de données de démonstration commun (patients fictifs, lames) | Tache | Dossiers patients |
| Fixer le calendrier des sprints et la date de gel des fonctionnalités | Doc | Soutenance |
| Préparer la démonstration croisée devant le jury | Doc | Soutenance |
| Rédiger la comparaison des deux architectures | Doc | Soutenance |

---

## 8. Conventions, à coller dans le README du projet

```markdown
## Comment utiliser ce projet

Ce tableau réunit les deux implémentations de la plateforme de collaboration
en anatomopathologie : **Chiron** et **PathoCollab**. Chaque groupe garde ses
issues dans son dépôt ; ce projet sert à piloter ensemble.

**Le champ Groupe est obligatoire** sur chaque carte :
Chiron, PathoCollab ou Commun.

**Une user story** suit la forme :
« En tant que <rôle>, je veux <action>, afin de <bénéfice>. »
avec ses critères d'acceptation en cases à cocher.

**Une carte ne passe en « En cours »** que si quelqu'un lui est assigné.
**Une carte ne passe en « Terminé »** que si ses critères sont cochés.

**Besoin commun** : brouillon dans le projet, Groupe = Commun, même Epic
que les issues de chaque dépôt qui le réalisent.

Vues : Kanban commun · Kanban Chiron · Kanban PathoCollab · Par epic ·
Sprint en cours · Feuille de route · Backlog.
```

---

## 9. Modèle d'issue « User story » pour les deux dépôts

Pour que les deux groupes écrivent leurs stories dans le même format, ajoutez ce fichier dans **chacun** des deux dépôts, à l'emplacement `.github/ISSUE_TEMPLATE/user-story.yml`. Dans l'interface : **Add file**, puis **Create new file**, et tapez le chemin complet.

```yaml
name: User story
description: Un besoin utilisateur, avec ses critères d'acceptation
title: "[US] "
labels: ["user story"]
body:
  - type: input
    id: role
    attributes:
      label: En tant que
      placeholder: anatomopathologiste, radiologue, administrateur…
    validations:
      required: true
  - type: textarea
    id: besoin
    attributes:
      label: Je veux
      placeholder: ce que l'utilisateur doit pouvoir faire
    validations:
      required: true
  - type: textarea
    id: benefice
    attributes:
      label: Afin de
      placeholder: le bénéfice attendu
    validations:
      required: true
  - type: textarea
    id: criteres
    attributes:
      label: Critères d'acceptation
      value: |
        - [ ] 
        - [ ] 
    validations:
      required: true
  - type: input
    id: commun
    attributes:
      label: Besoin commun associé (facultatif)
      placeholder: titre de la carte « Commun » dans le projet
```

---

## 10. Definition of Ready et Definition of Done

Deux listes de conditions, **communes aux deux groupes** :

- la **DoR** dit quand une carte peut passer de *Backlog* à *A faire* ;
- la **DoD** dit quand elle peut passer en *Termine*.

Chaque groupe peut ajouter des lignes propres à sa stack, mais n'en retire aucune.

Elles sont branchées à quatre endroits :

| Où | Quoi |
|---|---|
| Champ `Status` | Description de *A faire* : « Respecte la DoR ». Description de *Termine* : « Respecte la DoD ». |
| README du projet | Les deux listes complètes (bloc ci-dessous) |
| Modèle d'issue « User story » | Cases DoR à cocher avant d'entrer en sprint |
| Modèle de pull request | Cases DoD à cocher avant la fusion |

### Bloc à ajouter au README du projet

```markdown
## Definition of Ready (DoR)

Une carte passe de **Backlog** à **A faire** seulement si :

- [ ] elle est rédigée « En tant que…, je veux…, afin de… » (user story)
      ou décrit clairement le résultat attendu (tâche, doc)
- [ ] ses critères d'acceptation sont écrits et vérifiables
- [ ] Groupe, Nature, Epic et Priority sont renseignés
- [ ] elle est estimée, à 5 points au plus (une carte à 8 se découpe)
- [ ] ses dépendances sont identifiées : autre groupe, API, données de test
- [ ] si elle touche l'interface, la planche Figma correspondante est liée
- [ ] l'équipe l'a lue ensemble et sait par où commencer

## Definition of Done (DoD)

Une carte passe en **Termine** seulement si :

- [ ] tous ses critères d'acceptation sont cochés
- [ ] le code est passé par une pull request relue et approuvée
      par au moins une autre personne du groupe
- [ ] la CI est verte, et la logique métier nouvelle a ses tests
- [ ] l'application démarre et fonctionne avec `docker compose up`
- [ ] aucun secret en dur, les entrées utilisateur sont validées,
      aucune trace d'erreur technique n'est renvoyée au navigateur
- [ ] la documentation est à jour si un comportement ou une API a changé
- [ ] le résultat a été montré au groupe
      (aux deux groupes pour une carte « Commun »)

Pour une carte **Commun** sans code (décision, convention) :
la décision est écrite dans la carte et validée par un membre de chaque groupe.
```

### Cases DoR dans le modèle d'issue

Ajoutez ce bloc **à la fin** de `.github/ISSUE_TEMPLATE/user-story.yml`, dans les deux dépôts. Ce sont des cases facultatives : on les coche au moment de la planification, pas forcément à la création de l'issue.

```yaml
  - type: checkboxes
    id: dor
    attributes:
      label: Definition of Ready (à cocher avant d'entrer en sprint)
      options:
        - label: Critères d'acceptation écrits et vérifiables
        - label: Groupe, Nature, Epic et Priority renseignés dans le projet
        - label: Estimée à 5 points au plus
        - label: Dépendances identifiées (autre groupe, API, données)
        - label: Planche Figma liée si la story touche l'interface
```

### Modèle de pull request avec la DoD

Créez `.github/pull_request_template.md` dans les deux dépôts. GitHub pré-remplit alors chaque nouvelle pull request avec cette liste :

```markdown
## Ce que fait cette pull request

<!-- Une ou deux phrases. -->

Ferme #<numéro de l'issue>

## Definition of Done

- [ ] Les critères d'acceptation de l'issue sont tous remplis
- [ ] La CI est verte ; la logique métier nouvelle a ses tests
- [ ] Testé avec `docker compose up`
- [ ] Aucun secret en dur, entrées validées, pas de trace d'erreur renvoyée au client
- [ ] Documentation mise à jour si un comportement ou une API change
- [ ] Captures ou courte vidéo jointes si l'interface change
```

Le mot-clé `Ferme #12` (ou `Closes #12`) ferme l'issue à la fusion. Avec le workflow « Item closed », la carte passe alors seule en *Termine*.

---

## 11. Vérification finale

- [ ] Le projet contient au moins une issue de **chaque** dépôt, et la colonne *Repository* affiche les deux.
- [ ] Toutes les cartes ont une valeur dans `Groupe`.
- [ ] Le filtre `groupe:PathoCollab` de la vue « Kanban PathoCollab » n'affiche aucune carte Chiron.
- [ ] Un membre de l'autre groupe, connecté avec son compte, peut déplacer une carte.
- [ ] Fermer une issue dans un des dépôts la fait passer en **Termine** dans le projet.
