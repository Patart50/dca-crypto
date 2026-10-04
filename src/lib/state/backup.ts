/**
 * Sauvegarde d'une simulation dans un fichier JSON versionné.
 *
 * Le fichier contient les paramètres et les cours utilisés : il se rouvre et
 * se recalcule hors ligne, à l'identique, sur n'importe quel appareil.
 * Une sauvegarde d'une version plus récente de l'outil est refusée ; une plus
 * ancienne serait migrée (comme pmpa D-016).
 */
import { isIsoDate } from '../core/dates';
import { dec, type Dec } from '../core/money';
import type { SimulationParams } from '../core/simulate';

export const APP_ID = 'dca-crypto';
export const SCHEMA_VERSION = 1;

export type PriceSource = 'binance' | 'csv';
export type EndMode = 'date' | 'today';

export interface SavedSimulation {
  app: typeof APP_ID;
  schemaVersion: number;
  exportedAt: string;
  params: SimulationParams;
  endMode: EndMode;
  priceSource: PriceSource;
  /** Nom du fichier de prix importé, le cas échéant. */
  priceFile?: string;
  /** Cours utilisés : [date, cours en euros]. */
  prices: [string, string][];
}

export class BackupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupError';
  }
}

export function makeBackup(input: {
  params: SimulationParams;
  endMode: EndMode;
  priceSource: PriceSource;
  priceFile?: string;
  prices: ReadonlyMap<string, Dec>;
  now?: Date;
}): SavedSimulation {
  return {
    app: APP_ID,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: (input.now ?? new Date()).toISOString(),
    params: input.params,
    endMode: input.endMode,
    priceSource: input.priceSource,
    ...(input.priceFile ? { priceFile: input.priceFile } : {}),
    prices: [...input.prices].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([d, p]) => [d, p.toString()]),
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';

function checkParams(p: unknown): SimulationParams {
  if (!isObj(p)) throw new BackupError('Paramètres absents.');
  const f = p.frequency;
  const fee = p.fee;
  const ok =
    isStr(p.asset) &&
    isStr(p.amountEur) &&
    isStr(p.start) &&
    isStr(p.end) &&
    (p.initialCapitalEur === undefined || isStr(p.initialCapitalEur)) &&
    isObj(f) &&
    (f.kind === 'daily' ||
      (f.kind === 'weekly' && typeof f.weekday === 'number') ||
      (f.kind === 'monthly' && (typeof f.day === 'number' || f.day === 'last'))) &&
    isObj(fee) &&
    (fee.kind === 'percent' || fee.kind === 'fixed') &&
    isStr(fee.value);
  if (!ok) throw new BackupError('Paramètres de simulation illisibles.');
  return p as unknown as SimulationParams;
}

/** Lit et valide un fichier de sauvegarde. */
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
  const params = checkParams(data.params);
  const endMode: EndMode = data.endMode === 'today' ? 'today' : 'date';
  const priceSource: PriceSource = data.priceSource === 'csv' ? 'csv' : 'binance';
  if (!Array.isArray(data.prices)) throw new BackupError('Cours absents.');
  const prices: [string, string][] = [];
  for (const row of data.prices) {
    if (!Array.isArray(row) || !isStr(row[0]) || !isStr(row[1]) || !isIsoDate(row[0])) throw new BackupError('Cours illisibles.');
    try {
      if (!dec(row[1]).gt(0)) throw new Error();
    } catch {
      throw new BackupError(`Cours illisible au ${row[0]}.`);
    }
    prices.push([row[0], row[1]]);
  }
  return {
    app: APP_ID,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: isStr(data.exportedAt) ? data.exportedAt : '',
    params,
    endMode,
    priceSource,
    ...(isStr(data.priceFile) ? { priceFile: data.priceFile } : {}),
    prices,
  };
}

export function backupPrices(saved: SavedSimulation): Map<string, Dec> {
  return new Map(saved.prices.map(([d, p]) => [d, dec(p)]));
}
