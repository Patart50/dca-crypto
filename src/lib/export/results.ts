/**
 * Exports CSV pour un tableur réglé en français : séparateur « ; », virgule
 * décimale, BOM UTF-8 (ouverture directe dans Excel ou LibreOffice).
 */
import { D, type Dec } from '../core/money';
import type { PortfolioResult } from '../core/portfolio';
import { dateFr } from '../core/format';
import { toCsv } from '../csv/csv';

const BOM = '﻿';

/**
 * Nombre au format français, sans séparateur de milliers (lisible par un tableur).
 * Montants (2 décimales ou moins) à décimales fixes ; cours et quantités sans zéros inutiles.
 */
export function frNumber(d: Dec, places: number): string {
  const r = d.toDecimalPlaces(places, D.ROUND_HALF_UP);
  return (places <= 2 ? r.toFixed(places) : r.toFixed()).replace('.', ',');
}

export function purchasesCsv(result: PortfolioResult): string {
  const headers = [
    'Date',
    'Actif',
    'Type',
    'Montant décaissé (€)',
    'Frais (€)',
    'Cours (€)',
    'Quantité',
    'Total investi sur l’actif (€)',
    'Quantité cumulée',
    'Prix moyen après achat (€)',
  ];
  const rows = result.purchases.map((p) => [
    dateFr(p.date),
    p.asset,
    p.kind === 'initial' ? 'Capital de départ' : 'Achat régulier',
    frNumber(p.amountEur, 2),
    frNumber(p.feeEur, 2),
    frNumber(p.price, 8),
    frNumber(p.quantity, 12),
    frNumber(p.cumInvested, 2),
    frNumber(p.cumQuantity, 12),
    frNumber(p.avgPrice, 8),
  ]);
  return BOM + toCsv(headers, rows, ';');
}

export function summaryCsv(result: PortfolioResult): string {
  const p = result.params;
  const freq =
    p.frequency.kind === 'daily'
      ? 'Quotidienne'
      : p.frequency.kind === 'weekly'
        ? `Hebdomadaire (jour ${p.frequency.weekday})`
        : `Mensuelle (${p.frequency.day === 'last' ? 'dernier jour' : `le ${p.frequency.day}`})`;
  const blank = ['', '', '', '', '', '', '', ''];
  const line = (...cells: string[]) => [...cells, ...blank].slice(0, 8);
  const rows: string[][] = [
    line('Montant par échéance (€)', frNumber(result.amountPerPeriod, 2)),
    line('Fréquence', freq),
    line('Période', `${dateFr(p.start)} au ${dateFr(p.end)}`),
    line('Frais', p.fee.kind === 'percent' ? `${p.fee.value} %` : `${p.fee.value} € par achat`),
    line('Capital de départ (€)', p.initialCapitalEur ? frNumber(new D(p.initialCapitalEur), 2) : '0,00'),
    line(),
    ['Actif', 'Montant par échéance (€)', 'Total investi (€)', 'Quantité', 'Prix moyen (€)', 'Cours final (€)', 'Valeur finale (€)', 'Plus-value latente (€)'],
    ...result.assets.map(({ asset, result: r }) => [
      asset,
      frNumber(new D(r.params.amountEur), 2),
      frNumber(r.dca.invested, 2),
      frNumber(r.dca.quantity, 12),
      frNumber(r.dca.avgPrice, 8),
      frNumber(r.endPrice, 8),
      frNumber(r.dca.value, 2),
      frNumber(r.dca.pnl, 2),
    ]),
    line(),
    line('Indicateur', 'DCA', 'Achat unique au départ'),
    line('Total investi (€)', frNumber(result.dca.invested, 2), frNumber(result.lumpSum.invested, 2)),
    line('Frais (€)', frNumber(result.dca.fees, 2), frNumber(result.lumpSum.fees, 2)),
    line('Valeur finale (€)', frNumber(result.dca.value, 2), frNumber(result.lumpSum.value, 2)),
    line('Plus-value latente (€)', frNumber(result.dca.pnl, 2), frNumber(result.lumpSum.pnl, 2)),
    line('Plus-value latente (%)', frNumber(result.dca.pnlPct, 2), frNumber(result.lumpSum.pnlPct, 2)),
    line('Nombre d’achats', String(result.dca.purchases), String(result.assets.length)),
    line('Écart de valeur DCA − achat unique (€)', frNumber(result.difference, 2)),
  ];
  return BOM + toCsv(line('Simulation dca-crypto'), rows, ';');
}
