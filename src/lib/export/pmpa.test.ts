import { describe, expect, it } from 'vitest';
import { parseCsv } from '../csv/csv';
import { dec } from '../core/money';
import { simulate, type SimulationParams, type SimulationResult } from '../core/simulate';
import { PMPA_HEADERS, pmpaCsv } from './pmpa';

const prices = new Map([
  ['2024-01-01', dec('30000')],
  ['2024-01-02', dec('40000')],
]);

const params: SimulationParams = {
  asset: 'btc',
  amountEur: '100',
  frequency: { kind: 'daily' },
  start: '2024-01-01',
  end: '2024-01-02',
  fee: { kind: 'percent', value: '0.5' },
  initialCapitalEur: '1000',
};

function run(p: SimulationParams = params): SimulationResult {
  const r = simulate(p, prices);
  if (!r.ok) throw new Error(r.errors.join());
  return r;
}

describe('pmpaCsv', () => {
  it('produit les en-têtes de pmpa-crypto (§ 5.3) et une ligne buy par achat', () => {
    const table = parseCsv(pmpaCsv(run()));
    expect(table.headers).toEqual([...PMPA_HEADERS]);
    expect(table.rows).toHaveLength(3);
    const col = (name: string) => table.headers.indexOf(name);
    const [initial, first] = table.rows;
    expect(initial[col('date')]).toBe('2024-01-01T12:00:00');
    expect(initial[col('type')]).toBe('buy');
    expect(initial[col('in_asset')]).toBe('BTC');
    expect(initial[col('eur')]).toBe('995');
    expect(initial[col('fee_asset')]).toBe('EUR');
    expect(initial[col('fee_quantity')]).toBe('5');
    expect(initial[col('note')]).toBe('Capital de départ');
    expect(first[col('in_quantity')]).toBe('0.003316666666');
    expect(first[col('platform')]).toBe('Simulation dca-crypto');
  });

  it('eur + frais = montant décaissé, au centime près et sans perte', () => {
    const table = parseCsv(pmpaCsv(run({ ...params, amountEur: '33.33', fee: { kind: 'percent', value: '0.1' } })));
    const col = (name: string) => table.headers.indexOf(name);
    for (const row of table.rows.slice(1)) {
      expect(dec(row[col('eur')]).plus(row[col('fee_quantity')]).toString()).toBe('33.33');
    }
  });

  it('sans frais : colonnes de frais vides', () => {
    const table = parseCsv(pmpaCsv(run({ ...params, fee: { kind: 'percent', value: '0' } })));
    expect(table.rows[1][table.headers.indexOf('fee_quantity')]).toBe('');
  });

  it('identifiants stables et uniques', () => {
    const a = parseCsv(pmpaCsv(run()));
    const b = parseCsv(pmpaCsv(run()));
    const ids = a.rows.map((r) => r[a.headers.indexOf('id')]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(b.rows.map((r) => r[b.headers.indexOf('id')]));
    const c = parseCsv(pmpaCsv(run({ ...params, amountEur: '200' })));
    expect(c.rows[1][c.headers.indexOf('id')]).not.toBe(ids[1]);
  });
});
