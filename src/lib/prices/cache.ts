/**
 * Cache local des cours Binance, par actif. Évite de rappeler Binance à
 * chaque simulation et permet de relancer une simulation hors ligne.
 *
 * Un cours journalier est définitif une fois la journée UTC terminée. La
 * bougie du jour en cours, elle, change : une série qui la contient n'est
 * réutilisée qu'une heure.
 */
import { addDays, utcMsToDate } from '../core/dates';
import { dec, type Dec } from '../core/money';
import type { EurSeries, Route } from './binance';
import { readJson, writeJson, type KeyValueStore } from '../state/storage';

const ROUTE_CODES: Record<Route, string> = { EUR: 'E', 'USDT/EURUSDT': 'U', 'USDT/BCE': 'B' };
const CODE_ROUTES: Record<string, Route> = { E: 'EUR', U: 'USDT/EURUSDT', B: 'USDT/BCE' };
const FRESH_MS = 60 * 60_000;

interface CachedSeries {
  v: 1;
  asset: string;
  from: string;
  to: string;
  /** Dernière date dont la bougie était close au moment du chargement. */
  stableTo: string;
  fetchedAt: number;
  /** [date, cours, chemin]. */
  rows: [string, string, string][];
}

export const cacheKey = (asset: string) => `prix:binance:${asset.toUpperCase()}`;

function toSeries(asset: string, rows: [string, string, string][], from: string, to: string): EurSeries {
  const prices = new Map<string, Dec>();
  const routes = new Map<string, Route>();
  const routeCounts: Record<Route, number> = { EUR: 0, 'USDT/EURUSDT': 0, 'USDT/BCE': 0 };
  const have = new Set<string>();
  for (const [date, price, code] of rows) {
    if (date < from || date > to) continue;
    const route = CODE_ROUTES[code] ?? 'EUR';
    prices.set(date, dec(price));
    routes.set(date, route);
    routeCounts[route]++;
    have.add(date);
  }
  const missing: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) if (!have.has(d)) missing.push(d);
  return { asset, prices, routes, routeCounts, missing };
}

/** Série en cache couvrant toute la période et encore valable, sinon null. */
export function readCachedSeries(store: KeyValueStore, asset: string, from: string, to: string, now = Date.now()): EurSeries | null {
  const c = readJson<CachedSeries>(store, cacheKey(asset));
  if (!c || c.v !== 1 || c.from > from || c.to < to) return null;
  if (to > c.stableTo && now - c.fetchedAt > FRESH_MS) return null;
  return toSeries(asset.toUpperCase(), c.rows, from, to);
}

/** Enregistre une série chargée, fusionnée avec le cache existant si les périodes se touchent. */
export function writeCachedSeries(store: KeyValueStore, series: EurSeries, from: string, to: string, now = Date.now()): boolean {
  const asset = series.asset.toUpperCase();
  const stableTo = addDays(utcMsToDate(now), -1) < to ? addDays(utcMsToDate(now), -1) : to;
  const rows = new Map<string, [string, string, string]>();
  let merged = { from, to, stableTo };

  const old = readJson<CachedSeries>(store, cacheKey(asset));
  const touches = old && old.v === 1 && old.from <= addDays(to, 1) && old.to >= addDays(from, -1);
  if (old && touches) {
    // Une ancienne bougie non close, hors de la nouvelle période, est retirée.
    const oldEnd = old.to > to && old.stableTo < old.to ? old.stableTo : old.to;
    for (const r of old.rows) if (r[0] <= oldEnd) rows.set(r[0], r);
    const newTo = oldEnd > to ? oldEnd : to;
    merged = {
      from: old.from < from ? old.from : from,
      to: newTo,
      stableTo: newTo === to ? stableTo : old.stableTo > stableTo ? old.stableTo : stableTo,
    };
  }
  for (const [date, price] of series.prices) rows.set(date, [date, price.toString(), ROUTE_CODES[series.routes.get(date) ?? 'EUR']]);
  const entry: CachedSeries = {
    v: 1,
    asset,
    ...merged,
    fetchedAt: now,
    rows: [...rows.values()].sort((a, b) => (a[0] < b[0] ? -1 : 1)),
  };
  return writeJson(store, cacheKey(asset), entry);
}
