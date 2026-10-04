<!--
  Graphique en courbes, SVG maison (D-006). Un seul axe vertical, zéro inclus
  si demandé, réticule et info-bulle au survol comme au clavier, légende
  toujours présente et étiquettes en bout de courbe quand la place le permet.
  Les valeurs sont des `number` : affichage seulement, jamais de calcul.
-->
<script lang="ts">
  import { dateFr, monthYear } from '../core/format';

  export interface ChartSeries {
    id: string;
    label: string;
    values: number[];
    /** Variable CSS de la couleur, ex. « --series-1 ». */
    color: string;
    dashed?: boolean;
  }

  interface Props {
    title: string;
    /** Phrase qui résume le graphique pour les lecteurs d'écran. */
    summary: string;
    dates: string[];
    series: ChartSeries[];
    format: (v: number) => string;
    axisFormat: (v: number) => string;
    zeroBased?: boolean;
  }

  let { title, summary, dates, series, format, axisFormat, zeroBased = true }: Props = $props();

  let width = $state(720);
  let active = $state<number | null>(null);
  const uid = $props.id();

  const height = $derived(width < 520 ? 230 : 280);
  const directLabels = $derived(width >= 560 && series.length <= 4);
  const m = $derived({ top: 14, right: directLabels ? 118 : 12, bottom: 28, left: 62 });
  const plotW = $derived(Math.max(10, width - m.left - m.right));
  const plotH = $derived(height - m.top - m.bottom);
  const n = $derived(dates.length);

  function niceStep(range: number, count: number): number {
    const raw = range / count;
    const mag = 10 ** Math.floor(Math.log10(raw));
    const norm = raw / mag;
    return (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  }

  const scale = $derived.by(() => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const s of series) for (const v of s.values) {
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    if (!Number.isFinite(lo)) [lo, hi] = [0, 1];
    if (zeroBased) lo = Math.min(0, lo);
    if (hi === lo) hi = lo + 1;
    const step = niceStep(hi - lo, 4);
    const min = Math.floor(lo / step) * step;
    const max = Math.ceil(hi / step) * step;
    const ticks: number[] = [];
    for (let t = min; t <= max + step / 2; t += step) ticks.push(Number(t.toPrecision(12)));
    return { min, max, ticks };
  });

  const x = (i: number) => m.left + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number) => m.top + plotH - ((v - scale.min) / (scale.max - scale.min)) * plotH;

  const paths = $derived(
    series.map((s) => ({
      ...s,
      d: s.values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(''),
    })),
  );

  /** Graduations de l'axe des dates : années, ou mois si la période est courte. */
  const xTicks = $derived.by(() => {
    if (n < 2) return n === 1 ? [{ i: 0, label: dateFr(dates[0]) }] : [];
    const spanDays = (Date.parse(dates[n - 1]) - Date.parse(dates[0])) / 86_400_000;
    const maxTicks = Math.max(2, Math.floor(plotW / 80));
    const out: { i: number; label: string }[] = [];
    if (spanDays > 730) {
      const years = dates.map((d, i) => ({ d, i })).filter(({ d }, k) => k === 0 || d.slice(0, 4) !== dates[k - 1].slice(0, 4));
      const every = Math.ceil(years.length / maxTicks);
      years.forEach(({ d, i }, k) => {
        if (k % every === 0 && (i > 0 || d.slice(5) === '01-01')) out.push({ i, label: d.slice(0, 4) });
      });
    } else {
      const months = dates.map((d, i) => ({ d, i })).filter(({ d }, k) => k > 0 && d.slice(0, 7) !== dates[k - 1].slice(0, 7));
      const every = Math.max(1, Math.ceil(months.length / maxTicks));
      months.forEach(({ d, i }, k) => {
        if (k % every === 0) out.push({ i, label: monthYear(d) });
      });
      if (out.length === 0) out.push({ i: 0, label: dateFr(dates[0]) }, { i: n - 1, label: dateFr(dates[n - 1]) });
    }
    return out;
  });

  /** Étiquettes en bout de courbe, écartées d'au moins 16 px. */
  const endLabels = $derived.by(() => {
    if (!directLabels || n === 0) return [];
    const items = series.map((s) => ({ id: s.id, label: s.label, color: s.color, y0: y(s.values[n - 1]), y: y(s.values[n - 1]) })).sort((a, b) => a.y - b.y);
    for (let k = 1; k < items.length; k++) if (items[k].y - items[k - 1].y < 16) items[k].y = items[k - 1].y + 16;
    const overflow = items.length ? items[items.length - 1].y - (m.top + plotH) : 0;
    if (overflow > 0) for (const it of items) it.y -= overflow;
    return items;
  });

  function onMove(e: PointerEvent) {
    if (n === 0) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    active = Math.max(0, Math.min(n - 1, Math.round(((e.clientX - rect.left) / rect.width) * (n - 1))));
  }

  function onKey(e: KeyboardEvent) {
    if (n === 0) return;
    const big = Math.max(1, Math.round(n / 20));
    const keys: Record<string, () => number> = {
      ArrowLeft: () => (active ?? n - 1) - 1,
      ArrowRight: () => (active ?? -1) + 1,
      PageDown: () => (active ?? n - 1) - big,
      PageUp: () => (active ?? 0) + big,
      Home: () => 0,
      End: () => n - 1,
    };
    if (!keys[e.key]) return;
    e.preventDefault();
    active = Math.max(0, Math.min(n - 1, keys[e.key]()));
  }

  const tip = $derived.by(() => {
    if (active === null || active >= n) return null;
    const i = active;
    const left = x(i);
    return {
      i,
      left,
      alignRight: left > m.left + plotW * 0.6,
      date: dateFr(dates[i]),
      rows: series.map((s) => ({ id: s.id, label: s.label, color: s.color, dashed: s.dashed, value: format(s.values[i]) })),
    };
  });
  const announce = $derived(tip ? `${tip.date} : ${tip.rows.map((r) => `${r.label} ${r.value}`).join(', ')}` : '');
</script>

<figure class="chart panel">
  <figcaption>
    <h3 id={`${uid}-title`}>{title}</h3>
    <ul class="legend" aria-label="Légende">
      {#each series as s (s.id)}
        <li>
          <svg width="22" height="10" aria-hidden="true"
            ><line x1="1" y1="5" x2="21" y2="5" style:stroke={`var(${s.color})`} stroke-width="2.5" stroke-dasharray={s.dashed ? '5 4' : undefined} /></svg
          >
          {s.label}
        </li>
      {/each}
    </ul>
  </figcaption>

  <div class="plot" bind:clientWidth={width}>
    <svg {width} {height} role="img" aria-labelledby={`${uid}-title ${uid}-sum`}>
      <desc id={`${uid}-sum`}>{summary}</desc>
      <g class="grid" aria-hidden="true">
        {#each scale.ticks as t (t)}
          <line x1={m.left} x2={m.left + plotW} y1={y(t)} y2={y(t)} />
          <text x={m.left - 8} y={y(t)} dy="0.32em" text-anchor="end">{axisFormat(t)}</text>
        {/each}
        {#each xTicks as t (t.i)}
          <text x={x(t.i)} y={height - 8} text-anchor="middle">{t.label}</text>
        {/each}
      </g>
      <g aria-hidden="true">
        {#each paths as p (p.id)}
          <path d={p.d} fill="none" style:stroke={`var(${p.color})`} stroke-width="2" stroke-linejoin="round" stroke-linecap="round" stroke-dasharray={p.dashed ? '6 5' : undefined} />
        {/each}
        {#each endLabels as l (l.id)}
          {#if Math.abs(l.y - l.y0) > 2}
            <line class="leader" x1={m.left + plotW + 3} y1={l.y0} x2={m.left + plotW + 10} y2={l.y} />
          {/if}
          <circle cx={m.left + plotW} cy={l.y0} r="3" style:fill={`var(${l.color})`} class="end-dot" />
          <text class="end-label" x={m.left + plotW + 13} y={l.y} dy="0.32em">{l.label}</text>
        {/each}
        {#if tip}
          <line class="crosshair" x1={tip.left} x2={tip.left} y1={m.top} y2={m.top + plotH} />
          {#each series as s (s.id)}
            <circle cx={tip.left} cy={y(s.values[tip.i])} r="4" style:fill={`var(${s.color})`} class="end-dot" />
          {/each}
        {/if}
      </g>
    </svg>

    <div
      class="hit"
      style:left={`${m.left}px`}
      style:top={`${m.top}px`}
      style:width={`${plotW}px`}
      style:height={`${plotH}px`}
      role="slider"
      tabindex="0"
      aria-label={`${title} : date explorée (flèches gauche et droite)`}
      aria-valuemin={0}
      aria-valuemax={Math.max(0, n - 1)}
      aria-valuenow={active ?? n - 1}
      aria-valuetext={announce || 'Survolez ou utilisez les flèches pour lire les valeurs'}
      onpointermove={onMove}
      onpointerdown={onMove}
      onpointerleave={() => (active = null)}
      onkeydown={onKey}
      onblur={() => (active = null)}
    ></div>

    {#if tip}
      <div class="tip" class:right={tip.alignRight} style:left={`${tip.left}px`} style:top={`${m.top}px`} aria-hidden="true">
        <div class="tip-date">{tip.date}</div>
        {#each tip.rows as r (r.id)}
          <div class="tip-row">
            <svg width="14" height="8" aria-hidden="true"
              ><line x1="1" y1="4" x2="13" y2="4" style:stroke={`var(${r.color})`} stroke-width="2.5" stroke-dasharray={r.dashed ? '3 2' : undefined} /></svg
            >
            <strong class="num">{r.value}</strong>
            <span>{r.label}</span>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</figure>

<style>
  .chart {
    margin: 0;
    padding: 1rem 1rem 0.5rem;
    display: grid;
    gap: 0.6rem;
    min-width: 0;
  }
  figcaption {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.4rem 1rem;
  }
  h3 {
    font-size: 1.05rem;
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem 1rem;
    list-style: none;
    margin: 0;
    padding: 0;
    font-size: 0.85rem;
    color: var(--muted);
  }
  .legend li {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }
  .plot {
    position: relative;
    min-width: 0;
  }
  svg {
    display: block;
    overflow: visible;
  }
  .grid line {
    stroke: var(--rule);
    stroke-width: 1;
  }
  .grid text,
  .end-label {
    font-size: 11.5px;
    fill: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .end-label {
    fill: var(--ink);
    font-size: 12px;
  }
  .leader {
    stroke: var(--rule-strong);
    stroke-width: 1;
  }
  .end-dot {
    stroke: var(--surface);
    stroke-width: 2;
  }
  .crosshair {
    stroke: var(--muted);
    stroke-width: 1;
  }
  .hit {
    position: absolute;
    cursor: crosshair;
    touch-action: pan-y;
    border-radius: 2px;
    z-index: 1;
  }
  .hit:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }
  .tip {
    position: absolute;
    transform: translateX(12px);
    pointer-events: none;
    background: var(--surface);
    border: 1px solid var(--rule-strong);
    border-radius: var(--radius);
    box-shadow: var(--shadow-pop);
    padding: 0.45rem 0.6rem;
    font-size: 0.82rem;
    min-width: 11rem;
    z-index: 2;
  }
  .tip.right {
    transform: translateX(calc(-100% - 12px));
  }
  .tip-date {
    color: var(--muted);
    margin-bottom: 0.2rem;
  }
  .tip-row {
    display: grid;
    grid-template-columns: auto auto 1fr;
    align-items: center;
    gap: 0.45rem;
    white-space: nowrap;
  }
  .tip-row span {
    color: var(--muted);
  }
</style>
