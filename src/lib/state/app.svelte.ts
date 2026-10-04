/**
 * État de l'application : formulaire, réglages, cours, résultat.
 * Persisté en localStorage (formulaire, réglages, cours importés, cache Binance).
 */
import { isIsoDate, utcMsToDate } from '../core/dates';
import { dec, type Dec } from '../core/money';
import { simulate, validateParams, type Frequency, type SimulationParams, type SimulationResult } from '../core/simulate';
import { BinanceDaily, PriceFetchError, type Route } from '../prices/binance';
import { readCachedSeries, writeCachedSeries } from '../prices/cache';
import { parsePriceCsv } from '../prices/csvPrices';
import { EcbRates, type EcbData } from '../prices/ecb';
import { backupPrices, makeBackup, readBackup, type EndMode, type PriceSource } from './backup';
import { openStore, readJson, removeKey, writeJson } from './storage';

export type Theme = 'auto' | 'light' | 'dark';

export interface Form {
  asset: string;
  amount: string;
  frequency: Frequency['kind'];
  /** 1 = lundi … 7 = dimanche. */
  weekday: number;
  /** « 1 » à « 28 », ou « last ». */
  monthDay: string;
  start: string;
  endMode: EndMode;
  end: string;
  feeKind: 'percent' | 'fixed';
  feeValue: string;
  initial: string;
  source: PriceSource;
}

export interface Settings {
  theme: Theme;
  /** Consentement aux appels à l'API publique de Binance (D-002 de pmpa : opt-in, mémorisé). */
  allowPriceFetch: boolean;
}

export interface CsvPrices {
  fileName: string;
  prices: Map<string, Dec>;
  first?: string;
  last?: string;
  /** Lignes illisibles ignorées. */
  errorCount: number;
  errors: string[];
}

export interface PriceInfo {
  source: PriceSource;
  /** Jours par chemin de conversion (Binance). */
  routes?: Record<Route, number>;
  /** Premier jour avec un cours dans la période. */
  first?: string;
  /** Cours lus depuis le cache local (aucun appel réseau). */
  fromCache?: boolean;
  /** Taux BCE embarqués indisponibles (version de développement). */
  noEcb?: boolean;
}

export const POPULAR_ASSETS = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'DOGE', 'DOT', 'LINK', 'AVAX', 'LTC', 'USDT'];

/** Date du jour en UTC : celle de la bougie journalière en cours (D-002). */
export const todayUtc = () => utcMsToDate(Date.now());

function defaultForm(): Form {
  const year = Number(todayUtc().slice(0, 4));
  return {
    asset: 'BTC',
    amount: '100',
    frequency: 'monthly',
    weekday: 1,
    monthDay: '1',
    start: `${year - 4}-01-01`,
    endMode: 'today',
    end: todayUtc(),
    feeKind: 'percent',
    feeValue: '0,1',
    initial: '',
    source: 'binance',
  };
}

const num = (s: string) => s.trim().replace(/\s/g, '').replace(',', '.');

const FORM_KEY = 'simulation';
const SETTINGS_KEY = 'reglages';
const CSV_KEY = 'prix:csv';
const ASSETS_KEY = 'actifs-binance';

class AppState {
  private readonly storage = openStore();
  readonly persistent = this.storage.persistent;
  private readonly binance = new BinanceDaily();
  private ecb: Promise<EcbRates | null> | null = null;

  form = $state<Form>(defaultForm());
  settings = $state<Settings>({ theme: 'auto', allowPriceFetch: false });
  csv = $state.raw<CsvPrices | null>(null);
  assets = $state.raw<string[]>(POPULAR_ASSETS);

  status = $state<'idle' | 'loading' | 'consent' | 'done' | 'error'>('idle');
  errors = $state.raw<string[]>([]);
  result = $state.raw<SimulationResult | null>(null);
  priceInfo = $state.raw<PriceInfo | null>(null);
  /** Cours utilisés par le dernier résultat (pour la sauvegarde). */
  private usedPrices: Map<string, Dec> = new Map();
  toast = $state<string | null>(null);
  private toastTimer: ReturnType<typeof setTimeout> | undefined;

  init() {
    const store = this.storage.store;
    const saved = readJson<Partial<Form>>(store, FORM_KEY);
    if (saved) this.form = { ...defaultForm(), ...saved };
    if (this.form.endMode === 'today') this.form.end = todayUtc();
    const settings = readJson<Partial<Settings>>(store, SETTINGS_KEY);
    if (settings) this.settings = { ...this.settings, ...settings };
    const csv = readJson<{ fileName: string; rows: [string, string][]; errorCount?: number }>(store, CSV_KEY);
    if (csv) this.setCsv(csv.fileName, new Map(csv.rows.map(([d, p]) => [d, dec(p)])), csv.errorCount ?? 0, [], false);
    const assets = readJson<{ day: string; list: string[] }>(store, ASSETS_KEY);
    if (assets?.list?.length) this.assets = assets.list;
    // Relance la dernière simulation sans réseau (cache ou cours importés).
    void this.run({ offline: true });
  }

  saveForm() {
    writeJson(this.storage.store, FORM_KEY, this.form);
  }

  setTheme(theme: Theme) {
    this.settings.theme = theme;
    writeJson(this.storage.store, SETTINGS_KEY, this.settings);
  }

  setConsent(allow: boolean) {
    this.settings.allowPriceFetch = allow;
    writeJson(this.storage.store, SETTINGS_KEY, this.settings);
    if (!allow && this.status === 'consent') this.status = 'idle';
  }

  notify(message: string) {
    this.toast = message;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.toast = null), 5000);
  }

  /** Paramètres du moteur à partir du formulaire. */
  params(): SimulationParams {
    const f = this.form;
    const frequency: Frequency =
      f.frequency === 'daily'
        ? { kind: 'daily' }
        : f.frequency === 'weekly'
          ? { kind: 'weekly', weekday: Number(f.weekday) }
          : { kind: 'monthly', day: f.monthDay === 'last' ? 'last' : Number(f.monthDay) };
    return {
      asset: f.asset.trim().toUpperCase(),
      amountEur: num(f.amount),
      frequency,
      start: f.start,
      end: f.endMode === 'today' ? todayUtc() : f.end,
      fee: { kind: f.feeKind, value: num(f.feeValue) || '0' },
      ...(num(f.initial) ? { initialCapitalEur: num(f.initial) } : {}),
    };
  }

  private loadEcb(): Promise<EcbRates | null> {
    if (!this.ecb) {
      this.ecb = import('../prices/ecb-eurusd.json')
        .then((m) => {
          const data = m.default as EcbData;
          return data.rates.length > 0 ? new EcbRates(data) : null;
        })
        .catch(() => null);
    }
    return this.ecb;
  }

  /**
   * Lance la simulation. `offline` : n'utilise que le cache ou les cours
   * importés, sans jamais contacter Binance ni demander le consentement.
   */
  async run(options: { offline?: boolean } = {}) {
    const params = this.params();
    const errors = validateParams(params);
    if (params.end > todayUtc()) errors.push('La date de fin ne peut pas être dans le futur.');
    if (errors.length) {
      if (options.offline) return;
      this.errors = errors;
      this.status = 'error';
      return;
    }
    this.errors = [];

    let prices: Map<string, Dec>;
    let info: PriceInfo;
    if (this.form.source === 'csv') {
      if (!this.csv) {
        if (options.offline) return;
        this.errors = ['Importez d’abord un fichier de prix.'];
        this.status = 'error';
        return;
      }
      prices = this.csv.prices;
      info = { source: 'csv' };
    } else {
      const cached = readCachedSeries(this.storage.store, params.asset, params.start, params.end);
      if (cached) {
        prices = cached.prices;
        info = { source: 'binance', routes: cached.routeCounts, fromCache: true };
      } else if (options.offline) {
        return;
      } else if (!this.settings.allowPriceFetch) {
        this.status = 'consent';
        return;
      } else {
        this.status = 'loading';
        try {
          const ecb = await this.loadEcb();
          const series = await this.binance.eurSeries(params.asset, params.start, params.end, ecb);
          writeCachedSeries(this.storage.store, series, params.start, params.end);
          prices = series.prices;
          info = { source: 'binance', routes: series.routeCounts, noEcb: ecb === null };
          void this.refreshAssets();
        } catch (e) {
          this.errors = [e instanceof PriceFetchError ? e.message : `Chargement des cours impossible : ${String(e)}`];
          this.status = 'error';
          return;
        }
      }
    }

    const r = simulate(params, prices);
    if (!r.ok) {
      if (options.offline) return;
      const hint =
        this.form.source === 'binance' && prices.size === 0
          ? [`Binance n’a aucun cours pour ${params.asset} sur cette période (actif inconnu, ou coté après la date de fin). Vérifiez le symbole ou importez un fichier de prix.`]
          : [];
      this.errors = hint.length ? hint : r.errors;
      this.status = 'error';
      this.result = null;
      return;
    }
    info.first = [...prices.keys()].filter((d) => d >= params.start && d <= params.end).sort()[0];
    this.usedPrices = new Map([...prices].filter(([d]) => d >= params.start && d <= params.end));
    this.priceInfo = info;
    this.result = r;
    this.status = 'done';
  }

  private async refreshAssets() {
    try {
      const list = await this.binance.assets();
      if (list.length) {
        this.assets = list;
        writeJson(this.storage.store, ASSETS_KEY, { day: todayUtc(), list });
      }
    } catch {
      // liste par défaut conservée
    }
  }

  private setCsv(fileName: string, prices: Map<string, Dec>, errorCount: number, errors: string[], persist = true) {
    const dates = [...prices.keys()].sort();
    this.csv = { fileName, prices, first: dates[0], last: dates[dates.length - 1], errorCount, errors };
    if (persist) {
      const ok = writeJson(this.storage.store, CSV_KEY, { fileName, errorCount, rows: dates.map((d) => [d, prices.get(d)!.toString()]) });
      if (!ok) this.notify('Fichier de prix chargé, mais trop volumineux pour être gardé sur cet appareil.');
    }
  }

  /** Importe un fichier CSV de prix ; renvoie un message d'erreur ou null. */
  importCsv(fileName: string, text: string): string | null {
    try {
      const r = parsePriceCsv(text);
      if (r.prices.size === 0) return `Aucun cours lisible dans ${fileName}.${r.errors.length ? ` ${r.errors[0]}.` : ''}`;
      this.setCsv(fileName, r.prices, r.errorCount, r.errors);
      this.form.source = 'csv';
      this.saveForm();
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  }

  clearCsv() {
    this.csv = null;
    removeKey(this.storage.store, CSV_KEY);
    if (this.form.source === 'csv') this.form.source = 'binance';
  }

  backupJson(): string | null {
    if (!this.result) return null;
    const saved = makeBackup({
      params: this.result.params,
      endMode: this.form.endMode,
      priceSource: this.form.source,
      priceFile: this.form.source === 'csv' ? this.csv?.fileName : undefined,
      prices: this.usedPrices,
    });
    return JSON.stringify(saved, null, 1);
  }

  /** Ouvre une sauvegarde : ses cours deviennent la source « fichier », puis la simulation est relancée. */
  async openBackup(fileName: string, text: string): Promise<string | null> {
    try {
      const saved = readBackup(text);
      const p = saved.params;
      const f = p.frequency;
      this.form = {
        ...this.form,
        asset: p.asset,
        amount: p.amountEur.replace('.', ','),
        frequency: f.kind,
        weekday: f.kind === 'weekly' ? f.weekday : this.form.weekday,
        monthDay: f.kind === 'monthly' ? String(f.day) : this.form.monthDay,
        start: p.start,
        endMode: 'date',
        end: isIsoDate(p.end) ? p.end : this.form.end,
        feeKind: p.fee.kind,
        feeValue: p.fee.value.replace('.', ','),
        initial: (p.initialCapitalEur ?? '').replace('.', ','),
        source: 'csv',
      };
      this.setCsv(saved.priceFile ?? `sauvegarde ${fileName}`, backupPrices(saved), 0, []);
      this.saveForm();
      await this.run();
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  }
}

export const app = new AppState();
