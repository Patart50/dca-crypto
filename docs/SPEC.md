# Spécification — dca-crypto v0.3

Simulateur de stratégie DCA (achats réguliers), 100 % local, en français. Projet frère de [pmpa-crypto](https://github.com/Patart50/pmpa-crypto). Toute convention de calcul est consignée dans [DECISIONS.md](DECISIONS.md).

## 1. Objectif

Montrer, pour une stratégie d'achats réguliers passée :
- ce qu'on aurait accumulé, à quel prix moyen, pour quelle valeur à la date de fin ;
- comment elle se compare à un **achat unique au départ** du même montant total ;
- et exporter les achats simulés vers pmpa-crypto.

Le simulateur **ne calcule aucun impôt** (D-005).

## 2. Paramètres

| Champ | Détail |
|---|---|
| Cryptos | 1 à 10 lignes « crypto + montant par achat » (D-016), en euros frais compris (D-003). Symbole libre, vérifié sur Binance (D-017), ou cours importés par crypto (D-018) |
| Fréquence | Quotidienne ; hebdomadaire (jour de la semaine) ; mensuelle (jour 1 à 28, ou dernier jour du mois) |
| Période | Date de début, date de fin ou « jusqu'à aujourd'hui » |
| Frais | En % ou montant fixe par achat |
| Capital de départ | Facultatif, investi en plus à la première date (D-010), réparti au prorata des montants |

## 3. Calcul

Code : `src/lib/core/simulate.ts` (logique pure, testée).

- Échéancier : une date par échéance entre le début et la fin inclus.
- Prix : clôture journalière UTC du jour d'achat (D-002). Échéance sans prix : pas d'achat, listée (D-009).
- Quantité = (montant − frais) ÷ prix. PMP = total décaissé ÷ quantité totale.
- Résultats : total investi, frais, quantité, PMP, valeur et cours à la date de fin (dernier cours connu), plus-value latente en € et %, nombre d'achats, meilleur et pire prix.
- **Achat unique** : même total, à la première date achetée, mêmes règles de frais ; écart de valeur avec le DCA.
- Chronologie journalière (investi, valeur DCA, valeur achat unique, PMP, cours) pour les graphiques.
- **Portefeuille** (`src/lib/core/portfolio.ts`, D-016) : chaque crypto simulée séparément, puis somme des montants investis, valeurs, frais, achats unique et chronologies.

## 4. Prix

Code : `src/lib/prices/`.

- **Binance** (`binance.ts`, opt-in, même consentement que pmpa D-026) : bougies journalières, 1 000 par requête, hôtes `data-api.binance.vision` puis `api.binance.com`, seules les paires existantes sont interrogées (pmpa D-028). Chemins par jour : `XEUR`, `XUSDT ÷ EURUSDT`, `XUSDT ÷ taux BCE` (D-004). Le nombre de jours par chemin est affiché.
- **Taux BCE** (`ecb.ts`, `ecb-eurusd.json`) : embarqués, régénérés au déploiement par `scripts/update-ecb.mjs`.
- **CSV de prix** (`csvPrices.ts`, par crypto, D-018) : deux colonnes (date, prix) ou historique OHLC (clôture), dates ISO, JJ/MM/AAAA ou Unix, nombres français ou anglais, fichier avec ou sans en-tête. Obligatoire pour une crypto sans paire Binance.
- **Vérification** (D-017) : liste des paires Binance gardée 7 jours, statut affiché sous chaque crypto.

- **Cache** (`cache.ts`, D-012) : séries Binance gardées par actif sur l'appareil ; jour en cours réutilisé une heure.

## 5. Export et sauvegarde

- **CSV pmpa-crypto** (`src/lib/export/pmpa.ts`, D-008) : une ligne `buy` par achat, toutes cryptos, triées par date, `platform` = « Simulation dca-crypto ».
- **CSV pour tableur** (`src/lib/export/results.ts`, D-015) : tableau des achats (colonne crypto) et synthèse (une ligne par crypto, puis totaux).
- **Sauvegarde JSON** (`src/lib/state/backup.ts`, D-013, D-019) : paramètres et cours par crypto, réouverture hors ligne ; version 1 migrée.
- **Stockage local** (`src/lib/state/storage.ts`) : formulaire, réglages (thème, consentement), cours importés, cache Binance. Repli en mémoire si le navigateur bloque le stockage, avec un avertissement.

## 6. Interface (J2)

Une page : formulaire en haut, résultats dessous en trois onglets. État : `src/lib/state/app.svelte.ts`.

- **Paramètres** (`ParamsForm.svelte`) : lignes crypto + montant (ajout, retrait, part de chaque achat, total), statut de chaque symbole et bouton « Prix CSV » par ligne, « Vérifier sur Binance » ; fréquence, début, fin (aujourd'hui ou une date), frais, capital de départ. Consentement Binance dans un encart (D-011). Erreurs de saisie listées, nominatives par crypto.
- **Synthèse** (`Results.svelte`) : phrase de rappel de la stratégie, chiffres clés (valeur, investi ; une crypto : prix moyen, quantité ; plusieurs : meilleure et moins bonne crypto), tableau « Par crypto » (plusieurs cryptos), comparaison DCA / achat unique avec verdict et mise en garde, graphiques « Valeur du portefeuille » (toutes cryptos) et « Prix moyen et cours » (crypto choisie dans une liste) (`LineChart.svelte`, D-014), notes sur les sources (chemins de conversion, cache, échéances sans cours, cours du jour non clos).
- **Achats** (`Purchases.svelte`) : tableau trié du plus récent au plus ancien (inversable), colonne et filtre par crypto, plus haut et plus bas signalés, affichage par tranches, échéances sans cours.
- **Export** (`ExportPanel.svelte`) : pmpa-crypto, tableur, sauvegarde et réouverture.
- En-tête : « par Arnaud (Patart50) » sous le titre (D-020). Pied de page : « Créé par Arnaud (Patart50) · Soutenir le projet », fenêtre de soutien avec GitHub Sponsors et adresses Bitcoin / EVM, QR codes locaux (`Support.svelte`, `support.ts`, D-021).
- Thème auto / clair / sombre, hors ligne (service worker), 375 px sans débordement, WCAG 2 AA vérifié avec axe-core.

## 7. Jalons

- **J1** ✅ Squelette, moteur de simulation, prix (Binance, BCE, CSV), export pmpa-crypto, CI et déploiement.
- **J2** ✅ Interface : paramètres, résultats, graphiques, tableau, export, sauvegarde, consentement réseau, cache.
- **v0.3** ✅ Plusieurs cryptos, vérification Binance, prix CSV par crypto, auteur.
- **J3** Accessibilité, hors ligne vérifié, page « À propos et limites », v1.0.

## 8. Hors périmètre MVP

Exécution d'ordres, clés d'API, comptes, multi-portefeuilles, stratégies conditionnelles, calcul d'impôt. Après le MVP : comparaison de 2-3 stratégies côte à côte (la v1.1 « plusieurs actifs » est livrée en v0.3).
