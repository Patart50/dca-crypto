# Notes de version

## Non publié

- Aperçu des liens : un lien vers l'outil partagé sur X, Mastodon, Discord ou une messagerie affiche une carte avec titre, description et image (balises Open Graph, image `og.png` 1200×630). Aucun effet sur le fonctionnement ni sur vos données.

## 1.0.0 — Première version stable

- Page « À propos et limites » : ce que fait l'outil, vos données, méthode de calcul, limites connues, avertissement, contribuer, auteur et soutien.
- Hors ligne vérifié : après une première visite, la page, les polices et les simulations déjà calculées s'ouvrent sans réseau ; un message clair si une période manque.
- Accessibilité : lien « Aller au contenu », annonce de fin de simulation pour les lecteurs d'écran, focus sur le titre de la page À propos ; WCAG 2 AA vérifié avec axe-core sur tous les écrans, en clair et en sombre, sur bureau et à 375 px.
- README orienté utilisateur.

## 0.3.1 — Auteur et soutien

- Pied de page : « Créé par Arnaud (Patart50) · Soutenir le projet ».
- Fenêtre de soutien : GitHub Sponsors, adresses Bitcoin et EVM avec QR codes générés dans le navigateur.

## 0.3.0 — Plusieurs cryptos

- Jusqu'à 10 cryptos dans une même simulation, chacune avec son montant à chaque achat ; capital de départ réparti.
- Symbole saisi à la main vérifié sur Binance (paires EUR et USDT), statut affiché sous chaque crypto.
- Fichier de prix par crypto : une crypto absente de Binance peut être simulée.
- Résultats par crypto, graphique du prix moyen au choix de la crypto, filtre des achats par crypto.
- Exports et sauvegarde multi-cryptos (les sauvegardes de la v0.2 se rouvrent).
- Nom de l'auteur sous le titre.

## 0.2.0 — J2 : interface

- Formulaire de stratégie : actif, montant, fréquence, période, frais, capital de départ, source des cours.
- Cours Binance après consentement explicite et révocable, gardés sur l'appareil ; import d'un fichier CSV de prix.
- Synthèse : chiffres clés, comparaison avec un achat unique, graphiques de la valeur et du prix moyen (survol et clavier).
- Tableau des achats ; exports pmpa-crypto et tableur ; sauvegarde JSON réouvrable hors ligne.
- Thème clair/sombre, mobile, accessibilité WCAG 2 AA vérifiée.

## 0.1.0 — J1

- Moteur de simulation DCA : échéancier quotidien, hebdomadaire ou mensuel, frais en % ou fixes (montant frais compris), capital de départ, PMP, plus-value latente, meilleur et pire prix, chronologie journalière.
- Comparaison avec un achat unique au départ.
- Prix : bougies journalières Binance (EUR, USDT ÷ EURUSDT, USDT ÷ taux BCE), taux BCE embarqués, import d'un CSV de prix.
- Export des achats au format CSV de pmpa-crypto.
- CI et déploiement GitHub Pages.
