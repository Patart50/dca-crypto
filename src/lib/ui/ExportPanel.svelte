<script lang="ts">
  import { app } from '../state/app.svelte';
  import type { SimulationResult } from '../core/simulate';
  import { pmpaCsv } from '../export/pmpa';
  import { purchasesCsv, summaryCsv } from '../export/results';

  let { result }: { result: SimulationResult } = $props();

  let backupInput: HTMLInputElement | undefined = $state();
  let backupError = $state<string | null>(null);

  const stem = $derived(`dca-${result.params.asset.toLowerCase()}-${result.params.start}-${result.endDate}`);

  function download(name: string, content: string, type: string) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function saveJson() {
    const json = app.backupJson();
    if (json) download(`${stem}.json`, json, 'application/json');
  }

  async function onBackup(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    backupError = await app.openBackup(file.name, await file.text());
    input.value = '';
    if (!backupError) app.notify('Simulation rouverte.');
  }
</script>

<section class="export" aria-label="Export et sauvegarde">
  <div class="card panel">
    <h3>Vers pmpa-crypto</h3>
    <p>
      Une ligne d’achat par achat simulé, au format d’import de <a href="https://patart50.github.io/pmpa-crypto/" target="_blank" rel="noopener">pmpa-crypto</a>.
      Importez le fichier dans l’onglet Transactions pour suivre ce portefeuille fictif ou simuler l’impôt d’une vente.
    </p>
    <p class="muted small">Plateforme « Simulation dca-crypto ». Réexporter la même simulation n’ajoute pas de doublon à l’import.</p>
    <button class="btn btn-primary" type="button" onclick={() => download(`${stem}-pmpa.csv`, pmpaCsv(result), 'text/csv;charset=utf-8')}>
      Exporter pour pmpa-crypto (CSV)
    </button>
  </div>

  <div class="card panel">
    <h3>Pour un tableur</h3>
    <p>Séparateur point-virgule et virgule décimale : le fichier s’ouvre directement dans Excel ou LibreOffice.</p>
    <div class="row">
      <button class="btn" type="button" onclick={() => download(`${stem}-achats.csv`, purchasesCsv(result), 'text/csv;charset=utf-8')}>Tableau des achats</button>
      <button class="btn" type="button" onclick={() => download(`${stem}-synthese.csv`, summaryCsv(result), 'text/csv;charset=utf-8')}>Synthèse</button>
    </div>
  </div>

  <div class="card panel">
    <h3>Sauvegarde</h3>
    <p>Un fichier JSON avec les paramètres et les cours utilisés : il se rouvre et se recalcule hors ligne, sur n’importe quel appareil.</p>
    <div class="row">
      <button class="btn" type="button" onclick={saveJson}>Sauvegarder la simulation</button>
      <input bind:this={backupInput} type="file" accept=".json,application/json" class="sr-only" onchange={onBackup} id="backup-file" tabindex="-1" aria-label="Fichier de sauvegarde" />
      <button class="btn" type="button" onclick={() => backupInput?.click()}>Ouvrir une sauvegarde</button>
    </div>
    {#if backupError}<p class="error small" role="alert">{backupError}</p>{/if}
  </div>
</section>

<style>
  .export {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(17rem, 1fr));
    gap: 0.9rem;
  }
  .card {
    padding: 1rem 1.1rem;
    display: grid;
    gap: 0.6rem;
    align-content: start;
  }
  h3 {
    font-size: 1.05rem;
  }
  .card > .btn {
    justify-self: start;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .small {
    font-size: 0.85rem;
  }
  .error {
    color: var(--loss);
  }
</style>
