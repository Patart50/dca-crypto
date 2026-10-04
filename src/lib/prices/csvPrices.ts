/**
 * Import d'un fichier CSV de prix (date, prix en euros) : alternative 100 %
 * hors ligne à Binance, obligatoire pour un actif sans paire Binance.
 *
 * Accepte un fichier à deux colonnes, ou un historique OHLC (la clôture est
 * retenue). Dates : ISO (AAAA-MM-JJ…), JJ/MM/AAAA ou horodatage Unix
 * (secondes ou millisecondes, jour UTC). Séparateur décimal point ou virgule.
 */
import { isIsoDate, utcMsToDate } from '../core/dates';
import { dec, type Dec } from '../core/money';
import { parseCsv } from '../csv/csv';

export interface PriceCsvResult {
  prices: Map<string, Dec>;
  /** Intitulés des colonnes retenues. */
  dateColumn: string;
  priceColumn: string;
  /** Lignes illisibles (numéro de ligne du fichier et raison), 20 au plus. */
  errors: string[];
  errorCount: number;
  /** Dates présentes plusieurs fois (la dernière valeur est gardée). */
  duplicates: number;
  first?: string;
  last?: string;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const DATE_HEADER = /^(date|day|jour|time|timestamp|datetime|open time|date heure|snapped at|time period start)$/;
const CLOSE_HEADER = /^(close|cloture|dernier|last|close eur|price close|prix de cloture)$/;
const PRICE_HEADER = /^(price|prix|cours|eur|value|valeur|price eur|prix eur|cours eur|rate|taux)$/;

/** Texte de date → AAAA-MM-JJ, ou null. */
export function parsePriceDate(raw: string): string | null {
  const v = raw.trim().replace(/^"|"$/g, '');
  if (/^\d{10}(\d{3})?$/.test(v)) return utcMsToDate(v.length === 13 ? Number(v) : Number(v) * 1000);
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (m) {
    const d = `${m[1]}-${m[2]}-${m[3]}`;
    return isIsoDate(d) ? d : null;
  }
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/.exec(v);
  if (m) {
    const d = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    return isIsoDate(d) ? d : null;
  }
  return null;
}

/** Texte de prix → décimal positif, ou null. Gère « 1 234,56 », « 1,234.56 », « 42 000 € ». */
export function parsePriceNumber(raw: string): Dec | null {
  let v = raw.trim().replace(/[\s  €$]/g, '');
  if (v === '') return null;
  const lastComma = v.lastIndexOf(',');
  const lastDot = v.lastIndexOf('.');
  if (lastComma > lastDot) v = v.replace(/\./g, '').replace(',', '.');
  else v = v.replace(/,/g, '');
  if (!/^\d+(\.\d+)?$/.test(v)) return null;
  const d = dec(v);
  return d.gt(0) ? d : null;
}

function pickColumns(headers: string[]): { date: number; price: number } | null {
  const n = headers.map(norm);
  const date = n.findIndex((h) => DATE_HEADER.test(h));
  let price = n.findIndex((h) => CLOSE_HEADER.test(h));
  if (price < 0) price = n.findIndex((h) => PRICE_HEADER.test(h));
  if (date >= 0 && price >= 0) return { date, price };
  if (headers.length === 2) return { date: 0, price: 1 };
  return null;
}

export function parsePriceCsv(text: string): PriceCsvResult {
  const table = parseCsv(text);
  let headers = table.headers;
  let rows = table.rows;
  // Fichier sans ligne d'en-tête : la première ligne est déjà une donnée.
  if (headers.length === 2 && parsePriceDate(headers[0]) && parsePriceNumber(headers[1])) {
    rows = [headers, ...rows];
    headers = ['date', 'prix'];
  }
  const cols = pickColumns(headers);
  if (!cols) {
    throw new Error(
      `Colonnes de date et de prix introuvables (en-têtes lus : ${headers.join(', ') || 'aucun'}). Attendu : « date » et « prix » (ou « close »).`,
    );
  }
  const prices = new Map<string, Dec>();
  const errors: string[] = [];
  let errorCount = 0;
  let duplicates = 0;
  rows.forEach((row, i) => {
    const line = i + 2;
    const date = parsePriceDate(row[cols.date] ?? '');
    const price = parsePriceNumber(row[cols.price] ?? '');
    if (!date || !price) {
      errorCount++;
      if (errors.length < 20) errors.push(`ligne ${line} : ${!date ? `date illisible « ${row[cols.date] ?? ''} »` : `prix illisible « ${row[cols.price] ?? ''} »`}`);
      return;
    }
    if (prices.has(date)) duplicates++;
    prices.set(date, price);
  });
  const dates = [...prices.keys()].sort();
  return {
    prices,
    dateColumn: headers[cols.date],
    priceColumn: headers[cols.price],
    errors,
    errorCount,
    duplicates,
    first: dates[0],
    last: dates[dates.length - 1],
  };
}
