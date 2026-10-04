/**
 * Dates calendaires « AAAA-MM-JJ », sans heure ni fuseau.
 *
 * Une date d'achat désigne un jour de bougie journalière Binance, qui va de
 * 00:00 à 23:59:59 UTC (D-002). On calcule donc tout en UTC, sans jamais
 * passer par l'heure locale du navigateur.
 */

const DAY_MS = 86_400_000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Date valide au format AAAA-MM-JJ ? */
export function isIsoDate(value: string): boolean {
  const m = ISO_DATE.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

/** AAAA-MM-JJ → instant UTC de minuit (ms). */
export function dateToUtcMs(date: string): number {
  if (!isIsoDate(date)) throw new RangeError(`Date invalide : ${date}`);
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Instant UTC (ms) → AAAA-MM-JJ du jour UTC qui le contient. */
export function utcMsToDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return utcMsToDate(dateToUtcMs(date) + days * DAY_MS);
}

/** Jour de la semaine ISO : 1 = lundi … 7 = dimanche. */
export function isoWeekday(date: string): number {
  const day = new Date(dateToUtcMs(date)).getUTCDay();
  return day === 0 ? 7 : day;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Toutes les dates de `from` à `to` inclus. */
export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let ms = dateToUtcMs(from), end = dateToUtcMs(to); ms <= end; ms += DAY_MS) out.push(utcMsToDate(ms));
  return out;
}
