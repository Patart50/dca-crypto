/**
 * Moteur de simulation DCA. Logique pure : reçoit les paramètres et une série
 * de prix journaliers en euros, renvoie les achats, la synthèse et la
 * comparaison avec un achat unique au départ.
 *
 * Conventions (voir docs/DECISIONS.md) :
 * - D-002 : prix d'achat = clôture de la bougie journalière (UTC) du jour d'achat ;
 * - D-003 : le montant saisi est le montant décaissé, frais compris ;
 *   quantité = (montant − frais) ÷ prix ; PMP = total décaissé ÷ quantité.
 */
import { addDays, dateToUtcMs, daysInMonth, eachDay, isIsoDate, isoWeekday } from './dates';
import { D, dec, ZERO, type Dec } from './money';

export type Frequency =
  | { kind: 'daily' }
  /** 1 = lundi … 7 = dimanche. */
  | { kind: 'weekly'; weekday: number }
  /** Jour 1 à 28, ou dernier jour du mois. */
  | { kind: 'monthly'; day: number | 'last' };

export type Fee = { kind: 'percent'; value: string } | { kind: 'fixed'; value: string };

export interface SimulationParams {
  asset: string;
  /** Montant décaissé par achat, frais compris (D-003). */
  amountEur: string;
  frequency: Frequency;
  start: string;
  end: string;
  fee: Fee;
  /** Facultatif : investi en plus à la première date d'achat. */
  initialCapitalEur?: string;
}

/** Cours de clôture journalier en euros, par date AAAA-MM-JJ. */
export type PriceSeries = ReadonlyMap<string, Dec>;

export interface Purchase {
  date: string;
  kind: 'initial' | 'regular';
  /** Décaissé, frais compris. */
  amountEur: Dec;
  feeEur: Dec;
  price: Dec;
  quantity: Dec;
  cumInvested: Dec;
  cumQuantity: Dec;
  /** PMP après cet achat. */
  avgPrice: Dec;
}

export interface Summary {
  invested: Dec;
  fees: Dec;
  quantity: Dec;
  avgPrice: Dec;
  value: Dec;
  pnl: Dec;
  /** En pourcentage du montant investi. */
  pnlPct: Dec;
}

export interface DcaSummary extends Summary {
  purchases: number;
  bestPrice: Dec;
  worstPrice: Dec;
}

export interface LumpSumSummary extends Summary {
  date: string;
  price: Dec;
}

export interface TimelinePoint {
  date: string;
  /** Cours du jour, ou dernier cours connu. */
  price: Dec;
  invested: Dec;
  value: Dec;
  avgPrice: Dec;
  lumpValue: Dec;
}

export interface SimulationResult {
  ok: true;
  params: SimulationParams;
  purchases: Purchase[];
  /** Échéances sans prix (avant la cotation, trou de données) : aucun achat. */
  skipped: string[];
  endDate: string;
  /** Date du cours de fin retenu (≤ endDate). */
  endPriceDate: string;
  endPrice: Dec;
  dca: DcaSummary;
  lumpSum: LumpSumSummary;
  /** Valeur DCA − valeur achat unique. */
  difference: Dec;
  timeline: TimelinePoint[];
}

export interface SimulationError {
  ok: false;
  errors: string[];
}

const HUNDRED = new D(100);

// ---------------------------------------------------------------------------
// Échéancier
// ---------------------------------------------------------------------------

/** Dates d'achat de `start` à `end` inclus. */
export function schedule(frequency: Frequency, start: string, end: string): string[] {
  const from = dateToUtcMs(start);
  const to = dateToUtcMs(end);
  if (from > to) return [];
  if (frequency.kind === 'daily') return eachDay(start, end);
  if (frequency.kind === 'weekly') {
    const shift = (frequency.weekday - isoWeekday(start) + 7) % 7;
    const out: string[] = [];
    for (let d = addDays(start, shift); dateToUtcMs(d) <= to; d = addDays(d, 7)) out.push(d);
    return out;
  }
  const out: string[] = [];
  let [y, m] = start.split('-').map(Number);
  const [ey, em] = end.split('-').map(Number);
  while (y < ey || (y === ey && m <= em)) {
    const day = frequency.day === 'last' ? daysInMonth(y, m) : frequency.day;
    const date = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const ms = dateToUtcMs(date);
    if (ms >= from && ms <= to) out.push(date);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function positive(value: string | undefined): Dec | null {
  if (value === undefined || value.trim() === '') return null;
  try {
    const d = dec(value);
    return d.isFinite() ? d : null;
  } catch {
    return null;
  }
}

export function validateParams(p: SimulationParams): string[] {
  const errors: string[] = [];
  if (!p.asset.trim()) errors.push('Choisissez un actif.');
  const amount = positive(p.amountEur);
  if (!amount || amount.lte(0)) errors.push('Le montant par achat doit être un nombre positif.');
  const startOk = isIsoDate(p.start);
  const endOk = isIsoDate(p.end);
  if (!startOk) errors.push('Date de début invalide.');
  if (!endOk) errors.push('Date de fin invalide.');
  if (startOk && endOk && p.start > p.end) errors.push('La date de début doit précéder la date de fin.');
  const f = p.frequency;
  if (f.kind === 'weekly' && !(Number.isInteger(f.weekday) && f.weekday >= 1 && f.weekday <= 7)) errors.push('Jour de la semaine invalide.');
  if (f.kind === 'monthly' && f.day !== 'last' && !(Number.isInteger(f.day) && f.day >= 1 && f.day <= 28))
    errors.push('Jour du mois : de 1 à 28, ou dernier jour du mois.');
  const fee = positive(p.fee.value);
  if (!fee || fee.lt(0)) errors.push('Les frais doivent être un nombre positif ou nul.');
  else if (p.fee.kind === 'percent' && fee.gte(HUNDRED)) errors.push('Les frais en pourcentage doivent être inférieurs à 100 %.');
  else if (p.fee.kind === 'fixed' && amount && fee.gte(amount)) errors.push('Les frais fixes doivent être inférieurs au montant par achat.');
  if (p.initialCapitalEur !== undefined && p.initialCapitalEur.trim() !== '') {
    const initial = positive(p.initialCapitalEur);
    if (!initial || initial.lt(0)) errors.push('Le capital de départ doit être un nombre positif.');
    else if (p.fee.kind === 'fixed' && fee && initial.gt(0) && fee.gte(initial)) errors.push('Les frais fixes doivent être inférieurs au capital de départ.');
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Calcul
// ---------------------------------------------------------------------------

export function feeFor(fee: Fee, amount: Dec): Dec {
  const v = dec(fee.value);
  return fee.kind === 'percent' ? amount.times(v).dividedBy(HUNDRED) : v;
}

function pct(part: Dec, whole: Dec): Dec {
  return whole.isZero() ? ZERO : part.times(HUNDRED).dividedBy(whole);
}

function summary(invested: Dec, fees: Dec, quantity: Dec, price: Dec): Summary {
  const value = quantity.times(price);
  const pnl = value.minus(invested);
  return {
    invested,
    fees,
    quantity,
    avgPrice: quantity.isZero() ? ZERO : invested.dividedBy(quantity),
    value,
    pnl,
    pnlPct: pct(pnl, invested),
  };
}

/** Dernier cours connu à une date ou avant. */
function priceOnOrBefore(prices: PriceSeries, sortedDates: string[], date: string): { date: string; price: Dec } | null {
  let lo = 0;
  let hi = sortedDates.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sortedDates[mid] <= date) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  if (found < 0) return null;
  const d = sortedDates[found];
  return { date: d, price: prices.get(d)! };
}

export function simulate(params: SimulationParams, prices: PriceSeries): SimulationResult | SimulationError {
  const errors = validateParams(params);
  if (errors.length) return { ok: false, errors };

  const amount = dec(params.amountEur);
  const initial = params.initialCapitalEur?.trim() ? dec(params.initialCapitalEur) : ZERO;
  const sortedDates = [...prices.keys()].filter((d) => prices.get(d)?.gt(0)).sort();

  const purchases: Purchase[] = [];
  const skipped: string[] = [];
  let cumInvested = ZERO;
  let cumFees = ZERO;
  let cumQuantity = ZERO;

  const buy = (date: string, kind: Purchase['kind'], amountEur: Dec, price: Dec) => {
    const feeEur = feeFor(params.fee, amountEur);
    const quantity = amountEur.minus(feeEur).dividedBy(price);
    cumInvested = cumInvested.plus(amountEur);
    cumFees = cumFees.plus(feeEur);
    cumQuantity = cumQuantity.plus(quantity);
    purchases.push({ date, kind, amountEur, feeEur, price, quantity, cumInvested, cumQuantity, avgPrice: cumInvested.dividedBy(cumQuantity) });
  };

  for (const date of schedule(params.frequency, params.start, params.end)) {
    const price = prices.get(date);
    if (!price || price.lte(0)) {
      skipped.push(date);
      continue;
    }
    if (purchases.length === 0 && initial.gt(0)) buy(date, 'initial', initial, price);
    buy(date, 'regular', amount, price);
  }

  if (purchases.length === 0) {
    return { ok: false, errors: ['Aucun achat possible : pas de cours pour les dates demandées (actif pas encore coté, ou prix non chargés).'] };
  }

  const end = priceOnOrBefore(prices, sortedDates, params.end)!;
  const prices_ = purchases.map((p) => p.price);
  const dca: DcaSummary = {
    ...summary(cumInvested, cumFees, cumQuantity, end.price),
    purchases: purchases.length,
    bestPrice: D.min(...prices_),
    worstPrice: D.max(...prices_),
  };

  // Achat unique : le même total, à la première date d'achat, mêmes règles de frais.
  const first = purchases[0];
  const lumpFee = feeFor(params.fee, cumInvested);
  const lumpQuantity = cumInvested.minus(lumpFee).dividedBy(first.price);
  const lumpSum: LumpSumSummary = { ...summary(cumInvested, lumpFee, lumpQuantity, end.price), date: first.date, price: first.price };

  // Chronologie journalière, de la première date d'achat à la date de fin.
  const timeline: TimelinePoint[] = [];
  let p = 0;
  let invested = ZERO;
  let quantity = ZERO;
  let lastPrice = first.price;
  for (const date of eachDay(first.date, params.end)) {
    while (p < purchases.length && purchases[p].date === date) {
      invested = purchases[p].cumInvested;
      quantity = purchases[p].cumQuantity;
      p++;
    }
    lastPrice = prices.get(date) ?? lastPrice;
    timeline.push({
      date,
      price: lastPrice,
      invested,
      value: quantity.times(lastPrice),
      avgPrice: invested.dividedBy(quantity),
      lumpValue: lumpQuantity.times(lastPrice),
    });
  }

  return {
    ok: true,
    params,
    purchases,
    skipped,
    endDate: params.end,
    endPriceDate: end.date,
    endPrice: end.price,
    dca,
    lumpSum,
    difference: dca.value.minus(lumpSum.value),
    timeline,
  };
}
