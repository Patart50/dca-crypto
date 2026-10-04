<script lang="ts">
  import { app, todayUtc } from '../state/app.svelte';
  import { dateFr, eur, integer } from '../core/format';
  import { D, dec } from '../core/money';
  import { MAX_ASSETS } from '../core/portfolio';

  const weekdays = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
  const days = Array.from({ length: 28 }, (_, i) => String(i + 1));
  let csvErrors = $state<Record<number, string | null>>({});
  let fileInputs = $state<Record<number, HTMLInputElement | undefined>>({});

  const f = $derived(app.form);
  const loading = $derived(app.status === 'loading');
  const multi = $derived(f.assets.length > 1);

  const total = $derived.by(() => {
    let t = new D(0);
    for (const a of f.assets) {
      try {
        const v = dec(a.amount.replace(/\s/g, ''));
        if (v.gt(0)) t = t.plus(v);
      } catch {
        // montant en cours de saisie
      }
    }
    return t;
  });
  const needsBinance = $derived(f.assets.some((a) => ['binance', 'unknown', 'unchecked'].includes(app.check(a.asset))));
  const unchecked = $derived(f.assets.some((a) => app.check(a.asset) === 'unchecked'));

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    await app.run();
    if (app.status === 'done') document.getElementById('resultats')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function onFile(e: Event, id: number, asset: string) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    csvErrors[id] = app.importCsv(asset, file.name, await file.text());
    input.value = '';
  }

  function share(amount: string): string {
    try {
      const v = dec(amount.replace(/\s/g, ''));
      return total.gt(0) && v.gt(0) ? `${v.times(100).dividedBy(total).toDecimalPlaces(0).toString()} %` : '';
    } catch {
      return '';
    }
  }
</script>

<form class="params panel" onsubmit={submit} novalidate>
  <h2>Votre stratégie</h2>

  <fieldset class="assets">
    <legend>Cryptos et montant à chaque achat</legend>
    <datalist id="assets">
      {#each app.assets as a (a)}<option value={a}></option>{/each}
    </datalist>

    {#each f.assets as a, i (a.id)}
      {@const status = app.check(a.asset)}
      {@const csv = app.csv[a.asset.trim().toUpperCase()]}
      <div class="asset-row">
        <div class="cells">
          <label class="field sym">
            <span class:sr-only={i > 0}>Crypto</span>
            <input
              bind:value={a.asset}
              list="assets"
              autocomplete="off"
              autocapitalize="characters"
              spellcheck="false"
              placeholder="BTC, ETH…"
              aria-label={i > 0 ? `Crypto ${i + 1}` : undefined}
              aria-describedby={`status-${a.id}`}
              aria-invalid={status === 'unknown' ? 'true' : undefined}
            />
          </label>
          <label class="field amt">
            <span class:sr-only={i > 0}>Montant</span>
            <div class="suffix">
              <input bind:value={a.amount} inputmode="decimal" aria-label={i > 0 ? `Montant pour la crypto ${i + 1}` : undefined} /><span aria-hidden="true">€</span>
            </div>
          </label>
          <div class="row-actions" class:first={i === 0}>
            <input
              bind:this={fileInputs[a.id]}
              type="file"
              accept=".csv,.txt,text/csv"
              class="sr-only"
              tabindex="-1"
              aria-label={`Fichier de prix pour ${a.asset || `la crypto ${i + 1}`}`}
              onchange={(e) => onFile(e, a.id, a.asset)}
            />
            <button type="button" class="btn btn-small" onclick={() => fileInputs[a.id]?.click()} disabled={!a.asset.trim()} title="Utiliser vos propres cours pour cette crypto">
              Prix CSV
            </button>
            {#if multi}
              <button type="button" class="btn btn-small btn-quiet remove" onclick={() => app.removeAsset(a.id)} aria-label={`Retirer ${a.asset || `la crypto ${i + 1}`}`}>
                <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg>
              </button>
            {/if}
          </div>
        </div>
        <p class="status {status}" id={`status-${a.id}`}>
          {#if status === 'csv' && csv}
            <span class="ok-mark" aria-hidden="true">✓</span> Vos cours : {csv.fileName}, {integer(csv.prices.size)} jours du {dateFr(csv.first!)} au {dateFr(csv.last!)}{csv.errorCount
              ? `, ${csv.errorCount} ligne${csv.errorCount > 1 ? 's' : ''} ignorée${csv.errorCount > 1 ? 's' : ''}`
              : ''}.
            <button type="button" class="link" onclick={() => app.clearCsv(a.asset)}>Utiliser Binance</button>
          {:else if status === 'binance'}
            <span class="ok-mark" aria-hidden="true">✓</span> Coté sur Binance ({app.pairsFor(a.asset).join(', ')}){multi && share(a.amount) ? ` · ${share(a.amount)} de chaque achat` : ''}
          {:else if status === 'unknown'}
            <span aria-hidden="true">✗</span> Introuvable sur Binance (ni {a.asset.trim().toUpperCase()}EUR, ni {a.asset.trim().toUpperCase()}USDT). Vérifiez le symbole ou importez vos prix
            (« Prix CSV »).
          {:else if status === 'unchecked'}
            Vérifié sur Binance au lancement.
          {/if}
        </p>
        {#if csvErrors[a.id]}<p class="error small" role="alert">{csvErrors[a.id]}</p>{/if}
      </div>
    {/each}

    <div class="assets-foot">
      <button type="button" class="btn btn-small" onclick={() => app.addAsset()} disabled={f.assets.length >= MAX_ASSETS}>+ Ajouter une crypto</button>
      {#if unchecked}
        <button type="button" class="btn btn-small btn-quiet" onclick={() => app.verifyOnBinance()} disabled={app.checking}>
          {app.checking ? 'Vérification…' : 'Vérifier sur Binance'}
        </button>
      {/if}
      {#if multi}<span class="total">Total à chaque achat : <strong class="num">{eur(total)}</strong></span>{/if}
    </div>
  </fieldset>

  <div class="grid">
    <fieldset class="field">
      <legend>Fréquence</legend>
      <div class="seg">
        {#each [['daily', 'Quotidienne'], ['weekly', 'Hebdo'], ['monthly', 'Mensuelle']] as [value, label] (value)}
          <label class:on={f.frequency === value}>
            <input type="radio" name="frequency" {value} bind:group={app.form.frequency} />{label}
          </label>
        {/each}
      </div>
      {#if f.frequency === 'weekly'}
        <label class="inline">
          <span>Chaque</span>
          <select bind:value={app.form.weekday}>
            {#each weekdays as w, i (w)}<option value={i + 1}>{w}</option>{/each}
          </select>
        </label>
      {:else if f.frequency === 'monthly'}
        <label class="inline">
          <span>Le</span>
          <select bind:value={app.form.monthDay}>
            {#each days as d (d)}<option value={d}>{d === '1' ? '1er' : d}</option>{/each}
            <option value="last">dernier jour</option>
          </select>
          <span>du mois</span>
        </label>
      {/if}
    </fieldset>

    <label class="field">
      <span>Premier achat à partir du</span>
      <input type="date" bind:value={app.form.start} max={todayUtc()} required />
    </label>

    <fieldset class="field">
      <legend>Jusqu’au</legend>
      <div class="seg">
        <label class:on={f.endMode === 'today'}><input type="radio" name="end" value="today" bind:group={app.form.endMode} />Aujourd’hui</label>
        <label class:on={f.endMode === 'date'}><input type="radio" name="end" value="date" bind:group={app.form.endMode} />Une date</label>
      </div>
      {#if f.endMode === 'date'}
        <input type="date" bind:value={app.form.end} max={todayUtc()} aria-label="Date de fin" />
      {/if}
    </fieldset>

    <div class="field">
      <label for="fee">Frais par achat</label>
      <div class="pair">
        <input id="fee" bind:value={app.form.feeValue} inputmode="decimal" />
        <select bind:value={app.form.feeKind} aria-label="Unité des frais">
          <option value="percent">%</option>
          <option value="fixed">€ par achat</option>
        </select>
      </div>
      <small>Binance au comptant : 0,1 %. Montants frais compris.</small>
    </div>

    <label class="field">
      <span>Capital de départ <em class="muted">(facultatif)</em></span>
      <div class="suffix"><input bind:value={app.form.initial} inputmode="decimal" placeholder="0" /><span aria-hidden="true">€</span></div>
      <small>Investi en plus au premier achat{multi ? ', réparti comme les montants' : ''}.</small>
    </label>
  </div>

  {#if needsBinance}
    <p class="muted small source-note">
      Cours : clôture journalière Binance, convertie en euros (avant 2020 : via l’USDT et le taux de la BCE), gardée sur cet appareil.
      {#if app.settings.allowPriceFetch}
        <button type="button" class="link" onclick={() => app.setConsent(false)}>Retirer l’autorisation d’accès à Binance</button>
      {/if}
    </p>
  {/if}

  {#if app.status === 'consent'}
    <div class="consent" role="region" aria-label="Autorisation d’accès à Binance">
      <p><strong>Utiliser les données publiques de Binance ?</strong></p>
      <p class="muted small">
        C’est la seule fonction qui contacte Internet. Seuls des noms de paires (ex. BTCEUR, BTCUSDT) et des dates sont envoyés à l’API publique de
        Binance : aucun montant, aucun identifiant. Votre adresse IP est visible de Binance, comme pour toute page web. Votre choix est mémorisé.
      </p>
      <div class="actions">
        <button class="btn btn-primary" type="button" onclick={() => app.acceptConsent()}>Autoriser</button>
        <button class="btn" type="button" onclick={() => app.setConsent(false)}>Non merci : j’importerai mes prix</button>
      </div>
    </div>
  {/if}

  {#if app.errors.length > 0 && app.status === 'error'}
    <ul class="errors" role="alert">
      {#each app.errors as e (e)}<li>{e}</li>{/each}
    </ul>
  {/if}

  <div class="submit">
    <button class="btn btn-primary" type="submit" disabled={loading}>
      {loading ? `Chargement des cours${app.progress ? ` : ${app.progress}` : ''}…` : 'Lancer la simulation'}
    </button>
  </div>
</form>

<style>
  .params {
    padding: 1.25rem;
    display: grid;
    gap: 1.1rem;
  }
  h2 {
    font-size: 1.25rem;
  }
  fieldset {
    border: 0;
    margin: 0;
    padding: 0;
    min-width: 0;
  }
  legend,
  .field > label {
    font-size: 0.85rem;
    font-weight: 550;
    padding: 0;
    margin-bottom: 0.3rem;
  }
  .assets {
    display: grid;
    gap: 0.55rem;
  }
  .asset-row {
    display: grid;
    gap: 0.2rem;
  }
  .cells {
    display: grid;
    grid-template-columns: minmax(7rem, 12rem) minmax(6rem, 10rem) auto;
    gap: 0.5rem;
    align-items: end;
  }
  .row-actions {
    display: flex;
    gap: 0.25rem;
    align-items: center;
    padding-bottom: 0.2rem;
  }
  .remove {
    color: var(--muted);
  }
  .status {
    font-size: 0.82rem;
    color: var(--muted);
    min-height: 1.2em;
  }
  .status.binance .ok-mark,
  .status.csv .ok-mark {
    color: var(--gain);
    font-weight: 700;
  }
  .status.unknown {
    color: var(--loss);
  }
  .assets-foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 1rem;
  }
  .total {
    font-size: 0.9rem;
    margin-left: auto;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
    gap: 1rem 1.25rem;
    align-items: start;
    padding-top: 1rem;
    border-top: 1px solid var(--rule);
  }
  fieldset.field {
    display: grid;
    gap: 0.45rem;
  }
  .seg {
    display: inline-flex;
    border: 1px solid var(--rule-strong);
    border-radius: var(--radius);
    overflow: hidden;
    width: fit-content;
    max-width: 100%;
  }
  .seg label {
    position: relative;
    padding: 0.42rem 0.75rem;
    font-size: 0.9rem;
    cursor: pointer;
    white-space: nowrap;
    border-left: 1px solid var(--rule-strong);
  }
  .seg label:first-child {
    border-left: 0;
  }
  .seg label.on {
    background: var(--accent-soft);
    color: var(--ink);
    font-weight: 600;
  }
  .seg input {
    position: absolute;
    opacity: 0;
    inset: 0;
    margin: 0;
    cursor: pointer;
  }
  .seg label:has(input:focus-visible) {
    outline: 2px solid var(--focus);
    outline-offset: -2px;
  }
  .inline {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.9rem;
  }
  .inline select {
    width: auto;
  }
  .suffix {
    position: relative;
  }
  .suffix input {
    padding-right: 2rem;
  }
  .suffix span {
    position: absolute;
    right: 0.7rem;
    top: 50%;
    transform: translateY(-50%);
    color: var(--muted);
  }
  .pair {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 0.4rem;
  }
  .pair select {
    width: auto;
  }
  .small {
    font-size: 0.85rem;
  }
  .link {
    font: inherit;
    background: none;
    border: 0;
    padding: 0;
    color: var(--accent);
    text-decoration: underline;
    cursor: pointer;
  }
  .error,
  .errors {
    color: var(--loss);
  }
  .errors {
    margin: 0;
    padding-left: 1.2rem;
  }
  .consent {
    display: grid;
    gap: 0.5rem;
    padding: 0.9rem 1rem;
    border-radius: var(--radius);
    background: var(--accent-soft);
    border-left: 3px solid var(--accent);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 0.3rem;
  }
  .submit {
    display: flex;
    justify-content: flex-end;
  }
  @media (max-width: 520px) {
    .cells {
      grid-template-columns: 1fr 1fr;
    }
    .row-actions {
      grid-column: 1 / -1;
      padding-bottom: 0;
    }
    .row-actions.first {
      margin-top: 0.1rem;
    }
    .total {
      margin-left: 0;
    }
    .submit .btn {
      width: 100%;
      justify-content: center;
    }
  }
</style>
