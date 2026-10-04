# Journal des décisions — dca-crypto

Chaque décision est numérotée et ne se réécrit pas : on en ajoute une nouvelle qui remplace l'ancienne. Statut : ✅ actée · ⚠️ à vérifier · 🔁 remplacée. Dans les échanges entre projets, préfixer : « dca D-003 ».

## D-001 ✅ Nom, dépôt, licence
`dca-crypto`, dépôt `Patart50/dca-crypto`, AGPL-3.0. Projet frère de pmpa-crypto, mêmes principes (programme commun).

## D-002 ✅ Prix d'achat : clôture journalière UTC
Un achat daté du jour J est exécuté au cours de clôture de la bougie journalière Binance de J (00:00–23:59:59 UTC). Pour le jour en cours, la bougie n'est pas close : son « cours de clôture » est le dernier prix.

## D-003 ✅ Montant saisi frais compris
Le montant par achat est le montant décaissé. Quantité = (montant − frais) ÷ prix ; PMP = total décaissé ÷ quantité totale, cohérent avec pmpa D-009 (frais inclus dans le prix d'acquisition).

## D-004 ✅ Taux EUR/USD de la BCE embarqués
Avant l'ouverture des paires en euros sur Binance (début 2020), les cours en USDT sont convertis avec le taux de référence BCE du jour (dernier taux publié, 6 jours au plus), USDT assimilé au dollar comme en pmpa D-047. Chemins par jour : `XEUR`, sinon `XUSDT ÷ EURUSDT`, sinon `XUSDT ÷ taux BCE`. Le fichier `src/lib/prices/ecb-eurusd.json` est produit par `npm run update:ecb` (Data Portal BCE, série EXR.D.USD.EUR.SP00.A, depuis 2017) ; le déploiement le régénère avant chaque build. Aucun appel réseau à l'exécution. USDT plutôt qu'USDC : paires plus anciennes (2017 contre fin 2018).

## D-005 ✅ Pas d'impôt calculé
Un DCA sans vente n'a pas de fait générateur. La fiscalité se fait dans pmpa-crypto, à partir de l'export CSV des achats simulés.

## D-006 ✅ Graphiques en SVG maison
Pas de bibliothèque de graphiques (deux courbes). Repli sur uPlot, embarqué dans le build, seulement si le coût devient excessif.

## D-007 ✅ Code repris de pmpa-crypto par copie
`money.ts`, lecteur CSV, thème, plugin de service worker, polices, liste des paires Binance : copiés, avec le commit d'origine (`14849f5`) en tête de fichier. Extraction en paquet commun quand un troisième projet en aura besoin.

## D-008 ✅ Export vers pmpa-crypto
Une ligne `buy` par achat, au format CSV de pmpa (SPEC pmpa § 5.3) : `eur` = montant hors frais, `fee_asset` = EUR, `fee_quantity` = frais (pmpa les ajoute au prix d'acquisition, on retrouve le total décaissé). Heure fixée à 12:00, heure de Paris, pour que le jour reste celui de la bougie utilisée (une clôture UTC tomberait le lendemain à Paris). Quantités tronquées à 12 décimales. Identifiant stable dérivé de l'actif, de la date et des paramètres : réimporter la même simulation n'ajoute pas de doublon. Vérifié avec l'importeur de pmpa-crypto : coût ouvert = total décaissé.

## D-009 ✅ Échéances sans prix, cours de fin
Une échéance sans cours (actif pas encore coté, trou de données) ne donne pas d'achat ; elle est listée. L'achat unique de comparaison se fait à la première date réellement achetée, pour le même total investi et avec la même règle de frais (un seul frais fixe, ou le pourcentage du total). La valeur finale utilise le dernier cours connu à la date de fin ou avant.

## D-010 ✅ Capital de départ
Investi en plus de l'achat régulier, à la première date achetée, comme un achat distinct (frais selon la même règle). Exporté comme une ligne à part, notée « Capital de départ ».

## D-011 ✅ Consentement Binance mémorisé, révocable
Le premier lancement avec la source Binance affiche ce qui sera envoyé (noms de paires et dates) ; rien ne part avant « Autoriser et lancer ». Le choix est mémorisé et se retire d'un clic sous le choix de la source. Alternative proposée dans le même encart : un fichier CSV de prix.

## D-012 ✅ Cache local des cours
Les séries chargées sont gardées par actif dans le localStorage. Un cours journalier est définitif une fois la journée UTC terminée ; une série qui contient le jour en cours n'est réutilisée qu'une heure. Deux périodes qui se touchent sont fusionnées, sinon la nouvelle remplace l'ancienne. Au chargement de la page, la dernière simulation est relancée à partir du cache ou des cours importés, sans appel réseau.

## D-013 ✅ Sauvegarde JSON avec les cours
La sauvegarde (`app`, `schemaVersion`) contient les paramètres et les cours de la période : elle se rouvre hors ligne et redonne le même résultat. Rouverte, elle devient la source « fichier » (date de fin fixée). Version plus récente refusée, structure ou cours illisibles refusés sans rien modifier.

## D-014 ✅ Graphiques : couleurs validées, lecture au clavier
Deux séries de couleur (bleu, orange) validées par calcul (écart pour les daltonismes, contraste, bande de luminosité) en clair et en sombre ; le total investi en gris pointillé. Un seul axe, zéro inclus pour les valeurs. Légende toujours visible, étiquettes en bout de courbe au-delà de 560 px. Réticule et info-bulle au survol ; au clavier, la zone du graphique est un curseur (flèches, Début, Fin) qui annonce la date et les valeurs. Les chiffres restent lisibles sans graphique (synthèse, comparaison, tableau des achats).

## D-015 ✅ Exports pour tableur
Tableau des achats et synthèse en CSV « ; », virgule décimale, BOM UTF-8 : ouverture directe dans un tableur réglé en français. Montants à 2 décimales, cours et quantités sans zéros inutiles.

## D-016 ✅ Plusieurs cryptos, un montant par crypto
Remplace la v1.1 « allocation en % » prévue après le MVP : choix d'Arnaud (5 oct. 2026). Jusqu'à 10 cryptos, chacune avec son montant à chaque échéance (même fréquence, même période, mêmes frais). Chaque crypto est simulée séparément puis les résultats sont additionnés (`core/portfolio.ts`). Le capital de départ est réparti au prorata des montants, au centime, le reste sur la dernière ligne. L'achat unique de comparaison achète chaque crypto en une fois à sa première date. Une crypto cotée plus tard commence à son premier cours (D-009). Un symbole en double est refusé. Avec une seule crypto, l'écran reste celui de la v0.2.

## D-017 ✅ Vérification des symboles sur Binance
Chaque ligne indique où l'outil trouvera les cours : coté sur Binance (paires `XEUR`, `XUSDT`), introuvable, ou vos cours (fichier). La vérification utilise la liste des paires Binance (une requête, après consentement), gardée 7 jours sur l'appareil ; « Vérifier sur Binance » la charge avant tout lancement. Seules les paires en EUR et USDT sont conservées.

## D-018 ✅ Prix CSV par crypto
Remplace le choix global « Binance ou fichier » de la v0.2 : chaque crypto peut recevoir son fichier de prix (« Prix CSV »), les autres passent par Binance. Une crypto absente de Binance est donc simulable. Le consentement n'est demandé que si au moins une crypto passe par Binance. Les fichiers sont gardés sur l'appareil, par symbole ; « Utiliser Binance » retire le fichier.

## D-019 ✅ Sauvegarde version 2
`params.assets` (liste crypto + montant) et `prices` par crypto ; `priceFiles` indique les cryptos dont les cours venaient d'un fichier. Une sauvegarde de version 1 (une crypto) est migrée à l'ouverture. Rouverte, une sauvegarde rattache ses cours aux cryptos comme des fichiers importés (D-013).

## D-020 ✅ Auteur affiché
« par Arnaud (Patart50) », lien vers son profil GitHub, sous le titre (visible aussi sur mobile) et dans le pied de page ; balise `meta author`.

## D-021 ✅ Auteur et soutien, à l'identique de pmpa-crypto
Reprend pmpa D-055 (PR #18 et #19 de pmpa-crypto). Pied de page : ligne discrète « Créé par Arnaud (Patart50) · Soutenir le projet », sans nom de famille ; le nom renvoie au profil GitHub. « Soutenir le projet » ouvre une fenêtre : GitHub Sponsors et deux adresses dédiées aux dons (Bitcoin, réseau Bitcoin uniquement ; Ethereum et réseaux compatibles EVM), QR codes générés dans le navigateur (`qrcode`, aucun appel réseau). `src/lib/support.ts` et son test (checksum bech32, format EVM) copiés tels quels depuis pmpa-crypto (commit 37e9dc9) : une faute de frappe dans une adresse fait échouer la CI. `.github/FUNDING.yml` : `github: Patart50`. Section « Auteur et soutien » dans le README ; la page « À propos » (J3) la reprendra. Complète D-020 (l'en-tête lit maintenant l'auteur dans `support.ts`).

## D-022 ✅ Version 1.0
Page « À propos et limites » (`#a-propos`, lien en pied de page), dont la section « Auteur et soutien » (D-021). Hors ligne vérifié dans Chromium : service worker actif, rechargement sans réseau avec la dernière simulation, polices disponibles ; une période non chargée hors ligne affiche un message dédié plutôt qu'une erreur réseau. Accessibilité : lien d'évitement, région `aria-live` qui annonce la fin d'une simulation, focus déplacé sur le titre de la page À propos ; axe-core (WCAG 2.0/2.1 A et AA) sans violation sur tous les écrans et la fenêtre de soutien, en clair et en sombre, bureau et 375 px. La fenêtre de soutien ne laisse plus d'espace parasite après le lien (écart à reporter dans pmpa-crypto). Release `v1.0.0` créée par Arnaud.
