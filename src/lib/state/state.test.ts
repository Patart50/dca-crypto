import { describe, expect, it } from 'vitest';
import { dec, type Dec } from '../core/money';
import { dateFr, duration, eur, eurPrice, eurSigned, monthYear, pct, qty } from '../core/format';
import { simulatePortfolio, type PortfolioParams, type PortfolioResult } from '../core/portfolio';
import { readCachedSeries, writeCachedSeries, cacheKey } from '../prices/cache';
import { combineEurSeries } from '../prices/binance';
import { purchasesCsv, summaryCsv } from '../export/results';
import { parseCsv } from '../csv/csv';
import { BackupError, backupPrices, makeBackup, readBackup } from './backup';
import { MemoryStore, readJson, writeJson } from './storage';

// Espaces insécables d'Intl ramenées à des espaces simples pour la lisibilité des tests.
const plain = (s: string) => s.replace(/[  ]/g, ' ');
const m = (entries: Record<string, string>): Map<string, Dec> => new Map(Object.entries(entries).map(([d, p]) => [d, dec(p)]));

describe('format', () => {
  it('montants, cours, quantités, pourcentages', () => {
    expect(plain(eur(dec('1234.565')))).toBe('1 234,57 €');
    expect(plain(eurSigned(dec('-4')))).toBe('−4,00 €');
    expect(plain(eurSigned(dec('12.3')))).toBe('+12,30 €');
    expect(plain(eurPrice(dec('56789.1234')))).toBe('56 789,12 €');
    expect(plain(eurPrice(dec('2.345678')))).toBe('2,3457 €');
    expect(plain(eurPrice(dec('0.000012345678')))).toBe('0,0000123457 €');
    expect(plain(qty(dec('0.123456789')))).toBe('0,12345678');
    expect(plain(pct(dec('12.345')))).toBe('+12,3 %');
    expect(plain(pct(dec('-3.21')))).toBe('−3,2 %');
  });

  it('dates et durées', () => {
    expect(dateFr('2024-03-01')).toBe('01/03/2024');
    expect(monthYear('2024-08-15')).toBe('août 2024');
    expect(duration('2021-01-01', '2024-03-15')).toBe('3 ans et 2 mois');
    expect(duration('2024-01-01', '2024-01-10')).toBe('10 jours');
    expect(duration('2023-01-01', '2024-01-01')).toBe('1 an');
  });
});

describe('stockage', () => {
  it('lit et écrit du JSON, ignore les valeurs illisibles', () => {
    const s = new MemoryStore();
    expect(writeJson(s, 'a', { x: 1 })).toBe(true);
    expect(readJson(s, 'a')).toEqual({ x: 1 });
    s.setItem('dca-crypto:b', '{oops');
    expect(readJson(s, 'b')).toBeNull();
  });

  it("signale un refus d'écriture (quota)", () => {
    const s = new MemoryStore();
    s.setItem = () => {
      throw new Error('QuotaExceededError');
    };
    expect(writeJson(s, 'a', 1)).toBe(false);
  });
});

describe('cache des cours', () => {
  const series = (from: string, to: string, prices: Record<string, string>) =>
    combineEurSeries('BTC', from, to, { direct: m(prices), viaUsdt: new Map(), eurUsdt: new Map() }, null);
  const NOW = Date.parse('2024-06-10T12:00:00Z');

  it('réutilise une période passée, quelle que soit la date', () => {
    const s = new MemoryStore();
    writeCachedSeries(s, series('2024-01-01', '2024-01-03', { '2024-01-01': '1', '2024-01-02': '2', '2024-01-03': '3' }), '2024-01-01', '2024-01-03', NOW);
    const hit = readCachedSeries(s, 'btc', '2024-01-02', '2024-01-03', NOW + 30 * 86_400_000);
    expect(hit?.prices.size).toBe(2);
    expect(hit?.routeCounts.EUR).toBe(2);
    expect(readCachedSeries(s, 'BTC', '2023-12-31', '2024-01-03', NOW)).toBeNull();
  });

  it("le jour en cours n'est réutilisé qu'une heure", () => {
    const s = new MemoryStore();
    writeCachedSeries(s, series('2024-06-09', '2024-06-10', { '2024-06-09': '1', '2024-06-10': '2' }), '2024-06-09', '2024-06-10', NOW);
    expect(readCachedSeries(s, 'BTC', '2024-06-09', '2024-06-10', NOW + 30 * 60_000)).not.toBeNull();
    expect(readCachedSeries(s, 'BTC', '2024-06-09', '2024-06-10', NOW + 2 * 3_600_000)).toBeNull();
    expect(readCachedSeries(s, 'BTC', '2024-06-09', '2024-06-09', NOW + 2 * 3_600_000)).not.toBeNull();
  });

  it('fusionne des périodes qui se touchent, remplace sinon', () => {
    const s = new MemoryStore();
    writeCachedSeries(s, series('2024-01-01', '2024-01-02', { '2024-01-01': '1', '2024-01-02': '2' }), '2024-01-01', '2024-01-02', NOW);
    writeCachedSeries(s, series('2024-01-03', '2024-01-04', { '2024-01-03': '3', '2024-01-04': '4' }), '2024-01-03', '2024-01-04', NOW);
    expect(readCachedSeries(s, 'BTC', '2024-01-01', '2024-01-04', NOW)?.prices.size).toBe(4);
    writeCachedSeries(s, series('2024-03-01', '2024-03-01', { '2024-03-01': '9' }), '2024-03-01', '2024-03-01', NOW);
    expect(readCachedSeries(s, 'BTC', '2024-01-01', '2024-01-04', NOW)).toBeNull();
    expect(readJson<{ from: string }>(s, cacheKey('BTC'))?.from).toBe('2024-03-01');
  });

  it('jours sans cours : listés comme manquants', () => {
    const s = new MemoryStore();
    writeCachedSeries(s, series('2024-01-01', '2024-01-03', { '2024-01-03': '3' }), '2024-01-01', '2024-01-03', NOW);
    expect(readCachedSeries(s, 'BTC', '2024-01-01', '2024-01-03', NOW)?.missing).toEqual(['2024-01-01', '2024-01-02']);
  });
});

const params: PortfolioParams = {
  assets: [
    { asset: 'ETH', amountEur: '50' },
    { asset: 'SOL', amountEur: '25' },
  ],
  frequency: { kind: 'monthly', day: 'last' },
  start: '2024-01-01',
  end: '2024-02-29',
  fee: { kind: 'fixed', value: '1' },
};
const prices = new Map([
  ['ETH', m({ '2024-01-31': '2000', '2024-02-29': '3000' })],
  ['SOL', m({ '2024-01-31': '80', '2024-02-29': '100' })],
]);
const result = simulatePortfolio(params, prices) as PortfolioResult;

describe('sauvegarde JSON', () => {
  it('aller-retour sans perte, plusieurs cryptos', () => {
    const saved = makeBackup({ params, endMode: 'date', prices, priceFiles: { SOL: 'sol.csv' }, now: new Date('2024-03-01T00:00:00Z') });
    const back = readBackup(JSON.stringify(saved));
    expect(back).toEqual(saved);
    expect(backupPrices(back).get('SOL')?.get('2024-02-29')?.toString()).toBe('100');
  });

  it('migre une sauvegarde de version 1 (une crypto)', () => {
    const v1 = {
      app: 'dca-crypto',
      schemaVersion: 1,
      exportedAt: '2026-10-04T00:00:00Z',
      params: { asset: 'btc', amountEur: '100', frequency: { kind: 'daily' }, start: '2024-01-01', end: '2024-01-02', fee: { kind: 'percent', value: '0.1' } },
      endMode: 'date',
      priceSource: 'csv',
      priceFile: 'btc.csv',
      prices: [['2024-01-01', '40000']],
    };
    const back = readBackup(JSON.stringify(v1));
    expect(back.schemaVersion).toBe(2);
    expect(back.params.assets).toEqual([{ asset: 'BTC', amountEur: '100' }]);
    expect(back.prices.BTC).toEqual([['2024-01-01', '40000']]);
    expect(back.priceFiles).toEqual({ BTC: 'btc.csv' });
  });

  it('refuse un autre fichier, une version plus récente, des cours illisibles', () => {
    expect(() => readBackup('pas du json')).toThrow(BackupError);
    expect(() => readBackup(JSON.stringify({ app: 'pmpa-crypto' }))).toThrow(/pas une sauvegarde/);
    const saved = makeBackup({ params, endMode: 'date', prices });
    expect(() => readBackup(JSON.stringify({ ...saved, schemaVersion: 3 }))).toThrow(/plus récente/);
    expect(() => readBackup(JSON.stringify({ ...saved, prices: { ETH: [['2024-13-01', '1']] } }))).toThrow(/illisibles/);
    expect(() => readBackup(JSON.stringify({ ...saved, prices: { ETH: [['2024-01-01', '-1']] } }))).toThrow(/illisible/);
    expect(() => readBackup(JSON.stringify({ ...saved, params: { ...params, fee: { kind: 'x' } } }))).toThrow(/Paramètres/);
    expect(() => readBackup(JSON.stringify({ ...saved, params: { ...params, assets: [] } }))).toThrow(/cryptos/);
  });
});

describe('exports CSV pour tableur', () => {
  it('tableau des achats : colonne actif, point-virgule, virgule décimale, BOM', () => {
    const text = purchasesCsv(result);
    expect(text.charCodeAt(0)).toBe(0xfeff);
    const t = parseCsv(text);
    expect(t.delimiter).toBe(';');
    expect(t.rows).toHaveLength(4);
    expect(t.rows[0].slice(0, 7)).toEqual(['31/01/2024', 'ETH', 'Achat régulier', '50,00', '1,00', '2000', '0,0245']);
    expect(t.rows[1][1]).toBe('SOL');
  });

  it('synthèse : une ligne par crypto, puis DCA et achat unique', () => {
    const t = parseCsv(summaryCsv(result));
    const row = (label: string) => t.rows.find((r) => r[0] === label);
    expect(row('Montant par échéance (€)')?.[1]).toBe('75,00');
    expect(row('SOL')?.slice(0, 3)).toEqual(['SOL', '25,00', '50,00']);
    expect(row('Total investi (€)')?.slice(0, 3)).toEqual(['Total investi (€)', '150,00', '150,00']);
    expect(row('Frais (€)')?.slice(0, 3)).toEqual(['Frais (€)', '4,00', '2,00']);
    expect(row('Fréquence')?.[1]).toBe('Mensuelle (dernier jour)');
  });
});
