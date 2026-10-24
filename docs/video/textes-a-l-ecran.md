# Vidéo de présentation Chiron. : textes affichés à l'écran

**Fichier :** `chiron-explainer.mp4`. Durée 90 secondes, 1920 × 1080, sans voix off et sans musique. Tout le message passe par le texte à l'écran.

Les sources sont dans `C:\Users\rayan\chiron-video` (voir son `README.md`). Pour modifier une phrase, cherchez-la dans `src/scenes.tsx`. Pour donner plus de temps de lecture à une scène, augmentez sa durée dans `src/timing.ts`, puis relancez `npm run render`.

Une piste musicale libre de droits peut être ajoutée au montage. La vidéo n'en dépend pas.

---

| Temps | Scène | Textes |
|---|---|---|
| 00:00 à 00:05 | **1. Accroche** | Une biopsie. / Des gigaoctets d'image. / Trois médecins. / Et personne ne sait **où en est le dossier.** |
| 00:05 à 00:15 | **2. Le problème** | Des fichiers éparpillés / Des avis perdus dans les mails / Aucune vue sur l'avancement |
| 00:15 à 00:30 | **3. La solution** | Chiron. / Les lames, les examens et les avis d'un patient, au même endroit. / Chaque dossier montre où il en est, **en 4 étapes.** |
| 00:30 à 00:45 | **4a. Créer un dossier** | Titre : *Créer un dossier en quelques secondes*, sous-titre : *Un formulaire court, puis la lame se dépose et s'envoie.* / Légendes : Un formulaire court, le numéro de dossier est attribué tout seul. / La lame se dépose, son envoi est **suivi en direct.** / Le dossier rejoint aussitôt la file de travail. |
| 00:45 à 01:00 | **4b. Lire la lame** | Titre : *Lire la lame, guidé par les zones à vérifier*, sous-titre : *Le modèle signale les zones, le médecin lit, valide et passe à l'étape suivante.* / Légendes : Un modèle de détection, en cours d'entraînement, **signale les zones à vérifier.** / Chaque zone est listée avec son score : **une aide, pas un diagnostic.** / Le médecin **garde la main** : il lit, renseigne et valide l'étape. |
| 01:00 à 01:15 | **4c. Suivre et demander un avis** | Titre : *Suivre chaque dossier, demander un avis*, sous-titre : *La frise montre tout le parcours du patient, et l'avis d'un collègue arrive au même endroit.* / Légendes : Chaque lame et chaque examen est posé à sa date. / On voit tout de suite **depuis quand une étape attend.** / Un doute ? On demande **un second avis** à un collègue. / *(bandeau)* Deux heures plus tard / La réponse arrive directement dans le dossier. |
| 01:15 à 01:30 | **5. Appel à l'action** | Chiron. / Chaque dossier à sa place. / **Chaque avis au bon moment.** / Lames et examens réunis · Avancement visible · Second avis intégré / Projet SAE · BUT 3 · Université Paris-Est Créteil |

Les passages en gras sont affichés en vert à l'écran.

---

## Pour la soutenance : ce qui est réel et ce qui est maquette

La vidéo montre la cible de la refonte, pas l'état actuel du code. Le jury pourra demander ce qui existe déjà. Voici la répartition, d'après le code et `12-backlog-refonte.md` :

| Montré dans la vidéo | État dans le projet |
|---|---|
| File de travail, vue d'ensemble des dossiers | Existe (tableau de bord), redessinée ici |
| Avancement en 4 étapes | Existe (`WorkflowStepper`) |
| Visionneuse de lame et annotations | Existe (OpenSeadragon) |
| Import d'une lame | Existe, **une seule lame par dossier** aujourd'hui |
| Zones détectées par un modèle | **Backlog 11.1**, modèle à entraîner. La légende le dit. |
| Plusieurs lames et frise chronologique | **Backlog 11.2** |
| Commentaires | **Backlog 11.4** |
| Second avis | **Backlog 11.5** |
| Notifications | **Backlog 11.8** |
| Connexion réelle | **Absente** : aucune table d'utilisateurs n'existe |
