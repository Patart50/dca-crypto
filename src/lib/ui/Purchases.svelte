<script lang="ts">
  import { dateFr, eur, eurPrice, integer, qty } from '../core/format';
  import type { PortfolioResult } from '../core/portfolio';

  let { result }: { result: PortfolioResult } = $props();

  const PAGE = 100;
  let shown = $state(PAGE);
  let newestFirst = $state(true);
  let filter = $state('');
  const multi = $derived(result.assets.length > 1);
  const filtered = $derived(filter ? result.purchases.filter((p) => p.asset === filter) : result.purchases);
  const rows = $derived(newestFirst ? [...filtered].reverse() : filtered);
  const visible = $derived(rows.slice(0, shown));
  const extremes = $derived(new Map(result.assets.map((a) => [a.asset, { best: a.result.dca.bestPrice, worst: a.result.dca.worstPrice }])));
  const skipped = $derived(result.assets.flatMap((a) => a.result.skipped.map((d) => ({ asset: a.asset, date: d }))));
</script>

<section class="purchases" aria-labelledby="purchases-title">
  <div class="head">
    <h3 id="purchases-title">{integer(filtered.length)} achat{filtered.length > 1 ? 's' : ''} simulé{filtered.length > 1 ? 's' : ''}</h3>
    {#if multi}
      <label class="filter">
        <span>Crypto</span>
        <select bind:value={filter} onchange={() => (shown = PAGE)}>
          <option value="">Toutes</option>
          {#each result.assets as a (a.asset)}<option value={a.asset}>{a.asset}</option>{/each}
        </select>
      </label>
    {/if}
    <button class="btn btn-small" type="button" onclick={() => (newestFirst = !newestFirst)}>
      {newestFirst ? 'Du plus ancien au plus récent' : 'Du plus récent au plus ancien'}
    </button>
  </div>

  <!-- Zone défilante : focusable pour défiler au clavier (WCAG 2.1.1, règle axe scrollable-region-focusable). -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div class="table-wrap panel" role="region" aria-labelledby="purchases-title" tabindex="0">
    <table>
      <thead>
        <tr>
          <th scope="col">Date</th>
          {#if multi}<th scope="col" class="left">Crypto</th>{/if}
          <th scope="col">Décaissé</th>
          <th scope="col">Frais</th>
          <th scope="col">Cours</th>
          <th scope="col">Quantité</th>
          <th scope="col">Total investi</th>
          <th scope="col">Prix moyen</th>
        </tr>
      </thead>
      <tbody>
        {#each visible as p (p.date + p.asset + p.kind)}
          {@const x = extremes.get(p.asset)}
          <tr>
            <td>
              {dateFr(p.date)}
              {#if p.kind === 'initial'}<span class="tag">capital de départ</span>{/if}
            </td>
            {#if multi}<td class="left asset">{p.asset}</td>{/if}
            <td class="num">{eur(p.amountEur)}</td>
            <td class="num">{eur(p.feeEur)}</td>
            <td class="num">
              {eurPrice(p.price)}
              {#if x && p.price.eq(x.best)}<span class="tag gain">plus bas</span>{:else if x && p.price.eq(x.worst)}<span class="tag loss">plus haut</span>{/if}
            </td>
            <td class="num">{qty(p.quantity)}</td>
            <td class="num">{eur(p.cumInvested)}</td>
            <td class="num">{eurPrice(p.avgPrice)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  {#if shown < rows.length}
    <button class="btn more" type="button" onclick={() => (shown += PAGE * 5)}>
      Afficher plus ({integer(rows.length - shown)} restant{rows.length - shown > 1 ? 's' : ''})
    </button>
  {/if}

  {#if skipped.length > 0}
    <details>
      <summary>{integer(skipped.length)} échéance{skipped.length > 1 ? 's' : ''} sans cours, sans achat</summary>
      <p class="muted small">
        {skipped
          .slice(0, 200)
          .map((s) => (multi ? `${s.asset} ${dateFr(s.date)}` : dateFr(s.date)))
          .join(', ')}{skipped.length > 200 ? '…' : ''}
      </p>
    </details>
  {/if}
</section>

<style>
  .purchases {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 0.75rem;
    min-width: 0;
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  h3 {
    font-size: 1.05rem;
  }
  .table-wrap {
    max-height: 70vh;
    overflow: auto;
  }
  thead th {
    position: sticky;
    top: 0;
    background: var(--surface);
    z-index: 1;
  }
  td {
    white-space: nowrap;
  }
  .left {
    text-align: left;
  }
  .asset {
    font-weight: 600;
  }
  .filter {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.9rem;
    margin-right: auto;
  }
  .filter select {
    width: auto;
  }
  .tag {
    display: inline-block;
    margin-left: 0.35rem;
    font-size: 0.72rem;
    padding: 0 0.35rem;
    border-radius: 999px;
    background: var(--surface-2);
    border: 1px solid var(--rule);
    color: var(--muted);
  }
  .tag.gain {
    color: var(--gain);
  }
  .tag.loss {
    color: var(--loss);
  }
  .more {
    justify-self: center;
  }
  .small {
    font-size: 0.85rem;
  }
  summary {
    cursor: pointer;
    font-size: 0.9rem;
  }
</style>
