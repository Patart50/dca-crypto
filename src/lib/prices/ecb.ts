/**
 * Taux de change EUR/USD de référence de la Banque centrale européenne,
 * embarqués dans l'application (D-004). Servent à convertir en euros les cours
 * en USDT des périodes où Binance n'avait aucune paire en euros.
 *
 * Le fichier `ecb-eurusd.json` est produit par `npm run update:ecb`
 * (scripts/update-ecb.mjs) ; aucun appel réseau à l'exécution.
 * Source : BCE, série EXR.D.USD.EUR.SP00.A (dollars pour 1 euro).
 */
import { dec, type Dec } from '../core/money';

export interface EcbData {
  source: string;
  url: string;
  /** Date de génération du fichier. */
  updated: string;
  /** [date AAAA-MM-JJ, dollars pour 1 euro], par date croissante. */
  rates: [string, string][];
}

/** Écart maximal entre la date demandée et le dernier taux publié (week-ends, jours fériés). */
const MAX_GAP_DAYS = 6;

export class EcbRates {
  private readonly dates: string[];
  private readonly values: Dec[];

  constructor(readonly data: EcbData) {
    const sorted = [...data.rates].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    this.dates = sorted.map((r) => r[0]);
    this.values = sorted.map((r) => dec(r[1]));
  }

  get first(): string | undefined {
    return this.dates[0];
  }

  get last(): string | undefined {
    return this.dates[this.dates.length - 1];
  }

  /** Dollars pour 1 euro à une date : dernier taux publié ce jour-là ou avant, à 6 jours au plus. */
  usdPerEur(date: string): Dec | null {
    let lo = 0;
    let hi = this.dates.length - 1;
    let found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (this.dates[mid] <= date) {
        found = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    if (found < 0) return null;
    const gap = (Date.parse(date) - Date.parse(this.dates[found])) / 86_400_000;
    return gap <= MAX_GAP_DAYS ? this.values[found] : null;
  }
}
