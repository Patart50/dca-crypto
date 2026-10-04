# dca-crypto

Simulateur de stratégie DCA (achats réguliers) en crypto, **100 % local**, en français.

- Combien aurait-on accumulé en achetant 100 € de BTC et 50 € d'ETH chaque mois depuis 2019 ? À quel prix moyen ? Pour quelle valeur aujourd'hui ?
- Jusqu'à 10 cryptos, chacune avec son montant ; un symbole saisi à la main est vérifié sur Binance, ou simulé avec vos propres prix.
- Qu'aurait donné le même montant investi en une seule fois au départ ?
- Export des achats simulés vers [pmpa-crypto](https://github.com/Patart50/pmpa-crypto), pour le calcul fiscal.

Site : https://patart50.github.io/dca-crypto/

## Principes

- Aucune donnée ne quitte le navigateur. Pas de compte, pas de serveur.
- Les cours historiques viennent de l'API publique de Binance **sur demande explicite** (seuls des noms de paires et des dates sont envoyés), ou d'un fichier CSV de prix que vous fournissez.
- Avant 2020 (pas de paire en euros sur Binance), conversion des cours en USDT avec les taux de référence EUR/USD de la Banque centrale européenne, embarqués dans l'application.
- Aucun impôt n'est calculé : un DCA sans vente n'est pas imposable. Pour simuler une vente, importez l'export dans pmpa-crypto.
- Ceci est une simulation sur données passées, pas un conseil en investissement.

## Développement

```sh
npm install
npm run dev          # serveur de développement
npm test             # tests
npm run check        # vérification des types
npm run build        # site statique dans dist/
npm run update:ecb   # met à jour les taux EUR/USD de la BCE embarqués
```

Spécification : [docs/SPEC.md](docs/SPEC.md) · Décisions : [docs/DECISIONS.md](docs/DECISIONS.md)

## Auteur

Arnaud ([Patart50](https://github.com/Patart50)).

## Licence

[AGPL-3.0](LICENSE). Taux de change : © Banque centrale européenne, réutilisés avec mention de la source.
