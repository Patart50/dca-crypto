<script lang="ts">
  import { app, todayUtc } from '../state/app.svelte';
  import { dateFr, integer } from '../core/format';

  const weekdays = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
  const days = Array.from({ length: 28 }, (_, i) => String(i + 1));
  let csvError = $state<string | null>(null);
  let fileInput: HTMLInputElement | undefined = $state();

  const f = $derived(app.form);
  const loading = $derived(app.status === 'loading');

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    await app.run();
    if (app.status === 'done') document.getElementById('resultats')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function accept() {
    app.setConsent(true);
    await app.run();
  }

  async function onFile(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    csvError = app.importCsv(file.name, await file.text());
    input.value = '';
  }
</script>

<form class="params panel" onsubmit={submit} novalidate>
  <h2>Votre stratégie</h2>

  <div class="grid">
    <label class="field">
      <span>{f.source === 'csv' ? 'Nom de l’actif' : 'Actif'}</span>
      <input bind:value={app.form.asset} list="assets" autocomplete="off" autocapitalize="characters" spellcheck="false" required />
      <datalist id="assets">
        {#each app.assets as a (a)}<option value={a}></option>{/each}
      </datalist>
      <small>{f.source === 'csv' ? 'Utilisé pour l’export vers pmpa-crypto.' : 'Symbole Binance : BTC, ETH, SOL…'}</small>
    </label>

    <label class="field">
      <span>Montant par achat</span>
      <div class="suffix"><input bind:value={app.form.amount} inputmode="decimal" required /><span aria-hidden="true">€</span></div>
      <small>Frais compris.</small>
    </label>

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
      <small>Binance au comptant : 0,1 %.</small>
    </div>

    <label class="field">
      <span>Capital de départ <em class="muted">(facultatif)</em></span>
      <div class="suffix"><input bind:value={app.form.initial} inputmode="decimal" placeholder="0" /><span aria-hidden="true">€</span></div>
      <small>Investi en plus, au premier achat.</small>
    </label>
  </div>

  <fieldset class="source">
    <legend>Cours historiques</legend>
    <div class="seg">
      <label class:on={f.source === 'binance'}><input type="radio" name="source" value="binance" bind:group={app.form.source} />Binance</label>
      <label class:on={f.source === 'csv'}><input type="radio" name="source" value="csv" bind:group={app.form.source} />Mon fichier CSV</label>
    </div>

    {#if f.source === 'binance'}
      <p class="muted small">
        Clôture journalière, convertie en euros (avant 2020 : via l’USDT et le taux de la BCE). Les cours chargés sont gardés sur cet appareil.
        {#if app.settings.allowPriceFetch}
          <button type="button" class="link" onclick={() => app.setConsent(false)}>Retirer l’autorisation d’accès à Binance</button>
        {/if}
      </p>
    {:else}
      <div class="csv">
        <input bind:this={fileInput} type="file" accept=".csv,.txt,text/csv" onchange={onFile} class="sr-only" id="price-file" tabindex="-1" aria-label="Fichier de prix" />
        <button type="button" class="btn" onclick={() => fileInput?.click()}>{app.csv ? 'Remplacer le fichier' : 'Choisir un fichier de prix'}</button>
        {#if app.csv}
          <p class="small">
            <strong>{app.csv.fileName}</strong> : {integer(app.csv.prices.size)} cours, du {dateFr(app.csv.first!)} au {dateFr(app.csv.last!)}.
            {#if app.csv.errorCount > 0}<span class="warn-text">{app.csv.errorCount} ligne{app.csv.errorCount > 1 ? 's' : ''} illisible{app.csv.errorCount > 1 ? 's' : ''} ignorée{app.csv.errorCount > 1 ? 's' : ''}.</span>{/if}
            <button type="button" class="link" onclick={() => app.clearCsv()}>Retirer</button>
          </p>
        {:else}
          <p class="muted small">Deux colonnes, date et prix en euros (ou un historique avec une colonne « close »). Rien n’est envoyé : le fichier est lu dans le navigateur.</p>
        {/if}
        {#if csvError}<p class="error small" role="alert">{csvError}</p>{/if}
      </div>
    {/if}
  </fieldset>

  {#if app.status === 'consent'}
    <div class="consent" role="region" aria-label="Autorisation d’accès à Binance">
      <p><strong>Charger les cours depuis Binance ?</strong></p>
      <p class="muted small">
        C’est la seule fonction qui contacte Internet. Seuls des noms de paires (ex. BTCEUR, BTCUSDT) et des dates sont envoyés à l’API publique de
        Binance : aucun montant, aucun identifiant. Votre adresse IP est visible de Binance, comme pour toute page web. Votre choix est mémorisé.
      </p>
      <div class="actions">
        <button class="btn btn-primary" type="button" onclick={accept}>Autoriser et lancer</button>
        <button class="btn" type="button" onclick={() => (app.form.source = 'csv')}>Utiliser un fichier à la place</button>
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
      {loading ? 'Chargement des cours…' : 'Lancer la simulation'}
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
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
    gap: 1rem 1.25rem;
    align-items: start;
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
  .source {
    display: grid;
    gap: 0.6rem;
    padding-top: 1rem;
    border-top: 1px solid var(--rule);
  }
  .csv {
    display: grid;
    gap: 0.5rem;
    justify-items: start;
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
  .warn-text {
    color: var(--warn);
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
    .submit .btn {
      width: 100%;
      justify-content: center;
    }
  }
</style>
