import { describe, expect, it } from 'vitest';
import { dec, type Dec } from './money';
import { simulatePortfolio, splitParams, validatePortfolio, type PortfolioParams, type PortfolioResult } from './portfolio';

const series = (entries: Record<string, string>): Map<string, Dec> => new Map(Object.entries(entries).map(([d, p]) => [d, dec(p)]));

const prices = new Map([
  ['BTC', series({ '2024-01-01': '100', '2024-01-02': '50', '2024-01-03': '200' })],
  ['ETH', series({ '2024-01-02': '10', '2024-01-03': '20' })],
]);

const base: PortfolioParams = {
  assets: [
    { asset: 'btc', amountEur: '100' },
    { asset: 'ETH', amountEur: '50' },
  ],
  frequency: { kind: 'daily' },
  start: '2024-01-01',
  end: '2024-01-03',
  fee: { kind: 'percent', value: '0' },
};

function ok(r: ReturnType<typeof simulatePortfolio>): PortfolioResult {
  if (!r.ok) throw new Error(r.errors.join(' / '));
  return r;
}

describe('splitParams', () => {
  it('répartit le capital de départ au prorata, au centime, reste sur la dernière ligne', () => {
    const split = splitParams({
      ...base,
      assets: [
        { asset: 'A', amountEur: '1' },
        { asset: 'B', amountEur: '1' },
        { asset: 'C', amountEur: '1' },
      ],
      initialCapitalEur: '100',
    });
    expect(split.map((s) => s.initialCapitalEur)).toEqual(['33.33', '33.33', '33.34']);
    expect(split[0].asset).toBe('A');
  });
});

describe('validatePortfolio', () => {
  it('doublons, ligne vide, montant invalide', () => {
    const errors = validatePortfolio({
      ...base,
      assets: [
        { asset: 'BTC', amountEur: '10' },
        { asset: 'btc', amountEur: '10' },
        { asset: '', amountEur: '10' },
        { asset: 'SOL', amountEur: '0' },
      ],
    });
    expect(errors.some((e) => /BTC apparaît deux fois/.test(e))).toBe(true);
    expect(errors.some((e) => /choisissez un actif/i.test(e))).toBe(true);
    expect(errors.some((e) => /^SOL : le montant/.test(e))).toBe(true);
  });

  it('erreurs communes une seule fois', () => {
    const errors = validatePortfolio({ ...base, start: '2024-02-01', end: '2024-01-01' });
    expect(errors).toEqual(['La date de début doit précéder la date de fin.']);
  });

  it('aucune crypto', () => {
    expect(validatePortfolio({ ...base, assets: [] })).toEqual(['Ajoutez au moins une crypto.']);
  });
});

describe('simulatePortfolio', () => {
  it('additionne les cryptos et garde le détail par crypto', () => {
    const r = ok(simulatePortfolio(base, prices));
    expect(r.assets.map((a) => a.asset)).toEqual(['BTC', 'ETH']);
    expect(r.assets[0].share.toDecimalPlaces(4).toString()).toBe('0.6667');
    // BTC : 300 € investis, 3,5 BTC × 200 = 700 € ; ETH (coté le 2) : 100 €, 5 + 2,5 = 7,5 ETH × 20 = 150 €
    expect(r.dca.invested.toString()).toBe('400');
    expect(r.dca.value.toString()).toBe('850');
    expect(r.dca.pnl.toString()).toBe('450');
    expect(r.dca.purchases).toBe(5);
    expect(r.amountPerPeriod.toString()).toBe('150');
    expect(r.firstDate).toBe('2024-01-01');
    expect(r.assets[1].result.skipped).toEqual(['2024-01-01']);
  });

  it('achat unique : chaque crypto à sa première date, puis somme', () => {
    const r = ok(simulatePortfolio(base, prices));
    // BTC : 300 € à 100 → 3 BTC × 200 = 600 ; ETH : 100 € à 10 → 10 ETH × 20 = 200
    expect(r.lumpSum.value.toString()).toBe('800');
    expect(r.difference.toString()).toBe('50');
  });

  it('chronologie agrégée et achats triés par date', () => {
    const r = ok(simulatePortfolio(base, prices));
    expect(r.timeline.map((t) => [t.date, t.invested.toString(), t.value.toString()])).toEqual([
      ['2024-01-01', '100', '100'],
      ['2024-01-02', '250', '200'],
      ['2024-01-03', '400', '850'],
    ]);
    expect(r.purchases.map((p) => `${p.date} ${p.asset}`)).toEqual(['2024-01-01 BTC', '2024-01-02 BTC', '2024-01-02 ETH', '2024-01-03 BTC', '2024-01-03 ETH']);
  });

  it('une crypto sans cours : erreur nominative', () => {
    const r = simulatePortfolio({ ...base, assets: [...base.assets, { asset: 'ZZZ', amountEur: '10' }] }, prices);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatch(/^ZZZ : Aucun achat possible/);
  });

  it('une seule crypto : identique au moteur simple', () => {
    const r = ok(simulatePortfolio({ ...base, assets: [{ asset: 'BTC', amountEur: '100' }] }, prices));
    expect(r.dca.value.toString()).toBe(r.assets[0].result.dca.value.toString());
    expect(r.lumpSum.value.toString()).toBe('600');
  });
});
