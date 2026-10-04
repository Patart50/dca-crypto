/**
 * Cours journaliers en euros via l'API publique de données de marché de
 * Binance (bougies d'un jour, clôture UTC, D-002). Appelé uniquement à la
 * demande de l'utilisateur, après consentement (même règle que pmpa D-026).
 *
 * Ce qui est envoyé : des noms de paires (ex. « BTCUSDT ») et des dates.
 * Jamais de montant ni d'identifiant.
 *
 * Chemins de conversion, pour chaque jour (D-004) :
 *   1. XEUR si la paire a une bougie ce jour-là ;
 *   2. sinon XUSDT ÷ EURUSDT ;
 *   3. sinon XUSDT ÷ taux BCE (dollars pour 1 euro), USDT assimilé au dollar.
 *
 * Liste des paires et hôtes repris de pmpa-crypto (commit 14849f5,
 * src/lib/prices/binance.ts, D-028) : n'interroger que des paires existantes,
 * car Binance répond à une paire inconnue sans en-tête CORS.
 */
import { dateToUtcMs, eachDay, utcMsToDate } from '../core/dates';
import { D, dec, type Dec } from '../core/money';
import type { EcbRates } from './ecb';

export type Fetcher = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

const HOSTS = ['https://data-api.binance.vision', 'https://api.binance.com'];
const LIMIT = 1000;
const DAY_MS = 86_400_000;

export class PriceFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PriceFetchError';
  }
}

export type Route = 'EUR' | 'USDT/EURUSDT' | 'USDT/BCE';

export interface EurSeries {
  asset: string;
  /** Clôture journalière en euros, par date. */
  prices: Map<string, Dec>;
  /** Chemin utilisé pour chaque date. */
  routes: Map<string, Route>;
  /** Nombre de jours par chemin. */
  routeCounts: Record<Route, number>;
  /** Dates sans cours (avant la cotation, ou taux BCE manquant). */
  missing: string[];
}

export class BinanceDaily {
  private symbolList: Promise<Set<string>> | null = null;
  private host = 0;

  constructor(private readonly fetcher: Fetcher = (url) => fetch(url)) {}

  /** Paires existantes, chargées une fois. */
  symbols(): Promise<Set<string>> {
    if (!this.symbolList) {
      this.symbolList = this.loadSymbols();
      this.symbolList.catch(() => (this.symbolList = null));
    }
    return this.symbolList;
  }

  /** Actifs cotés contre EUR ou USDT (proposés dans la liste de l'écran Paramètres). */
  async assets(): Promise<string[]> {
    const symbols = await this.symbols();
    const out = new Set<string>();
    for (const s of symbols) {
      const m = /^([A-Z0-9]+?)(EUR|USDT)$/.exec(s);
      if (m && m[1] !== 'EUR' && m[1] !== 'USDT') out.add(m[1]);
    }
    if (symbols.has('EURUSDT')) out.add('USDT');
    return [...out].sort();
  }

  private async loadSymbols(): Promise<Set<string>> {
    const data = (await this.get('/api/v3/ticker/price')) as { symbol: string }[];
    if (!Array.isArray(data) || data.length === 0) throw new PriceFetchError('Liste des paires Binance vide.');
    return new Set(data.map((d) => d.symbol));
  }

  /** Requête sur le premier hôte qui répond (celui qui a déjà répondu d'abord). */
  private async get(path: string): Promise<unknown> {
    let lastStatus = 0;
    for (let attempt = 0; attempt < HOSTS.length; attempt++) {
      const index = (this.host + attempt) % HOSTS.length;
      try {
        const res = await this.fetcher(`${HOSTS[index]}${path}`);
        if (!res.ok) {
          lastStatus = res.status;
          continue;
        }
        this.host = index;
        return await res.json();
      } catch {
        // hôte suivant
      }
    }
    throw new PriceFetchError(
      lastStatus
        ? `Binance a répondu avec une erreur (HTTP ${lastStatus}).`
        : 'Impossible de joindre Binance (connexion coupée ou accès bloqué par le navigateur).',
    );
  }

  /** Clôtures journalières d'une paire entre deux dates incluses (vide si la paire n'existe pas). */
  async closes(symbol: string, from: string, to: string): Promise<Map<string, Dec>> {
    const out = new Map<string, Dec>();
    if (!(await this.symbols()).has(symbol)) return out;
    const end = dateToUtcMs(to) + DAY_MS - 1;
    let start = dateToUtcMs(from);
    while (start <= end) {
      const candles = (await this.get(`/api/v3/klines?symbol=${symbol}&interval=1d&startTime=${start}&endTime=${end}&limit=${LIMIT}`)) as unknown[][];
      if (!Array.isArray(candles) || candles.length === 0) break;
      for (const c of candles) {
        try {
          const close = dec(String(c[4]));
          if (close.gt(0)) out.set(utcMsToDate(Number(c[0])), close);
        } catch {
          // bougie illisible : jour sans cours
        }
      }
      const lastOpen = Number(candles[candles.length - 1][0]);
      if (candles.length < LIMIT || !Number.isFinite(lastOpen)) break;
      start = lastOpen + DAY_MS;
    }
    return out;
  }

  /** Série de cours en euros d'un actif, jour par jour. */
  async eurSeries(asset: string, from: string, to: string, ecb: EcbRates | null): Promise<EurSeries> {
    const a = asset.trim().toUpperCase();
    if (a === 'EUR') throw new PriceFetchError("L'euro n'a pas de cours en euros.");
    const [direct, viaUsdt, eurUsdt] = await Promise.all([
      a === 'USDT' ? Promise.resolve(new Map<string, Dec>()) : this.closes(`${a}EUR`, from, to),
      a === 'USDT' ? Promise.resolve(null) : this.closes(`${a}USDT`, from, to),
      this.closes('EURUSDT', from, to),
    ]);
    return combineEurSeries(a, from, to, { direct, viaUsdt, eurUsdt }, ecb);
  }
}

const ONE = new D(1);

/**
 * Combine les séries de paires selon les chemins de conversion (fonction pure).
 * `viaUsdt` à null : l'actif est l'USDT lui-même (cours = 1 USDT).
 */
export function combineEurSeries(
  asset: string,
  from: string,
  to: string,
  pairs: { direct: Map<string, Dec>; viaUsdt: Map<string, Dec> | null; eurUsdt: Map<string, Dec> },
  ecb: EcbRates | null,
): EurSeries {
  const prices = new Map<string, Dec>();
  const routes = new Map<string, Route>();
  const routeCounts: Record<Route, number> = { EUR: 0, 'USDT/EURUSDT': 0, 'USDT/BCE': 0 };
  const missing: string[] = [];
  for (const date of eachDay(from, to)) {
    let price: Dec | undefined;
    let route: Route | undefined;
    const usdt = pairs.viaUsdt === null ? ONE : pairs.viaUsdt.get(date);
    const direct = pairs.direct.get(date);
    if (direct) {
      price = direct;
      route = 'EUR';
    } else if (usdt) {
      const eurUsdt = pairs.eurUsdt.get(date);
      if (eurUsdt) {
        price = usdt.dividedBy(eurUsdt);
        route = 'USDT/EURUSDT';
      } else {
        const rate = ecb?.usdPerEur(date);
        if (rate) {
          price = usdt.dividedBy(rate);
          route = 'USDT/BCE';
        }
      }
    }
    if (price && route) {
      prices.set(date, price);
      routes.set(date, route);
      routeCounts[route]++;
    } else missing.push(date);
  }
  return { asset, prices, routes, routeCounts, missing };
}
