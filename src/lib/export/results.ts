/**
 * Exports CSV pour un tableur réglé en français : séparateur « ; », virgule
 * décimale, BOM UTF-8 (ouverture directe dans Excel ou LibreOffice).
 */
import { D, type Dec } from '../core/money';
import type { SimulationResult } from '../core/simulate';
import { dateFr } from '../core/format';
import { toCsv } from '../csv/csv';

const BOM = '\uFEFF';

/**
 * Nombre au format français, sans séparateur de milliers (lisible par un tableur).
 * Montants (2 décimales ou moins) à décimales fixes ; cours et quantités sans zéros inutiles.
 */
export function frNumber(d: Dec, places: number): string {
  const r = d.toDecimalPlaces(places, D.ROUND_HALF_UP);
  return (places <= 2 ? r.toFixed(places) : r.toFixed()).replace('.', ',');
}

export function purchasesCsv(result: SimulationResult): string {
  const headers = [
    'Date',
    'Type',
    'Montant décaissé (€)',
    'Frais (€)',
    'Cours (€)',
    'Quantité',
    'Total investi (€)',
    'Quantité cumulée',
    'Prix moyen après achat (€)',
  ];
  const rows = result.purchases.map((p) => [
    dateFr(p.date),
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

export function summaryCsv(result: SimulationResult): string {
  const { dca, lumpSum: lump } = result;
  const p = result.params;
  const freq =
    p.frequency.kind === 'daily'
      ? 'Quotidienne'
      : p.frequency.kind === 'weekly'
        ? `Hebdomadaire (jour ${p.frequency.weekday})`
        : `Mensuelle (${p.frequency.day === 'last' ? 'dernier jour' : `le ${p.frequency.day}`})`;
  const rows: string[][] = [
    ['Actif', p.asset.toUpperCase(), ''],
    ['Montant par achat (€)', frNumber(new D(p.amountEur.replace(',', '.')), 2), ''],
    ['Fréquence', freq, ''],
    ['Période', `${dateFr(p.start)} au ${dateFr(p.end)}`, ''],
    ['Frais', p.fee.kind === 'percent' ? `${p.fee.value} %` : `${p.fee.value} € par achat`, ''],
    ['Cours final (€)', frNumber(result.endPrice, 8), `au ${dateFr(result.endPriceDate)}`],
    ['', '', ''],
    ['Indicateur', 'DCA', `Achat unique au ${dateFr(lump.date)}`],
    ['Total investi (€)', frNumber(dca.invested, 2), frNumber(lump.invested, 2)],
    ['Frais (€)', frNumber(dca.fees, 2), frNumber(lump.fees, 2)],
    ['Quantité', frNumber(dca.quantity, 12), frNumber(lump.quantity, 12)],
    ['Prix moyen (€)', frNumber(dca.avgPrice, 8), frNumber(lump.avgPrice, 8)],
    ['Valeur finale (€)', frNumber(dca.value, 2), frNumber(lump.value, 2)],
    ['Plus-value latente (€)', frNumber(dca.pnl, 2), frNumber(lump.pnl, 2)],
    ['Plus-value latente (%)', frNumber(dca.pnlPct, 2), frNumber(lump.pnlPct, 2)],
    ['Nombre d’achats', String(dca.purchases), '1'],
    ['Écart de valeur DCA − achat unique (€)', frNumber(result.difference, 2), ''],
  ];
  return BOM + toCsv(['Simulation dca-crypto', '', ''], rows, ';');
}
