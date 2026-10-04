<script lang="ts">
  import { onMount } from 'svelte';
  import { app } from './lib/state/app.svelte';
  import ParamsForm from './lib/ui/ParamsForm.svelte';
  import Results from './lib/ui/Results.svelte';
  import Purchases from './lib/ui/Purchases.svelte';
  import ExportPanel from './lib/ui/ExportPanel.svelte';
  import ThemeToggle from './lib/ui/ThemeToggle.svelte';
  import Support from './lib/ui/Support.svelte';
  import { AUTHOR } from './lib/support';

  const tabs = [
    { id: 'synthese', label: 'Synthèse' },
    { id: 'achats', label: 'Achats' },
    { id: 'export', label: 'Export' },
  ] as const;
  type TabId = (typeof tabs)[number]['id'];
  let tab = $state<TabId>('synthese');

  let backupInput: HTMLInputElement | undefined = $state();
  let backupError = $state<string | null>(null);

  onMount(() => app.init());

  // Le formulaire est gardé sur l'appareil à chaque modification.
  $effect(() => {
    JSON.stringify(app.form);
    app.saveForm();
  });

  $effect(() => {
    const theme = app.settings.theme;
    if (theme === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
  });

  function onTabKey(e: KeyboardEvent, index: number) {
    const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = tabs[(index + delta + tabs.length) % tabs.length];
    tab = next.id;
    document.getElementById(`tab-${next.id}`)?.focus();
  }

  async function onBackup(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    backupError = await app.openBackup(file.name, await file.text());
    input.value = '';
  }
</script>

<header class="top">
  <div class="top-inner">
    <div class="brand">
      <a class="brand-name" href="./" aria-label="dca-crypto, accueil">dca-crypto</a>
      <span class="brand-tag"
        ><span class="tagline">Simulateur d’achats réguliers en crypto ·&nbsp;</span>par
        <a href={AUTHOR.url} target="_blank" rel="noopener author">{AUTHOR.name} ({AUTHOR.handle})</a></span
      >
    </div>
    <div class="top-actions">
      <span class="local" title="Aucune donnée n'est envoyée sur Internet, hors cours Binance si vous l'autorisez">
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"
          ><path d="M8 1.5 2.5 3.8v3.7c0 3.2 2.3 6 5.5 7 3.2-1 5.5-3.8 5.5-7V3.8L8 1.5Z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" /></svg
        >
        {app.persistent ? 'Sur cet appareil' : 'Non sauvegardé'}
      </span>
      <ThemeToggle />
    </div>
  </div>
</header>

<main>
  {#if !app.persistent}
    <p class="notice" role="status">
      <span><strong>Stockage indisponible.</strong> Ce navigateur bloque le stockage local (navigation privée ?) : vos réglages et les cours chargés seront perdus à la fermeture.</span>
    </p>
  {/if}

  <ParamsForm />

  {#if app.result}
    <section id="resultats" class="out" aria-labelledby="res-title" class:stale={app.status === 'loading'}>
      <div class="out-head">
        <h2 id="res-title">Résultats</h2>
        <div class="tabs" role="tablist" aria-label="Vues des résultats">
          {#each tabs as t, i (t.id)}
            <button
              id={`tab-${t.id}`}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              aria-controls={`panel-${t.id}`}
              tabindex={tab === t.id ? 0 : -1}
              onclick={() => (tab = t.id)}
              onkeydown={(e) => onTabKey(e, i)}
            >
              {t.label}
              {#if t.id === 'achats'}<span class="count num">{app.result.purchases.length}</span>{/if}
            </button>
          {/each}
        </div>
      </div>
      <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} tabindex="-1">
        {#if tab === 'synthese'}
          <Results result={app.result} />
        {:else if tab === 'achats'}
          <Purchases result={app.result} />
        {:else}
          <ExportPanel result={app.result} />
        {/if}
      </div>
    </section>
  {:else if app.status !== 'loading'}
    <section class="empty" aria-label="Pour commencer">
      <p>
        Choisissez une ou plusieurs cryptos, un montant pour chacune et un rythme, puis lancez la simulation : vous verrez ce que vos achats réguliers auraient donné, comparés à un
        achat unique au départ.
      </p>
      <p class="muted">
        Vous avez une sauvegarde ?
        <input bind:this={backupInput} type="file" accept=".json,application/json" class="sr-only" onchange={onBackup} tabindex="-1" aria-label="Fichier de sauvegarde" />
        <button type="button" class="link" onclick={() => backupInput?.click()}>Ouvrir une simulation sauvegardée</button>
      </p>
      {#if backupError}<p class="loss" role="alert">{backupError}</p>{/if}
    </section>
  {/if}
</main>

<footer class="foot">
  <p>
    Simulation sur données passées, pas un conseil en investissement. Pour la fiscalité, exportez vers
    <a href="https://patart50.github.io/pmpa-crypto/" target="_blank" rel="noopener">pmpa-crypto</a>. Code source libre (AGPL-3.0) sur
    <a href="https://github.com/Patart50/dca-crypto" rel="noopener" target="_blank">GitHub</a> · Taux de change © BCE · v{__APP_VERSION__}
  </p>
  <p class="credit">
    Créé par <a href={AUTHOR.url} target="_blank" rel="noopener author">{AUTHOR.name} ({AUTHOR.handle})</a> · <Support />
  </p>
</footer>

{#if app.toast}
  <div class="toast" role="status" aria-live="polite">{app.toast}</div>
{/if}

<style>
  .top {
    background: var(--surface);
    border-bottom: 1px solid var(--rule);
  }
  .top-inner,
  main,
  .foot {
    max-width: 74rem;
    margin: 0 auto;
    padding-inline: 1rem;
  }
  .top-inner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding-block: 0.9rem;
  }
  .brand {
    display: grid;
  }
  .brand-name {
    text-decoration: none;
    color: var(--ink);
    width: fit-content;
    font-family: var(--font-doc);
    font-size: 1.45rem;
    font-weight: 650;
    letter-spacing: -0.01em;
  }
  .brand-tag {
    font-size: 0.82rem;
    color: var(--muted);
  }
  .top-actions {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .local {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.82rem;
    color: var(--gain);
    padding-inline: 0.4rem;
  }
  main {
    padding-block: 1.5rem 3rem;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 1.5rem;
    min-width: 0;
  }
  .out {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 1rem;
    min-width: 0;
    scroll-margin-top: 1rem;
    transition: opacity 0.2s;
  }
  .out.stale {
    opacity: 0.55;
  }
  .out-head {
    display: flex;
    align-items: end;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 0.5rem 1rem;
    border-bottom: 1px solid var(--rule);
  }
  .out-head h2 {
    font-size: 1.35rem;
    padding-bottom: 0.5rem;
  }
  .tabs {
    display: flex;
    gap: 0.15rem;
    overflow-x: auto;
    max-width: 100%;
  }
  .tabs button {
    font: inherit;
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    background: none;
    border: 0;
    border-bottom: 2px solid transparent;
    padding: 0.5rem 0.75rem 0.6rem;
    color: var(--muted);
    font-weight: 550;
    cursor: pointer;
    white-space: nowrap;
  }
  .tabs button:hover {
    color: var(--ink);
  }
  .tabs button[aria-selected='true'] {
    color: var(--ink);
    border-bottom-color: var(--accent);
  }
  [role='tabpanel']:focus {
    outline: none;
  }
  .count {
    font-size: 0.75rem;
    min-width: 1.4rem;
    text-align: center;
    padding: 0 0.35rem;
    border-radius: 999px;
    background: var(--surface-2);
    border: 1px solid var(--rule);
    color: var(--muted);
  }
  .empty {
    display: grid;
    gap: 0.5rem;
    padding: 1.5rem 0;
    max-width: 44rem;
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
  .foot {
    padding-block: 0 2.5rem;
    font-size: 0.82rem;
    color: var(--muted);
  }
  .foot p:first-child {
    border-top: 1px solid var(--rule);
    padding-top: 1.5rem;
  }
  .credit {
    margin-top: 0.4rem;
  }
  .toast {
    position: fixed;
    left: 50%;
    bottom: 1.25rem;
    transform: translateX(-50%);
    background: var(--ink);
    color: var(--paper);
    padding: 0.6rem 1rem;
    border-radius: var(--radius);
    box-shadow: var(--shadow-pop);
    font-size: 0.92rem;
    z-index: 50;
    max-width: calc(100vw - 2rem);
  }
  @media (max-width: 640px) {
    .tagline,
    .local {
      display: none;
    }
  }
</style>
