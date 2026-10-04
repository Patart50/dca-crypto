/**
 * Export des achats simulés au format CSV de pmpa-crypto (SPEC pmpa § 5.3).
 * Réimportable dans pmpa-crypto : une ligne `buy` par achat.
 *
 * Correspondance avec la convention de pmpa-crypto :
 * - `eur` = euros payés hors frais, `fee_asset` = EUR, `fee_quantity` = frais ;
 *   pmpa ajoute les frais au prix d'acquisition (pmpa D-009), on retrouve donc
 *   exactement le montant décaissé de la simulation ;
 * - heure fixée à 12:00, heure de Paris : le jour reste celui de la bougie
 *   journalière utilisée (D-008) ;
 * - identifiant stable : réexporter la même simulation ne crée pas de doublon
 *   à l'import dans pmpa-crypto.
 */
import type { SimulationResult } from '../core/simulate';
import { D } from '../core/money';
import { toCsv } from '../csv/csv';

/** En-têtes de pmpa-crypto, dans l'ordre (SPEC pmpa § 5.3). */
export const PMPA_HEADERS = [
  'date',
  'type',
  'in_asset',
  'in_quantity',
  'out_asset',
  'out_quantity',
  'eur',
  'fee_asset',
  'fee_quantity',
  'fee_eur',
  'portfolio_value_eur',
  'fiscal_cost_eur',
  'moved_asset',
  'moved_quantity',
  'platform',
  'note',
  'id',
] as const;

export const PMPA_PLATFORM = 'Simulation dca-crypto';

/** Décimales gardées pour les quantités exportées (troncature). */
const QTY_DECIMALS = 12;

/** Hachage FNV-1a 32 bits, en base 36. */
function fnv(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** Lignes d'un actif simulé. */
function pmpaRows(result: SimulationResult): string[][] {
  const p = result.params;
  const asset = p.asset.trim().toUpperCase();
  const signature = fnv(JSON.stringify([asset, p.amountEur, p.fee, p.frequency, p.initialCapitalEur ?? '']));
  const rows = result.purchases.map((buy) => {
    const net = buy.amountEur.minus(buy.feeEur).toDecimalPlaces(8, D.ROUND_HALF_UP);
    const fee = buy.amountEur.minus(net);
    const row: Record<(typeof PMPA_HEADERS)[number], string> = {
      date: `${buy.date}T12:00:00`,
      type: 'buy',
      in_asset: asset,
      in_quantity: buy.quantity.toDecimalPlaces(QTY_DECIMALS, D.ROUND_DOWN).toFixed(),
      out_asset: '',
      out_quantity: '',
      eur: net.toFixed(),
      fee_asset: fee.isZero() ? '' : 'EUR',
      fee_quantity: fee.isZero() ? '' : fee.toFixed(),
      fee_eur: '',
      portfolio_value_eur: '',
      fiscal_cost_eur: '',
      moved_asset: '',
      moved_quantity: '',
      platform: PMPA_PLATFORM,
      note: buy.kind === 'initial' ? 'Capital de départ' : 'Achat DCA',
      id: `dca-${asset}-${buy.date}-${buy.kind}-${signature}`,
    };
    return PMPA_HEADERS.map((h) => row[h]);
  });
  return rows;
}

/** Export d'un ou plusieurs actifs simulés, triés par date. */
export function pmpaCsv(results: SimulationResult | SimulationResult[]): string {
  const list = Array.isArray(results) ? results : [results];
  const rows = list.flatMap(pmpaRows).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return toCsv([...PMPA_HEADERS], rows);
}
