/**
 * Portefeuille de plusieurs cryptos : un montant par crypto à chaque échéance
 * (D-016). Chaque crypto est simulée par le moteur d'un actif
 * (`simulate`), puis les résultats sont additionnés.
 *
 * - Capital de départ : réparti au prorata des montants par échéance, au
 *   centime, le reste sur la dernière crypto.
 * - Achat unique de comparaison : pour chaque crypto, son total investi à sa
 *   première date d'achat (D-009), puis somme.
 */
import { eachDay } from './dates';
import { D, dec, ZERO, type Dec } from './money';
import { simulate, validateParams, type Fee, type Frequency, type Purchase, type PriceSeries, type SimulationParams, type SimulationResult } from './simulate';

export const MAX_ASSETS = 10;

export interface AssetLine {
  asset: string;
  /** Montant par échéance pour cette crypto, frais compris. */
  amountEur: string;
}

export interface PortfolioParams {
  assets: AssetLine[];
  frequency: Frequency;
  start: string;
  end: string;
  fee: Fee;
  initialCapitalEur?: string;
}

export interface AssetResult {
  asset: string;
  /** Part du montant par échéance (0 à 1). */
  share: Dec;
  result: SimulationResult;
}

export interface PortfolioPoint {
  date: string;
  invested: Dec;
  value: Dec;
  lumpValue: Dec;
}

export interface Totals {
  invested: Dec;
  fees: Dec;
  value: Dec;
  pnl: Dec;
  pnlPct: Dec;
}

export interface PortfolioResult {
  ok: true;
  params: PortfolioParams;
  assets: AssetResult[];
  /** Montant total par échéance. */
  amountPerPeriod: Dec;
  firstDate: string;
  endDate: string;
  /** Dernière date de cours utilisée parmi les cryptos. */
  endPriceDate: string;
  dca: Totals & { purchases: number };
  lumpSum: Totals;
  difference: Dec;
  timeline: PortfolioPoint[];
  /** Tous les achats, par date puis par crypto. */
  purchases: (Purchase & { asset: string })[];
}

export interface PortfolioError {
  ok: false;
  errors: string[];
}

const HUNDRED = new D(100);
const pct = (part: Dec, whole: Dec) => (whole.isZero() ? ZERO : part.times(HUNDRED).dividedBy(whole));
const norm = (s: string) => s.trim().toUpperCase();

/** Paramètres du moteur pour chaque crypto (capital de départ réparti). */
export function splitParams(p: PortfolioParams): SimulationParams[] {
  const amounts = p.assets.map((a) => {
    try {
      return dec(a.amountEur);
    } catch {
      return ZERO;
    }
  });
  const total = amounts.reduce((s, a) => s.plus(a), ZERO);
  let initial: Dec | null = null;
  try {
    initial = p.initialCapitalEur?.trim() ? dec(p.initialCapitalEur) : null;
  } catch {
    initial = null;
  }
  let given = ZERO;
  return p.assets.map((a, i) => {
    let initialShare: string | undefined;
    if (initial && initial.gt(0) && total.gt(0)) {
      const share = i === p.assets.length - 1 ? initial.minus(given) : initial.times(amounts[i]).dividedBy(total).toDecimalPlaces(2, D.ROUND_HALF_UP);
      given = given.plus(share);
      initialShare = share.toFixed();
    }
    return {
      asset: norm(a.asset),
      amountEur: a.amountEur,
      frequency: p.frequency,
      start: p.start,
      end: p.end,
      fee: p.fee,
      ...(initialShare !== undefined ? { initialCapitalEur: initialShare } : {}),
    };
  });
}

export function validatePortfolio(p: PortfolioParams): string[] {
  const errors: string[] = [];
  if (p.assets.length === 0) return ['Ajoutez au moins une crypto.'];
  if (p.assets.length > MAX_ASSETS) errors.push(`${MAX_ASSETS} cryptos au plus.`);
  const seen = new Set<string>();
  for (const a of p.assets) {
    const s = norm(a.asset);
    if (s && seen.has(s)) errors.push(`${s} apparaît deux fois : regroupez les montants sur une seule ligne.`);
    seen.add(s);
  }
  const split = splitParams(p);
  const messages = new Set<string>();
  split.forEach((params) => {
    for (const e of validateParams(params)) {
      const label = params.asset || 'Ligne sans symbole';
      // Erreurs communes (dates, frais) une seule fois ; erreurs propres à une crypto préfixées.
      const own = /montant|actif|capital de départ/i.test(e);
      messages.add(own && p.assets.length > 1 ? `${label} : ${e.charAt(0).toLowerCase()}${e.slice(1)}` : e);
    }
  });
  return [...errors, ...messages];
}

export function simulatePortfolio(p: PortfolioParams, prices: ReadonlyMap<string, PriceSeries>): PortfolioResult | PortfolioError {
  const errors = validatePortfolio(p);
  if (errors.length) return { ok: false, errors };

  const split = splitParams(p);
  const amountPerPeriod = split.reduce((s, x) => s.plus(dec(x.amountEur)), ZERO);
  const assets: AssetResult[] = [];
  const failures: string[] = [];
  for (const params of split) {
    const r = simulate(params, prices.get(params.asset) ?? new Map());
    if (!r.ok) failures.push(`${params.asset} : ${r.errors.join(' ')}`);
    else assets.push({ asset: params.asset, share: dec(params.amountEur).dividedBy(amountPerPeriod), result: r });
  }
  if (failures.length) return { ok: false, errors: failures };

  const sum = (pick: (r: SimulationResult) => Dec) => assets.reduce((s, a) => s.plus(pick(a.result)), ZERO);
  const invested = sum((r) => r.dca.invested);
  const value = sum((r) => r.dca.value);
  const lumpValue = sum((r) => r.lumpSum.value);
  const dca = {
    invested,
    fees: sum((r) => r.dca.fees),
    value,
    pnl: value.minus(invested),
    pnlPct: pct(value.minus(invested), invested),
    purchases: assets.reduce((n, a) => n + a.result.purchases.length, 0),
  };
  const lumpSum: Totals = {
    invested,
    fees: sum((r) => r.lumpSum.fees),
    value: lumpValue,
    pnl: lumpValue.minus(invested),
    pnlPct: pct(lumpValue.minus(invested), invested),
  };

  const firstDate = assets.map((a) => a.result.purchases[0].date).sort()[0];
  const endPriceDate = assets.map((a) => a.result.endPriceDate).sort().reverse()[0];
  const byDate = assets.map((a) => new Map(a.result.timeline.map((t) => [t.date, t])));
  const timeline: PortfolioPoint[] = eachDay(firstDate, p.end).map((date) => {
    let inv = ZERO;
    let val = ZERO;
    let lump = ZERO;
    for (const m of byDate) {
      const t = m.get(date);
      if (!t) continue;
      inv = inv.plus(t.invested);
      val = val.plus(t.value);
      lump = lump.plus(t.lumpValue);
    }
    return { date, invested: inv, value: val, lumpValue: lump };
  });

  const purchases = assets
    .flatMap((a) => a.result.purchases.map((x) => ({ ...x, asset: a.asset })))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  return {
    ok: true,
    params: p,
    assets,
    amountPerPeriod,
    firstDate,
    endDate: p.end,
    endPriceDate,
    dca,
    lumpSum,
    difference: value.minus(lumpValue),
    timeline,
    purchases,
  };
}
