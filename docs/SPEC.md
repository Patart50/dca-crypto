# Spécification — dca-crypto v0.1

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
| Actif | Liste des actifs cotés en EUR ou USDT sur Binance, ou actif libre avec prix importés |
| Montant par achat | En euros, frais compris (D-003) |
| Fréquence | Quotidienne ; hebdomadaire (jour de la semaine) ; mensuelle (jour 1 à 28, ou dernier jour du mois) |
| Période | Date de début, date de fin ou « jusqu'à aujourd'hui » |
| Frais | En % ou montant fixe par achat |
| Capital de départ | Facultatif, investi en plus à la première date (D-010) |

## 3. Calcul

Code : `src/lib/core/simulate.ts` (logique pure, testée).

- Échéancier : une date par échéance entre le début et la fin inclus.
- Prix : clôture journalière UTC du jour d'achat (D-002). Échéance sans prix : pas d'achat, listée (D-009).
- Quantité = (montant − frais) ÷ prix. PMP = total décaissé ÷ quantité totale.
- Résultats : total investi, frais, quantité, PMP, valeur et cours à la date de fin (dernier cours connu), plus-value latente en € et %, nombre d'achats, meilleur et pire prix.
- **Achat unique** : même total, à la première date achetée, mêmes règles de frais ; écart de valeur avec le DCA.
- Chronologie journalière (investi, valeur DCA, valeur achat unique, PMP, cours) pour les graphiques.

## 4. Prix

Code : `src/lib/prices/`.

- **Binance** (`binance.ts`, opt-in, même consentement que pmpa D-026) : bougies journalières, 1 000 par requête, hôtes `data-api.binance.vision` puis `api.binance.com`, seules les paires existantes sont interrogées (pmpa D-028). Chemins par jour : `XEUR`, `XUSDT ÷ EURUSDT`, `XUSDT ÷ taux BCE` (D-004). Le nombre de jours par chemin est affiché.
- **Taux BCE** (`ecb.ts`, `ecb-eurusd.json`) : embarqués, régénérés au déploiement par `scripts/update-ecb.mjs`.
- **CSV de prix** (`csvPrices.ts`) : deux colonnes (date, prix) ou historique OHLC (clôture), dates ISO, JJ/MM/AAAA ou Unix, nombres français ou anglais, fichier avec ou sans en-tête. Obligatoire pour un actif sans paire Binance.

## 5. Export et sauvegarde

- **CSV pmpa-crypto** (`src/lib/export/pmpa.ts`, D-008) : une ligne `buy` par achat, `platform` = « Simulation dca-crypto ».
- (J2) CSV des résultats et du tableau d'achats ; simulation en localStorage et JSON versionné ; prix chargés mis en cache localement.

## 6. Écrans (J2)

1. Paramètres + « Lancer la simulation »
2. Résultats (chiffres, comparaison, graphiques SVG maison, D-006)
3. Détail des achats
4. Export / sauvegarde

## 7. Jalons

- **J1** ✅ Squelette, moteur de simulation, prix (Binance, BCE, CSV), export pmpa-crypto, CI et déploiement.
- **J2** Interface : paramètres, résultats, graphiques, tableau, export, sauvegarde, consentement réseau.
- **J3** Accessibilité, hors ligne vérifié, page « À propos et limites », v1.0.

## 8. Hors périmètre MVP

Exécution d'ordres, clés d'API, comptes, multi-portefeuilles, stratégies conditionnelles, calcul d'impôt. Après le MVP : v1.1 plusieurs actifs avec allocation ; v1.2 comparaison de 2-3 stratégies côte à côte.
