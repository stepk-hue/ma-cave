# Ma Cave — application personnelle de gestion de cave (version 1.1)

Application web installable (PWA), en français, pour un seul utilisateur. Elle fonctionne hors ligne et enregistre tout sur le téléphone. Aucune donnée n'est envoyée sur Internet et aucune donnée fictive n'est incluse : l'application démarre vide.

## 1. Architecture

| Élément | Choix | Pourquoi |
|---|---|---|
| Interface | HTML, CSS et JavaScript sans framework | Aucun outil à installer, aucun « build », rapide sur téléphone |
| Données | IndexedDB (base locale du navigateur) | Persistant après fermeture ou redémarrage, hors ligne |
| Hors ligne | Service worker (`sw.js`) | L'application se charge sans réseau |
| Installation | Manifest PWA (`manifest.webmanifest`) | Icône sur l'écran d'accueil Android, plein écran |
| Import Excel | SheetJS, fourni dans `vendor/` | Lecture des `.xlsx` sans connexion |

Fichiers : `index.html` (structure), `style.css` (thèmes clair et sombre), `app.js` (logique de l'application), `sync.js` (synchronisation en ligne), `supabase.sql` (tables à créer une fois), `sw.js`, `manifest.webmanifest`, `icons/`, `vendor/xlsx.full.min.js`.

## 2. Modèle de données

- **vins** : producteur, cuvée, millésime, couleur, cépages, pays, région, appellation, format (cl), emplacement, notes, fenêtre de garde (début, apogée, fin), réservation, photos.
- **mouvements** : chaque achat (date, quantité, prix unitaire, frais, vendeur, statut commandé ou en cave) et chaque sortie (consommée, offerte, vendue, perdue). Les quantités et le coût de revient en sont déduits ; un vin regroupe donc plusieurs achats à des prix différents.
- **cotations** : prix marchand, transaction constatée ou valeur nette de revente, chacune avec source, date et fiabilité. Sans cotation, le vin affiche « Non évalué ».
- **watchlist** : cibles (producteur seul, cuvée, millésime ou tous), priorité, groupe, prix cible et maximum, rareté, potentiel de revente, liens, prix observés.
- **dégustations**, **instantanés** (un point par jour pour la courbe de valeur), **journal** des opérations, **réglages**.

Le coût de revient unitaire est le coût moyen pondéré, frais compris. La valeur de marché retenue est la cotation la plus récente entre transaction constatée et prix marchand.

## 3. Écrans

Tableau de bord · Cave (recherche, filtres, tri) · Fiche vin · Garde (chronologie, calendrier, par statut) · Watchlist · Analyser une offre · Comparer deux vins · Journal de dégustation · Alertes · Historique et annulation · Import, export et sauvegardes · Réglages. Le bouton « + Ajouter une bouteille » est présent sur chaque écran.

## 4. Lancer l'application sur un ordinateur

Il faut la servir par un petit serveur web (un double-clic sur `index.html` ne suffit pas pour le mode hors ligne) :

```
cd ma-cave
python3 -m http.server 8000
```

Puis ouvrir http://localhost:8000 dans Chrome.

## 5. Installer sur un téléphone Android

Une PWA doit être servie en HTTPS pour être installable. Deux solutions gratuites :

**A. Netlify Drop (le plus simple, sans ligne de commande)**
1. Sur un ordinateur, ouvrir https://app.netlify.com/drop et créer un compte gratuit.
2. Glisser-déposer le dossier `ma-cave` dans la page.
3. Netlify affiche une adresse en `https://….netlify.app`.

**B. GitHub Pages**
1. Créer un dépôt, y déposer le contenu du dossier `ma-cave`.
2. Dans Settings › Pages, choisir la branche `main` et le dossier racine.
3. L'adresse est `https://<compte>.github.io/<dépôt>/`.

**Sur le téléphone**
1. Ouvrir l'adresse dans Chrome.
2. Menu ⋮ › « Ajouter à l'écran d'accueil » › « Installer ».
3. Lancer « Ma Cave » depuis l'écran d'accueil. Elle fonctionne ensuite sans connexion.

L'adresse est publique mais ne contient que le programme : vos données restent sur votre téléphone et ne sont jamais envoyées au site.

## 6. Sauvegardes : à lire

- Les données vivent dans le stockage de Chrome pour l'adresse du site. Elles survivent à la fermeture de l'application et au redémarrage du téléphone.
- Elles seraient perdues si vous effacez les données de Chrome, désinstallez l'application ou changez d'adresse d'hébergement.
- Exportez donc régulièrement une sauvegarde : Plus › Import, export et sauvegardes › « Exporter une sauvegarde (JSON) ». Le fichier contient tout, photos comprises, et se restaure au même endroit. L'application vous le rappelle après 30 jours.
- Les 20 dernières opérations peuvent être annulées (bandeau « Annuler » ou Plus › Historique).

## 7. Importer votre inventaire

Plus › Import, export et sauvegardes › choisir un CSV ou un Excel. Les colonnes sont reconnues automatiquement (français ou anglais) et vous validez la correspondance avant l'import. L'aperçu compte les contenants, les magnums, l'équivalent 75 cl et les doublons avec la cave actuelle. Un modèle CSV vide est téléchargeable au même endroit. L'import est annulable.

## 8. Synchronisation et sauvegarde automatiques en ligne

L'application reste « locale d'abord » : tout fonctionne sans réseau. Une fois connectée, elle copie vos données et vos photos dans **votre** espace Supabase quelques secondes après chaque modification, à l'ouverture et au retour du réseau. Un second appareil connecté au même compte reçoit les mêmes données.

### Mise en place (une seule fois, sur un ordinateur, environ 10 minutes)

Les intitulés du tableau de bord Supabase peuvent varier légèrement.

1. Créer un compte gratuit sur https://supabase.com, puis un projet (« New project »). Choisir une région européenne, par exemple Francfort.
2. Ouvrir **SQL Editor**, coller tout le contenu du fichier `supabase.sql`, cliquer sur **Run**. Le message attendu est « Success ».
3. Ouvrir **Authentication › Users › Add user › Create new user**. Saisir votre e-mail et un mot de passe, cocher **Auto Confirm User**.
4. Recommandé : dans **Authentication › Sign In / Providers**, désactiver « Allow new users to sign up ». Vous restez ainsi le seul compte.
5. Ouvrir **Project Settings › API Keys** (ou le bouton **Connect**) et noter :
   - l'**URL du projet**, de la forme `https://xxxx.supabase.co` ;
   - la **clé publique** (« Publishable key », commençant par `sb_publishable_`). Ne jamais utiliser la clé secrète.
6. Dans l'application : **Plus › Synchronisation en ligne › Se connecter**, puis saisir l'URL, la clé publique, l'e-mail et le mot de passe.

### Ce qu'il faut savoir

- **Sécurité** : chaque ligne est protégée par Row Level Security ; seul votre compte connecté peut lire ou écrire vos données. Le mot de passe n'est pas conservé sur le téléphone.
- **Pause du projet** : sur l'offre gratuite, Supabase met un projet en pause après 7 jours sans activité. Ouvrir l'application une fois par semaine suffit. Sinon, cliquer sur « Resume project » dans le tableau de bord ; vos données locales ne sont jamais touchées et la synchronisation reprend ensuite.
- **Versions** : une version par jour est conservée 30 jours en ligne et peut être restaurée depuis l'écran de synchronisation.
- **Conflits** : si deux appareils ont été modifiés chacun de leur côté, ou si cet appareil est vide alors qu'une copie existe en ligne, rien n'est écrasé : l'application vous demande quelle version garder.
- **Limites** : 500 Mo de base de données sur l'offre gratuite, soit plus d'un millier de photos.
- **État des tests** : la synchronisation a été testée contre un serveur simulé reproduisant l'interface de Supabase (envoi, réception, photos, conflit, session expirée), et le script SQL a été validé syntaxiquement. Elle n'a pas encore été exécutée sur un vrai projet Supabase : faites un export JSON avant la première connexion.

## 9. Ce que cette version ne fait pas

- **Reconnaissance d'étiquette par IA** : non incluse. Elle exige un service en ligne payant et une clé d'accès.
- **Cours du marché automatiques et alertes de prix** : désactivés tant qu'aucune source de données réelle n'est connectée. Toutes les cotations sont saisies à la main, avec leur source.
- **Notifications** : les alertes de garde sont calculées à l'ouverture de l'application ; il n'y a pas de notification quand elle est fermée.
- **Analyse d'offre** : règles fondées uniquement sur vos données (watchlist, prix observés, cotations, doublons, capacité). Elle ne consulte aucun prix en ligne.

## 10. Mettre à jour l'application

Remplacer les fichiers chez l'hébergeur (sur Netlify : onglet Deploys, glisser le nouveau dossier) et, si vous modifiez le code vous-même, changer le numéro de version dans `sw.js` (`ma-cave-v1.1.0`). Fermez puis rouvrez l'application deux fois pour charger la nouvelle version. Les données ne sont pas touchées.
