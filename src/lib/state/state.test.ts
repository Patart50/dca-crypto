import { describe, expect, it } from 'vitest';
import { dec, type Dec } from '../core/money';
import { dateFr, duration, eur, eurPrice, eurSigned, monthYear, pct, qty } from '../core/format';
import { simulate, type SimulationParams, type SimulationResult } from '../core/simulate';
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

const params: SimulationParams = {
  asset: 'ETH',
  amountEur: '50',
  frequency: { kind: 'monthly', day: 'last' },
  start: '2024-01-01',
  end: '2024-02-29',
  fee: { kind: 'fixed', value: '1' },
};
const prices = m({ '2024-01-31': '2000', '2024-02-29': '3000' });
const result = simulate(params, prices) as SimulationResult;

describe('sauvegarde JSON', () => {
  it('aller-retour sans perte', () => {
    const saved = makeBackup({ params, endMode: 'date', priceSource: 'csv', priceFile: 'eth.csv', prices, now: new Date('2024-03-01T00:00:00Z') });
    const back = readBackup(JSON.stringify(saved));
    expect(back).toEqual(saved);
    expect(backupPrices(back).get('2024-02-29')?.toString()).toBe('3000');
  });

  it('refuse un autre fichier, une version plus récente, des cours illisibles', () => {
    expect(() => readBackup('pas du json')).toThrow(BackupError);
    expect(() => readBackup(JSON.stringify({ app: 'pmpa-crypto' }))).toThrow(/pas une sauvegarde/);
    const saved = makeBackup({ params, endMode: 'date', priceSource: 'csv', prices });
    expect(() => readBackup(JSON.stringify({ ...saved, schemaVersion: 2 }))).toThrow(/plus récente/);
    expect(() => readBackup(JSON.stringify({ ...saved, prices: [['2024-13-01', '1']] }))).toThrow(/illisibles/);
    expect(() => readBackup(JSON.stringify({ ...saved, prices: [['2024-01-01', '-1']] }))).toThrow(/illisible/);
    expect(() => readBackup(JSON.stringify({ ...saved, params: { ...params, fee: { kind: 'x' } } }))).toThrow(/Paramètres/);
  });
});

describe('exports CSV pour tableur', () => {
  it('tableau des achats : point-virgule, virgule décimale, BOM', () => {
    const text = purchasesCsv(result);
    expect(text.charCodeAt(0)).toBe(0xfeff);
    const t = parseCsv(text);
    expect(t.delimiter).toBe(';');
    expect(t.rows).toHaveLength(2);
    expect(t.rows[0].slice(0, 6)).toEqual(['31/01/2024', 'Achat régulier', '50,00', '1,00', '2000', '0,0245']);
  });

  it('synthèse : DCA et achat unique côte à côte', () => {
    const t = parseCsv(summaryCsv(result));
    const row = (label: string) => t.rows.find((r) => r[0] === label);
    expect(row('Total investi (€)')).toEqual(['Total investi (€)', '100,00', '100,00']);
    expect(row('Frais (€)')).toEqual(['Frais (€)', '2,00', '1,00']);
    expect(row('Fréquence')?.[1]).toBe('Mensuelle (dernier jour)');
  });
});
