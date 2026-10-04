<script lang="ts">
  import { app } from '../state/app.svelte';
  import { dateFr, duration, eur, eurPrice, eurRound, eurSigned, integer, pct, qty } from '../core/format';
  import { D, dec } from '../core/money';
  import type { SimulationResult } from '../core/simulate';
  import LineChart, { type ChartSeries } from './LineChart.svelte';

  let { result }: { result: SimulationResult } = $props();

  const weekdays = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
  const p = $derived(result.params);
  const dca = $derived(result.dca);
  const lump = $derived(result.lumpSum);
  const info = $derived(app.priceInfo);

  const rhythm = $derived.by(() => {
    const f = p.frequency;
    if (f.kind === 'daily') return 'chaque jour';
    if (f.kind === 'weekly') return `chaque ${weekdays[f.weekday - 1]}`;
    return f.day === 'last' ? 'le dernier jour de chaque mois' : `le ${f.day === 1 ? '1er' : f.day} de chaque mois`;
  });
  const firstDate = $derived(result.purchases[0].date);
  const amount = $derived(dec(p.amountEur));

  /** Écart en pourcentage du montant investi. */
  const diffPct = $derived(dca.invested.isZero() ? new D(0) : result.difference.times(100).dividedBy(dca.invested));
  const verdict = $derived(result.difference.gt(0) ? 'mieux' : result.difference.lt(0) ? 'moins bien' : 'aussi bien');

  // Points des graphiques : 700 au plus (le dernier jour est toujours gardé).
  const sampled = $derived.by(() => {
    const t = result.timeline;
    const step = Math.max(1, Math.ceil(t.length / 700));
    return t.filter((_, i) => i % step === 0 || i === t.length - 1);
  });
  const dates = $derived(sampled.map((t) => t.date));
  const valueSeries = $derived<ChartSeries[]>([
    { id: 'dca', label: 'Valeur DCA', color: '--series-1', values: sampled.map((t) => t.value.toNumber()) },
    { id: 'lump', label: 'Achat unique', color: '--series-2', values: sampled.map((t) => t.lumpValue.toNumber()) },
    { id: 'invested', label: 'Total investi', color: '--series-muted', dashed: true, values: sampled.map((t) => t.invested.toNumber()) },
  ]);
  const priceSeries = $derived<ChartSeries[]>([
    { id: 'avg', label: 'Prix moyen', color: '--series-1', values: sampled.map((t) => t.avgPrice.toNumber()) },
    { id: 'price', label: `Cours ${p.asset}`, color: '--series-2', values: sampled.map((t) => t.price.toNumber()) },
  ]);
  const money = (v: number) => eur(dec(v.toFixed(2)));
  const moneyAxis = (v: number) => (Math.abs(v) >= 1e6 ? `${(v / 1e6).toLocaleString('fr-FR')} M€` : eurRound(dec(String(v))));
  const priceFmt = (v: number) => eurPrice(dec(v.toPrecision(10)));
  const priceAxis = (v: number) => (v === 0 || Math.abs(v) >= 100 ? moneyAxis(v) : eurPrice(dec(v.toPrecision(6))));

  const skippedBefore = $derived(result.skipped.filter((d) => d < firstDate).length);
  const skippedAfter = $derived(result.skipped.length - skippedBefore);
  const routeText = $derived.by(() => {
    const r = info?.routes;
    if (!r) return '';
    const parts: string[] = [];
    if (r.EUR) parts.push(`${integer(r.EUR)} j. via ${p.asset}EUR`);
    if (r['USDT/EURUSDT']) parts.push(`${integer(r['USDT/EURUSDT'])} j. via ${p.asset === 'USDT' ? 'EURUSDT' : `${p.asset}USDT ÷ EURUSDT`}`);
    if (r['USDT/BCE']) parts.push(`${integer(r['USDT/BCE'])} j. via ${p.asset === 'USDT' ? 'USDT' : `${p.asset}USDT`} et le taux EUR/USD de la BCE`);
    return parts.join(' · ');
  });
</script>

<div class="results">
  <p class="lead">
    <strong>{eur(amount)}</strong> de <strong>{p.asset}</strong>
    {rhythm}{#if p.initialCapitalEur}, plus <strong>{eur(dec(p.initialCapitalEur))}</strong> au départ{/if}, du {dateFr(firstDate)} au
    {dateFr(result.endDate)} ({duration(firstDate, result.endDate)}).
  </p>

  <section class="kpis" aria-label="Chiffres clés">
    <div class="kpi hero">
      <span>Valeur au {dateFr(result.endPriceDate)}</span>
      <strong class="num">{eur(dca.value)}</strong>
      <small class={dca.pnl.gte(0) ? 'gain' : 'loss'}>{eurSigned(dca.pnl)} ({pct(dca.pnlPct)})</small>
    </div>
    <div class="kpi">
      <span>Total investi</span>
      <strong class="num">{eur(dca.invested)}</strong>
      <small class="muted">{integer(dca.purchases)} achat{dca.purchases > 1 ? 's' : ''}, dont {eur(dca.fees)} de frais</small>
    </div>
    <div class="kpi">
      <span>Prix moyen</span>
      <strong class="num">{eurPrice(dca.avgPrice)}</strong>
      <small class="muted">cours final {eurPrice(result.endPrice)}</small>
    </div>
    <div class="kpi">
      <span>Quantité accumulée</span>
      <strong class="num">{qty(dca.quantity)} {p.asset}</strong>
      <small class="muted">achats de {eurPrice(dca.bestPrice)} à {eurPrice(dca.worstPrice)}</small>
    </div>
  </section>

  <section class="compare panel" aria-labelledby="cmp-title">
    <h3 id="cmp-title">DCA ou achat unique ?</h3>
    <p>
      Sur cette période, le DCA a fait <strong>{verdict}</strong> qu’un achat unique de {eur(lump.invested)} le {dateFr(lump.date)} :
      <strong class={result.difference.gte(0) ? 'gain' : 'loss'}>{eurSigned(result.difference)}</strong> de valeur finale, soit
      {pct(diffPct.abs()).replace('+', '')} de la somme investie.
    </p>
    <p class="muted small">
      Le résultat dépend entièrement de la période choisie. Sur un marché qui monte, investir tout au départ fait souvent mieux ; le DCA lisse le point
      d’entrée et réduit le risque d’acheter au plus haut, il n’augmente pas le gain attendu.
    </p>
    <!-- Zone défilante : focusable pour défiler au clavier (WCAG 2.1.1, règle axe scrollable-region-focusable). -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div class="table-wrap" role="region" aria-label="Comparaison DCA et achat unique" tabindex="0">
      <table>
        <thead>
          <tr><th scope="col">Indicateur</th><th scope="col">DCA</th><th scope="col">Achat unique</th></tr>
        </thead>
        <tbody>
          <tr><th scope="row">Total investi</th><td class="num">{eur(dca.invested)}</td><td class="num">{eur(lump.invested)}</td></tr>
          <tr><th scope="row">Frais</th><td class="num">{eur(dca.fees)}</td><td class="num">{eur(lump.fees)}</td></tr>
          <tr><th scope="row">Quantité</th><td class="num">{qty(dca.quantity)}</td><td class="num">{qty(lump.quantity)}</td></tr>
          <tr><th scope="row">Prix moyen</th><td class="num">{eurPrice(dca.avgPrice)}</td><td class="num">{eurPrice(lump.avgPrice)}</td></tr>
          <tr><th scope="row">Valeur finale</th><td class="num">{eur(dca.value)}</td><td class="num">{eur(lump.value)}</td></tr>
          <tr>
            <th scope="row">Plus-value latente</th>
            <td class="num {dca.pnl.gte(0) ? 'gain' : 'loss'}">{eurSigned(dca.pnl)} ({pct(dca.pnlPct)})</td>
            <td class="num {lump.pnl.gte(0) ? 'gain' : 'loss'}">{eurSigned(lump.pnl)} ({pct(lump.pnlPct)})</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>

  <LineChart
    title="Valeur du portefeuille"
    summary={`De ${dateFr(firstDate)} à ${dateFr(result.endDate)} : valeur finale ${eur(dca.value)} en DCA, ${eur(lump.value)} pour l’achat unique, pour ${eur(dca.invested)} investis.`}
    {dates}
    series={valueSeries}
    format={money}
    axisFormat={moneyAxis}
  />

  <LineChart
    title="Prix moyen et cours"
    summary={`Prix moyen final ${eurPrice(dca.avgPrice)}, cours final ${eurPrice(result.endPrice)}.`}
    {dates}
    series={priceSeries}
    format={priceFmt}
    axisFormat={priceAxis}
    zeroBased={false}
  />

  <section class="notes" aria-label="Sources et limites">
    {#if skippedBefore > 0}
      <p class="notice">
        <span
          ><strong>{integer(skippedBefore)} échéance{skippedBefore > 1 ? 's' : ''} sans cours</strong> avant le {dateFr(firstDate)} : aucun achat. {p.asset}
          n’était pas encore coté{info?.noEcb ? ', ou le taux BCE n’est pas disponible dans cette version' : ''}. La simulation commence au premier cours
          connu.</span
        >
      </p>
    {/if}
    {#if skippedAfter > 0}
      <p class="notice"><span><strong>{integer(skippedAfter)} échéance{skippedAfter > 1 ? 's' : ''} sans cours</strong> en cours de période : aucun achat ces jours-là.</span></p>
    {/if}
    <p class="muted small">
      {#if info?.source === 'csv'}
        Cours : fichier {app.csv?.fileName ?? 'importé'}.
      {:else}
        Cours de clôture journaliers Binance (UTC){routeText ? ` : ${routeText}` : ''}.{info?.fromCache ? ' Lus depuis cet appareil, sans appel réseau.' : ''}
      {/if}
      {#if app.form.endMode === 'today' && result.endPriceDate === result.endDate}
        Le cours du jour est le dernier prix connu : la journée n’est pas terminée.
      {/if}
      Simulation sur données passées, pas un conseil en investissement. Aucun impôt n’est dû tant que rien n’est vendu.
    </p>
  </section>
</div>

<style>
  .results {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 1.1rem;
    min-width: 0;
  }
  .lead {
    font-size: 1rem;
  }
  .kpis {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
    gap: 0.75rem;
  }
  .kpi {
    display: grid;
    gap: 0.15rem;
    padding: 0.85rem 1rem;
    background: var(--surface);
    border: 1px solid var(--rule);
    border-radius: var(--radius-lg);
    min-width: 0;
  }
  .kpi span {
    font-size: 0.82rem;
    color: var(--muted);
    font-weight: 550;
  }
  .kpi strong {
    font-size: 1.25rem;
    font-weight: 650;
    overflow-wrap: anywhere;
  }
  .kpi.hero strong {
    font-family: var(--font-doc);
    font-size: 1.7rem;
  }
  .kpi small {
    font-size: 0.82rem;
  }
  .compare {
    padding: 1rem 1.1rem;
    display: grid;
    gap: 0.6rem;
  }
  .compare h3 {
    font-size: 1.05rem;
  }
  .compare table th[scope='row'] {
    text-align: left;
    font-size: 0.9rem;
    font-weight: 500;
    color: var(--ink);
  }
  .small {
    font-size: 0.85rem;
  }
  @media (max-width: 520px) {
    .compare {
      padding-inline: 0.75rem;
    }
    .compare th,
    .compare td {
      padding: 0.5rem 0.35rem;
      font-size: 0.85rem;
    }
  }
  .notes {
    display: grid;
    gap: 0.6rem;
  }
</style>
