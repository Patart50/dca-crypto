<script lang="ts">
  import { app } from '../state/app.svelte';
  import { dateFr, duration, eur, eurPrice, eurRound, eurSigned, integer, pct, qty } from '../core/format';
  import { D, dec, ZERO } from '../core/money';
  import type { PortfolioResult } from '../core/portfolio';
  import LineChart, { type ChartSeries } from './LineChart.svelte';

  let { result }: { result: PortfolioResult } = $props();

  const weekdays = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
  const p = $derived(result.params);
  const dca = $derived(result.dca);
  const lump = $derived(result.lumpSum);
  const multi = $derived(result.assets.length > 1);
  const single = $derived(result.assets[0].result);
  const info = $derived(app.priceInfo);

  let selected = $state(0);
  const chosen = $derived(result.assets[Math.min(selected, result.assets.length - 1)]);

  const rhythm = $derived.by(() => {
    const f = p.frequency;
    if (f.kind === 'daily') return 'chaque jour';
    if (f.kind === 'weekly') return `chaque ${weekdays[f.weekday - 1]}`;
    return f.day === 'last' ? 'le dernier jour de chaque mois' : `le ${f.day === 1 ? '1er' : f.day} de chaque mois`;
  });

  const diffPct = $derived(dca.invested.isZero() ? new D(0) : result.difference.times(100).dividedBy(dca.invested));
  const verdict = $derived(result.difference.gt(0) ? 'mieux' : result.difference.lt(0) ? 'moins bien' : 'aussi bien');

  // Points des graphiques : 700 au plus (le dernier jour est toujours gardé).
  function sample<T>(t: T[]): T[] {
    const step = Math.max(1, Math.ceil(t.length / 700));
    return t.filter((_, i) => i % step === 0 || i === t.length - 1);
  }
  const portfolioPoints = $derived(sample(result.timeline));
  const valueSeries = $derived<ChartSeries[]>([
    { id: 'dca', label: 'Valeur DCA', color: '--series-1', values: portfolioPoints.map((t) => t.value.toNumber()) },
    { id: 'lump', label: 'Achat unique', color: '--series-2', values: portfolioPoints.map((t) => t.lumpValue.toNumber()) },
    { id: 'invested', label: 'Total investi', color: '--series-muted', dashed: true, values: portfolioPoints.map((t) => t.invested.toNumber()) },
  ]);
  const assetPoints = $derived(sample(chosen.result.timeline));
  const priceSeries = $derived<ChartSeries[]>([
    { id: 'avg', label: 'Prix moyen', color: '--series-1', values: assetPoints.map((t) => t.avgPrice.toNumber()) },
    { id: 'price', label: `Cours ${chosen.asset}`, color: '--series-2', values: assetPoints.map((t) => t.price.toNumber()) },
  ]);
  const money = (v: number) => eur(dec(v.toFixed(2)));
  const moneyAxis = (v: number) => (Math.abs(v) >= 1e6 ? `${(v / 1e6).toLocaleString('fr-FR')} M€` : eurRound(dec(String(v))));
  const priceFmt = (v: number) => eurPrice(dec(v.toPrecision(10)));
  const priceAxis = (v: number) => (v === 0 || Math.abs(v) >= 100 ? moneyAxis(v) : eurPrice(dec(v.toPrecision(6))));

  const amountsText = $derived(result.assets.map((a) => `${a.asset} ${eur(dec(a.result.params.amountEur))}`).join(', '));

  function routeText(asset: string): string {
    const i = info?.byAsset[asset];
    if (!i) return '';
    if (i.source === 'csv') return `${asset} : vos cours (${i.fileName ?? 'fichier importé'})`;
    const r = i.routes;
    const parts: string[] = [];
    if (r?.EUR) parts.push(`${integer(r.EUR)} j. via ${asset}EUR`);
    if (r?.['USDT/EURUSDT']) parts.push(`${integer(r['USDT/EURUSDT'])} j. via ${asset === 'USDT' ? 'EURUSDT' : `${asset}USDT ÷ EURUSDT`}`);
    if (r?.['USDT/BCE']) parts.push(`${integer(r['USDT/BCE'])} j. via ${asset === 'USDT' ? 'USDT' : `${asset}USDT`} et le taux EUR/USD de la BCE`);
    return `${asset} : ${parts.join(' · ') || 'Binance'}${i.fromCache ? ' (lus sur cet appareil)' : ''}`;
  }

  const skipped = $derived(
    result.assets
      .map((a) => {
        const first = a.result.purchases[0].date;
        const before = a.result.skipped.filter((d) => d < first).length;
        return { asset: a.asset, first, before, after: a.result.skipped.length - before };
      })
      .filter((s) => s.before > 0 || s.after > 0),
  );
  const totalValue = $derived(dca.value.isZero() ? ZERO : dca.value);
</script>

<div class="results">
  <p class="lead">
    {#if multi}
      <strong>{eur(result.amountPerPeriod)}</strong> {rhythm} ({amountsText}){#if p.initialCapitalEur}, plus <strong>{eur(dec(p.initialCapitalEur))}</strong> au départ{/if},
    {:else}
      <strong>{eur(dec(single.params.amountEur))}</strong> de <strong>{single.params.asset}</strong>
      {rhythm}{#if p.initialCapitalEur}, plus <strong>{eur(dec(p.initialCapitalEur))}</strong> au départ{/if},
    {/if}
    du {dateFr(result.firstDate)} au {dateFr(result.endDate)} ({duration(result.firstDate, result.endDate)}).
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
    {#if multi}
      {@const best = [...result.assets].sort((a, b) => b.result.dca.pnlPct.comparedTo(a.result.dca.pnlPct))[0]}
      {@const worst = [...result.assets].sort((a, b) => a.result.dca.pnlPct.comparedTo(b.result.dca.pnlPct))[0]}
      <div class="kpi">
        <span>Meilleure crypto</span>
        <strong class="num">{best.asset}</strong>
        <small class={best.result.dca.pnl.gte(0) ? 'gain' : 'loss'}>{pct(best.result.dca.pnlPct)}</small>
      </div>
      <div class="kpi">
        <span>Moins bonne crypto</span>
        <strong class="num">{worst.asset}</strong>
        <small class={worst.result.dca.pnl.gte(0) ? 'gain' : 'loss'}>{pct(worst.result.dca.pnlPct)}</small>
      </div>
    {:else}
      <div class="kpi">
        <span>Prix moyen</span>
        <strong class="num">{eurPrice(single.dca.avgPrice)}</strong>
        <small class="muted">cours final {eurPrice(single.endPrice)}</small>
      </div>
      <div class="kpi">
        <span>Quantité accumulée</span>
        <strong class="num">{qty(single.dca.quantity)} {single.params.asset}</strong>
        <small class="muted">achats de {eurPrice(single.dca.bestPrice)} à {eurPrice(single.dca.worstPrice)}</small>
      </div>
    {/if}
  </section>

  {#if multi}
    <section class="panel by-asset" aria-labelledby="assets-title">
      <h3 id="assets-title">Par crypto</h3>
      <!-- Zone défilante : focusable pour défiler au clavier (WCAG 2.1.1, règle axe scrollable-region-focusable). -->
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <div class="table-wrap" role="region" aria-labelledby="assets-title" tabindex="0">
        <table>
          <thead>
            <tr>
              <th scope="col">Crypto</th>
              <th scope="col">Par achat</th>
              <th scope="col">Investi</th>
              <th scope="col">Quantité</th>
              <th scope="col">Prix moyen</th>
              <th scope="col">Cours final</th>
              <th scope="col">Valeur</th>
              <th scope="col">Plus-value</th>
              <th scope="col">Part</th>
            </tr>
          </thead>
          <tbody>
            {#each result.assets as a (a.asset)}
              {@const r = a.result}
              <tr>
                <th scope="row">{a.asset}</th>
                <td class="num">{eur(dec(r.params.amountEur))}</td>
                <td class="num">{eur(r.dca.invested)}</td>
                <td class="num">{qty(r.dca.quantity)}</td>
                <td class="num">{eurPrice(r.dca.avgPrice)}</td>
                <td class="num">{eurPrice(r.endPrice)}</td>
                <td class="num">{eur(r.dca.value)}</td>
                <td class="num {r.dca.pnl.gte(0) ? 'gain' : 'loss'}">{eurSigned(r.dca.pnl)} ({pct(r.dca.pnlPct)})</td>
                <td class="num">{totalValue.isZero() ? '—' : `${r.dca.value.times(100).dividedBy(totalValue).toDecimalPlaces(1).toString().replace('.', ',')} %`}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>
  {/if}

  <section class="compare panel" aria-labelledby="cmp-title">
    <h3 id="cmp-title">DCA ou achat unique ?</h3>
    <p>
      Sur cette période, le DCA a fait <strong>{verdict}</strong> qu’un achat unique de {eur(lump.invested)}
      {#if multi}(chaque crypto achetée en une fois à sa première date){:else}le {dateFr(single.lumpSum.date)}{/if} :
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
          {#if !multi}
            <tr><th scope="row">Quantité</th><td class="num">{qty(single.dca.quantity)}</td><td class="num">{qty(single.lumpSum.quantity)}</td></tr>
            <tr><th scope="row">Prix moyen</th><td class="num">{eurPrice(single.dca.avgPrice)}</td><td class="num">{eurPrice(single.lumpSum.avgPrice)}</td></tr>
          {/if}
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
    title={multi ? 'Valeur du portefeuille (toutes cryptos)' : 'Valeur du portefeuille'}
    summary={`De ${dateFr(result.firstDate)} à ${dateFr(result.endDate)} : valeur finale ${eur(dca.value)} en DCA, ${eur(lump.value)} pour l’achat unique, pour ${eur(dca.invested)} investis.`}
    dates={portfolioPoints.map((t) => t.date)}
    series={valueSeries}
    format={money}
    axisFormat={moneyAxis}
  />

  <div class="price-chart">
    {#if multi}
      <label class="pick">
        <span>Prix moyen et cours de</span>
        <select bind:value={selected}>
          {#each result.assets as a, i (a.asset)}<option value={i}>{a.asset}</option>{/each}
        </select>
      </label>
    {/if}
    <LineChart
      title={multi ? `Prix moyen et cours : ${chosen.asset}` : 'Prix moyen et cours'}
      summary={`Prix moyen final ${eurPrice(chosen.result.dca.avgPrice)}, cours final ${eurPrice(chosen.result.endPrice)}.`}
      dates={assetPoints.map((t) => t.date)}
      series={priceSeries}
      format={priceFmt}
      axisFormat={priceAxis}
      zeroBased={false}
    />
  </div>

  <section class="notes" aria-label="Sources et limites">
    {#each skipped as s (s.asset)}
      {#if s.before > 0}
        <p class="notice">
          <span
            ><strong>{s.asset} : {integer(s.before)} échéance{s.before > 1 ? 's' : ''} sans cours</strong> avant le {dateFr(s.first)}, sans achat. La crypto n’était pas
            encore cotée{info?.noEcb ? ', ou le taux BCE n’est pas disponible dans cette version' : ''} : ses achats commencent au premier cours connu.</span
          >
        </p>
      {/if}
      {#if s.after > 0}
        <p class="notice"><span><strong>{s.asset} : {integer(s.after)} échéance{s.after > 1 ? 's' : ''} sans cours</strong> en cours de période, sans achat.</span></p>
      {/if}
    {/each}
    <p class="muted small">
      Cours de clôture journaliers (UTC). {result.assets.map((a) => routeText(a.asset)).join(' ; ')}.
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
  .compare,
  .by-asset {
    padding: 1rem 1.1rem;
    display: grid;
    gap: 0.6rem;
    min-width: 0;
  }
  h3 {
    font-size: 1.05rem;
  }
  table th[scope='row'] {
    text-align: left;
    font-size: 0.9rem;
    font-weight: 500;
    color: var(--ink);
  }
  .by-asset th[scope='row'] {
    font-weight: 650;
  }
  .by-asset td {
    white-space: nowrap;
  }
  .price-chart {
    display: grid;
    gap: 0.5rem;
    min-width: 0;
  }
  .pick {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.9rem;
    font-weight: 550;
  }
  .pick select {
    width: auto;
  }
  .small {
    font-size: 0.85rem;
  }
  @media (max-width: 520px) {
    .compare,
    .by-asset {
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
