/**
 * Sauvegarde d'une simulation dans un fichier JSON versionné (D-013).
 *
 * Le fichier contient les paramètres et les cours utilisés : il se rouvre et
 * se recalcule hors ligne, à l'identique, sur n'importe quel appareil.
 * Version 2 : plusieurs cryptos (D-016). Une sauvegarde de version 1 (une
 * crypto) est migrée ; une version plus récente que l'outil est refusée.
 */
import { isIsoDate } from '../core/dates';
import { dec, type Dec } from '../core/money';
import type { PortfolioParams } from '../core/portfolio';

export const APP_ID = 'dca-crypto';
export const SCHEMA_VERSION = 2;

export type EndMode = 'date' | 'today';

export interface SavedSimulation {
  app: typeof APP_ID;
  schemaVersion: number;
  exportedAt: string;
  params: PortfolioParams;
  endMode: EndMode;
  /** Cours utilisés, par crypto : [date, cours en euros]. */
  prices: Record<string, [string, string][]>;
  /** Cryptos dont les cours venaient d'un fichier importé (nom du fichier). */
  priceFiles?: Record<string, string>;
}

export class BackupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupError';
  }
}

export function makeBackup(input: {
  params: PortfolioParams;
  endMode: EndMode;
  prices: ReadonlyMap<string, ReadonlyMap<string, Dec>>;
  priceFiles?: Record<string, string>;
  now?: Date;
}): SavedSimulation {
  const prices: Record<string, [string, string][]> = {};
  for (const [asset, series] of input.prices) {
    prices[asset] = [...series].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([d, p]) => [d, p.toString()]);
  }
  return {
    app: APP_ID,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: (input.now ?? new Date()).toISOString(),
    params: input.params,
    endMode: input.endMode,
    prices,
    ...(input.priceFiles && Object.keys(input.priceFiles).length ? { priceFiles: input.priceFiles } : {}),
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';

function checkCommon(p: Record<string, unknown>): boolean {
  const f = p.frequency;
  const fee = p.fee;
  return (
    isStr(p.start) &&
    isStr(p.end) &&
    (p.initialCapitalEur === undefined || isStr(p.initialCapitalEur)) &&
    isObj(f) &&
    (f.kind === 'daily' || (f.kind === 'weekly' && typeof f.weekday === 'number') || (f.kind === 'monthly' && (typeof f.day === 'number' || f.day === 'last'))) &&
    isObj(fee) &&
    (fee.kind === 'percent' || fee.kind === 'fixed') &&
    isStr(fee.value)
  );
}

function checkPrices(rows: unknown): [string, string][] {
  if (!Array.isArray(rows)) throw new BackupError('Cours illisibles.');
  return rows.map((row) => {
    if (!Array.isArray(row) || !isStr(row[0]) || !isStr(row[1]) || !isIsoDate(row[0])) throw new BackupError('Cours illisibles.');
    try {
      if (!dec(row[1]).gt(0)) throw new Error();
    } catch {
      throw new BackupError(`Cours illisible au ${row[0]}.`);
    }
    return [row[0], row[1]];
  });
}

/** Lit et valide un fichier de sauvegarde (version 1 migrée). */
export function readBackup(text: string): SavedSimulation {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new BackupError("Ce fichier n'est pas un JSON valide.");
  }
  if (!isObj(data) || data.app !== APP_ID) throw new BackupError("Ce fichier n'est pas une sauvegarde de dca-crypto.");
  const version = data.schemaVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) throw new BackupError('Version de sauvegarde illisible.');
  if (version > SCHEMA_VERSION) throw new BackupError('Cette sauvegarde vient d’une version plus récente de dca-crypto : mettez la page à jour.');
  const p = data.params;
  if (!isObj(p) || !checkCommon(p)) throw new BackupError('Paramètres de simulation illisibles.');
  const endMode: EndMode = data.endMode === 'today' ? 'today' : 'date';
  const base = {
    frequency: p.frequency,
    start: p.start,
    end: p.end,
    fee: p.fee,
    ...(isStr(p.initialCapitalEur) ? { initialCapitalEur: p.initialCapitalEur } : {}),
  } as Omit<PortfolioParams, 'assets'>;

  let params: PortfolioParams;
  const prices: Record<string, [string, string][]> = {};
  let priceFiles: Record<string, string> | undefined;
  if (version === 1) {
    // Version 1 : une seule crypto, cours en liste simple.
    if (!isStr(p.asset) || !isStr(p.amountEur)) throw new BackupError('Paramètres de simulation illisibles.');
    const asset = p.asset.trim().toUpperCase();
    params = { ...base, assets: [{ asset, amountEur: p.amountEur }] };
    prices[asset] = checkPrices(data.prices);
    if (data.priceSource === 'csv') priceFiles = { [asset]: isStr(data.priceFile) ? data.priceFile : 'fichier importé' };
  } else {
    if (!Array.isArray(p.assets) || p.assets.length === 0 || !p.assets.every((a) => isObj(a) && isStr(a.asset) && isStr(a.amountEur)))
      throw new BackupError('Liste des cryptos illisible.');
    params = { ...base, assets: (p.assets as { asset: string; amountEur: string }[]).map((a) => ({ asset: a.asset, amountEur: a.amountEur })) };
    if (!isObj(data.prices)) throw new BackupError('Cours absents.');
    for (const [asset, rows] of Object.entries(data.prices)) prices[asset] = checkPrices(rows);
    if (isObj(data.priceFiles)) priceFiles = Object.fromEntries(Object.entries(data.priceFiles).filter(([, v]) => isStr(v))) as Record<string, string>;
  }
  return {
    app: APP_ID,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: isStr(data.exportedAt) ? data.exportedAt : '',
    params,
    endMode,
    prices,
    ...(priceFiles ? { priceFiles } : {}),
  };
}

export function backupPrices(saved: SavedSimulation): Map<string, Map<string, Dec>> {
  return new Map(Object.entries(saved.prices).map(([asset, rows]) => [asset, new Map(rows.map(([d, p]) => [d, dec(p)]))]));
}
