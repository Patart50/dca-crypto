<script lang="ts">
  /** Page « À propos et limites » : ce que fait l'outil, ce qu'il envoie, sa méthode et ses limites connues. */
  import { AUTHOR, SPONSORS_URL } from '../support';
  import Support from './Support.svelte';

  const version = __APP_VERSION__;
  const repo = 'https://github.com/Patart50/dca-crypto';
</script>

<article class="about" aria-labelledby="about-title">
  <header>
    <h1 id="about-title" tabindex="-1">À propos et limites</h1>
    <p class="muted">dca-crypto {version} · logiciel libre (AGPL-3.0)</p>
  </header>

  <section>
    <h2>Ce que fait l'outil</h2>
    <ul>
      <li>
        Il rejoue une stratégie d'achats réguliers (DCA) sur le passé : une ou plusieurs cryptos, un montant pour chacune, chaque jour, chaque semaine
        ou chaque mois, avec vos frais et un capital de départ éventuel.
      </li>
      <li>Il donne ce que vous auriez accumulé, à quel prix moyen, pour quelle valeur à la date de fin, crypto par crypto et au total.</li>
      <li>
        Il compare le résultat à un <strong>achat unique au départ</strong> du même montant : c'est la seule comparaison qui dit si le DCA a réellement
        aidé sur la période.
      </li>
      <li>
        Il exporte les achats simulés au format de <a href="https://patart50.github.io/pmpa-crypto/" target="_blank" rel="noopener">pmpa-crypto</a>,
        l'outil frère qui calcule les plus-values selon la méthode fiscale française.
      </li>
    </ul>
  </section>

  <section>
    <h2>Vos données</h2>
    <ul>
      <li>
        Tout est calculé et gardé dans ce navigateur, sur cet appareil. Pas de compte, pas de serveur, pas de mesure d'audience. L'outil marche hors
        ligne une fois chargé, avec les cours déjà téléchargés ou vos fichiers de prix.
      </li>
      <li>
        <strong>Une seule exception, avec votre accord :</strong> les cours historiques viennent de l'API publique de Binance. L'outil n'envoie que des
        noms de paires (« BTCEUR », « BTCUSDT ») et des dates, jamais vos montants. Binance voit votre adresse IP, comme pour toute page web.
        L'autorisation se retire d'un clic, et chaque crypto peut utiliser votre propre fichier de prix à la place.
      </li>
      <li>Les taux de change EUR/USD de la Banque centrale européenne sont intégrés à l'outil : leur utilisation ne contacte personne.</li>
      <li>Pour garder une simulation ou la transmettre, utilisez « Sauvegarder la simulation » (onglet Export) : le fichier contient aussi les cours.</li>
    </ul>
  </section>

  <section>
    <h2>Méthode de calcul</h2>
    <ul>
      <li>Chaque achat se fait au cours de clôture du jour (bougie journalière Binance, de 0 h à 24 h UTC).</li>
      <li>
        Le montant saisi est ce que vous décaissez, frais compris : quantité achetée = (montant − frais) ÷ cours ; prix moyen = total décaissé ÷
        quantité totale.
      </li>
      <li>
        Cours en euros : la paire en euros quand elle existe, sinon la paire en USDT convertie avec EUR/USDT, et avant 2020 (pas de paire en euros sur
        Binance) avec le taux de référence de la BCE, l'USDT étant assimilé au dollar.
      </li>
      <li>
        Achat unique : le même total investi, chaque crypto achetée en une fois à sa première date d'achat, avec les mêmes règles de frais (un seul frais
        fixe, ou le même pourcentage).
      </li>
      <li>
        Calculs en décimal exact, sans arrondi intermédiaire. Chaque choix est publié dans le
        <a href={`${repo}/blob/main/docs/DECISIONS.md`} target="_blank" rel="noopener">journal des décisions</a>.
      </li>
    </ul>
  </section>

  <section>
    <h2>Limites connues</h2>
    <ul>
      <li>
        <strong>Le passé ne prédit rien.</strong> Le résultat dépend entièrement de la période choisie. Sur un marché qui monte, investir tout au départ
        fait souvent mieux ; le DCA lisse le point d'entrée et réduit le risque d'acheter au plus haut, il n'augmente pas le gain attendu.
      </li>
      <li>
        <strong>Un cours par jour</strong> : la clôture, pas le prix réellement obtenu à l'heure de votre achat. Sur une journée agitée, l'écart peut
        atteindre quelques pour cent.
      </li>
      <li>
        <strong>Le cours du jour</strong> n'est pas définitif tant que la journée UTC n'est pas terminée : avec « jusqu'à aujourd'hui », la valeur
        finale bouge.
      </li>
      <li>
        <strong>Avant la cotation</strong> d'une crypto sur Binance, aucun achat n'est simulé : ses achats commencent au premier cours connu, et l'écran
        le signale.
      </li>
      <li><strong>Dollars et stablecoins</strong> : l'USDT est assimilé au dollar (écart habituel de l'ordre de 0,1 %).</li>
      <li>
        <strong>Pas d'impôt calculé</strong> : un DCA sans vente n'est pas imposable. Pour simuler une vente et son imposition, exportez vers
        pmpa-crypto.
      </li>
      <li><strong>Non simulé</strong> : ventes, rééquilibrage entre cryptos, staking et intérêts, ordres à cours limité.</li>
    </ul>
  </section>

  <section>
    <h2>Avertissement</h2>
    <p>
      Simulation sur données passées, à but d'information. Ce n'est ni un conseil en investissement ni une recommandation d'achat. Les cryptos sont des
      actifs très volatils : n'investissez que ce que vous pouvez vous permettre de perdre.
    </p>
  </section>

  <section>
    <h2>Contribuer</h2>
    <p>
      Une erreur de calcul, une idée, une question : <a href={`${repo}/issues`} target="_blank" rel="noopener">ouvrez une discussion sur GitHub</a>.
      Le code source est libre (<a href={`${repo}/blob/main/LICENSE`} target="_blank" rel="noopener">AGPL-3.0</a>).
    </p>
  </section>

  <section>
    <h2>Auteur et soutien</h2>
    <p>
      Créé et maintenu par <a href={AUTHOR.url} target="_blank" rel="noopener author">{AUTHOR.name} ({AUTHOR.handle})</a>, sur son temps libre.
      L'outil est gratuit et le restera. Pour le soutenir : <a href={SPONSORS_URL} target="_blank" rel="noopener">GitHub Sponsors</a>, ou en
      crypto, <Support />.
    </p>
  </section>

  <p><a href="#simulateur">← Retour au simulateur</a></p>
</article>

<style>
  .about {
    display: grid;
    gap: 1.4rem;
    max-width: 46rem;
  }
  header {
    display: grid;
    gap: 0.3rem;
  }
  h1 {
    font-size: clamp(1.6rem, 3.5vw, 2.1rem);
  }
  h1:focus {
    outline: none;
  }
  h2 {
    font-size: 1.2rem;
    margin-bottom: 0.4rem;
  }
  ul {
    margin: 0;
    padding-left: 1.2rem;
    display: grid;
    gap: 0.45rem;
  }
  p {
    margin: 0;
  }
</style>
