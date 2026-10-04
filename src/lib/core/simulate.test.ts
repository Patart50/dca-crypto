import { describe, expect, it } from 'vitest';
import { dec, type Dec } from './money';
import { schedule, simulate, validateParams, type SimulationParams, type SimulationResult } from './simulate';

const series = (entries: Record<string, string>): Map<string, Dec> => new Map(Object.entries(entries).map(([d, p]) => [d, dec(p)]));

const base: SimulationParams = {
  asset: 'BTC',
  amountEur: '100',
  frequency: { kind: 'daily' },
  start: '2024-01-01',
  end: '2024-01-03',
  fee: { kind: 'percent', value: '0' },
};

function ok(r: ReturnType<typeof simulate>): SimulationResult {
  if (!r.ok) throw new Error(r.errors.join(' / '));
  return r;
}

describe('schedule', () => {
  it('quotidien, bornes incluses', () => {
    expect(schedule({ kind: 'daily' }, '2024-02-28', '2024-03-01')).toEqual(['2024-02-28', '2024-02-29', '2024-03-01']);
  });

  it('hebdomadaire : premier jour demandé à partir du début', () => {
    // 2024-01-01 est un lundi ; vendredi = 5.
    expect(schedule({ kind: 'weekly', weekday: 5 }, '2024-01-01', '2024-01-20')).toEqual(['2024-01-05', '2024-01-12', '2024-01-19']);
    expect(schedule({ kind: 'weekly', weekday: 1 }, '2024-01-01', '2024-01-08')).toEqual(['2024-01-01', '2024-01-08']);
  });

  it('mensuel : jour fixe, dates hors période écartées', () => {
    expect(schedule({ kind: 'monthly', day: 15 }, '2024-01-20', '2024-04-15')).toEqual(['2024-02-15', '2024-03-15', '2024-04-15']);
  });

  it('mensuel : dernier jour du mois, années bissextiles comprises', () => {
    expect(schedule({ kind: 'monthly', day: 'last' }, '2023-12-01', '2024-03-30')).toEqual(['2023-12-31', '2024-01-31', '2024-02-29']);
  });

  it('période vide', () => {
    expect(schedule({ kind: 'daily' }, '2024-02-02', '2024-02-01')).toEqual([]);
  });
});

describe('validateParams', () => {
  it('accepte des paramètres corrects', () => {
    expect(validateParams(base)).toEqual([]);
  });

  it('signale les erreurs de saisie', () => {
    const errors = validateParams({
      ...base,
      asset: ' ',
      amountEur: '-5',
      start: '2024-02-30',
      fee: { kind: 'percent', value: '100' },
      frequency: { kind: 'monthly', day: 31 },
    });
    expect(errors).toHaveLength(5);
  });

  it('frais fixes supérieurs au montant ou au capital de départ', () => {
    expect(validateParams({ ...base, fee: { kind: 'fixed', value: '100' } })).toHaveLength(1);
    expect(validateParams({ ...base, fee: { kind: 'fixed', value: '2' }, initialCapitalEur: '1' })).toHaveLength(1);
  });

  it('début après la fin', () => {
    expect(validateParams({ ...base, start: '2024-02-01', end: '2024-01-01' })).toEqual(['La date de début doit précéder la date de fin.']);
  });
});

describe('simulate', () => {
  const prices = series({ '2024-01-01': '100', '2024-01-02': '50', '2024-01-03': '200' });

  it('calcule quantité, PMP, valeur et latent', () => {
    const r = ok(simulate(base, prices));
    expect(r.purchases.map((p) => p.quantity.toString())).toEqual(['1', '2', '0.5']);
    expect(r.dca.invested.toString()).toBe('300');
    expect(r.dca.quantity.toString()).toBe('3.5');
    // PMP = 300 / 3,5
    expect(r.dca.avgPrice.toDecimalPlaces(6).toString()).toBe('85.714286');
    expect(r.dca.value.toString()).toBe('700');
    expect(r.dca.pnl.toString()).toBe('400');
    expect(r.dca.pnlPct.toDecimalPlaces(4).toString()).toBe('133.3333');
    expect(r.dca.bestPrice.toString()).toBe('50');
    expect(r.dca.worstPrice.toString()).toBe('200');
    expect(r.endPriceDate).toBe('2024-01-03');
  });

  it("compare avec l'achat unique au départ", () => {
    const r = ok(simulate(base, prices));
    expect(r.lumpSum.date).toBe('2024-01-01');
    expect(r.lumpSum.quantity.toString()).toBe('3');
    expect(r.lumpSum.value.toString()).toBe('600');
    expect(r.difference.toString()).toBe('100');
  });

  it('frais en pourcentage : montant saisi frais compris (D-003)', () => {
    const r = ok(simulate({ ...base, fee: { kind: 'percent', value: '1' } }, prices));
    const first = r.purchases[0];
    expect(first.amountEur.toString()).toBe('100');
    expect(first.feeEur.toString()).toBe('1');
    expect(first.quantity.toString()).toBe('0.99');
    expect(r.dca.fees.toString()).toBe('3');
    // PMP frais inclus : 300 / (0,99 + 1,98 + 0,495)
    expect(r.dca.avgPrice.toDecimalPlaces(6).toString()).toBe('86.580087');
    // Achat unique : 1 % de 300
    expect(r.lumpSum.fees.toString()).toBe('3');
    expect(r.lumpSum.quantity.toString()).toBe('2.97');
  });

  it("frais fixes : un frais par achat, un seul pour l'achat unique", () => {
    const r = ok(simulate({ ...base, fee: { kind: 'fixed', value: '2' } }, prices));
    expect(r.dca.fees.toString()).toBe('6');
    expect(r.purchases[1].quantity.toString()).toBe('1.96');
    expect(r.lumpSum.fees.toString()).toBe('2');
    expect(r.lumpSum.quantity.toString()).toBe('2.98');
  });

  it('capital de départ investi en plus à la première date', () => {
    const r = ok(simulate({ ...base, initialCapitalEur: '1000' }, prices));
    expect(r.purchases.map((p) => p.kind)).toEqual(['initial', 'regular', 'regular', 'regular']);
    expect(r.dca.invested.toString()).toBe('1300');
    expect(r.dca.purchases).toBe(4);
    expect(r.lumpSum.invested.toString()).toBe('1300');
  });

  it('échéances sans prix : écartées et listées ; achat unique à la première date achetée', () => {
    const r = ok(simulate({ ...base, start: '2023-12-30' }, prices));
    expect(r.skipped).toEqual(['2023-12-30', '2023-12-31']);
    expect(r.purchases).toHaveLength(3);
    expect(r.lumpSum.date).toBe('2024-01-01');
  });

  it('cours de fin : dernier cours connu avant la date de fin', () => {
    const r = ok(simulate({ ...base, end: '2024-01-05' }, prices));
    expect(r.endPriceDate).toBe('2024-01-03');
    expect(r.timeline).toHaveLength(5);
    expect(r.timeline[4].price.toString()).toBe('200');
  });

  it('chronologie journalière : investi, valeur, PMP, achat unique', () => {
    const r = ok(simulate({ ...base, frequency: { kind: 'weekly', weekday: 1 }, end: '2024-01-03' }, prices));
    expect(r.purchases).toHaveLength(1);
    expect(r.timeline.map((t) => [t.date, t.invested.toString(), t.value.toString(), t.lumpValue.toString()])).toEqual([
      ['2024-01-01', '100', '100', '100'],
      ['2024-01-02', '100', '50', '50'],
      ['2024-01-03', '100', '200', '200'],
    ]);
  });

  it('aucun prix : erreur explicite', () => {
    const r = simulate(base, new Map());
    expect(r.ok).toBe(false);
  });

  it('paramètres invalides : erreurs renvoyées', () => {
    const r = simulate({ ...base, amountEur: 'abc' }, prices);
    expect(r).toEqual({ ok: false, errors: ['Le montant par achat doit être un nombre positif.'] });
  });

  it('montants exacts sur de nombreux achats (pas de dérive flottante)', () => {
    const days: Record<string, string> = {};
    for (let d = 1; d <= 31; d++) days[`2024-01-${String(d).padStart(2, '0')}`] = '0.1';
    const r = ok(simulate({ ...base, amountEur: '0.3', end: '2024-01-31' }, series(days)));
    expect(r.dca.quantity.toString()).toBe('93');
    expect(r.dca.invested.toString()).toBe('9.3');
  });
});
