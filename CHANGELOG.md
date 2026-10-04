# Notes de version

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
