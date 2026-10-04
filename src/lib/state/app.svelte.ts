/**
 * État de l'application : formulaire, réglages, cours, résultat.
 * Persisté en localStorage (formulaire, réglages, cours importés, cache Binance).
 */
import { isIsoDate, utcMsToDate } from '../core/dates';
import { dec, type Dec } from '../core/money';
import { MAX_ASSETS, simulatePortfolio, validatePortfolio, type PortfolioParams, type PortfolioResult } from '../core/portfolio';
import type { Frequency } from '../core/simulate';
import { BinanceDaily, PriceFetchError, type Route } from '../prices/binance';
import { readCachedSeries, writeCachedSeries } from '../prices/cache';
import { parsePriceCsv } from '../prices/csvPrices';
import { EcbRates, type EcbData } from '../prices/ecb';
import { backupPrices, makeBackup, readBackup, type EndMode } from './backup';
import { openStore, readJson, removeKey, writeJson } from './storage';

export type Theme = 'auto' | 'light' | 'dark';

export interface AssetRow {
  /** Identifiant stable de la ligne (clé d'affichage). */
  id: number;
  asset: string;
  amount: string;
}

export interface Form {
  assets: AssetRow[];
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
}

export interface Settings {
  theme: Theme;
  /** Consentement aux appels à l'API publique de Binance (D-011 : opt-in, mémorisé, révocable). */
  allowPriceFetch: boolean;
}

export interface CsvPrices {
  fileName: string;
  prices: Map<string, Dec>;
  first?: string;
  last?: string;
  /** Lignes illisibles ignorées. */
  errorCount: number;
}

export interface AssetPriceInfo {
  source: 'binance' | 'csv';
  routes?: Record<Route, number>;
  fromCache?: boolean;
  fileName?: string;
}

export interface PriceInfo {
  byAsset: Record<string, AssetPriceInfo>;
  /** Taux BCE embarqués indisponibles (version de développement). */
  noEcb?: boolean;
}

/** Résultat de la vérification d'un symbole. */
export type AssetCheck = 'empty' | 'csv' | 'binance' | 'unknown' | 'unchecked';

export const POPULAR_ASSETS = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'DOGE', 'DOT', 'LINK', 'AVAX', 'LTC', 'USDT'];

/** Date du jour en UTC : celle de la bougie journalière en cours (D-002). */
export const todayUtc = () => utcMsToDate(Date.now());

let nextId = 1;
const row = (asset: string, amount: string): AssetRow => ({ id: nextId++, asset, amount });

function defaultForm(): Form {
  const year = Number(todayUtc().slice(0, 4));
  return {
    assets: [row('BTC', '100')],
    frequency: 'monthly',
    weekday: 1,
    monthDay: '1',
    start: `${year - 4}-01-01`,
    endMode: 'today',
    end: todayUtc(),
    feeKind: 'percent',
    feeValue: '0,1',
    initial: '',
  };
}

const num = (s: string) => s.trim().replace(/\s/g, '').replace(',', '.');
const sym = (s: string) => s.trim().toUpperCase();

const FORM_KEY = 'simulation';
const SETTINGS_KEY = 'reglages';
const CSV_KEY = 'prix:csv';
const ASSETS_KEY = 'actifs-binance';
const ASSETS_MAX_AGE_DAYS = 7;

class AppState {
  private readonly storage = openStore();
  readonly persistent = this.storage.persistent;
  private readonly binance = new BinanceDaily();
  private ecb: Promise<EcbRates | null> | null = null;

  form = $state<Form>(defaultForm());
  settings = $state<Settings>({ theme: 'auto', allowPriceFetch: false });
  /** Cours importés, par crypto. */
  csv = $state.raw<Record<string, CsvPrices>>({});
  /** Actifs cotés en EUR ou USDT sur Binance (suggestions) et liste complète connue ou non. */
  assets = $state.raw<string[]>(POPULAR_ASSETS);
  binanceList = $state.raw<Set<string> | null>(null);
  checking = $state(false);

  status = $state<'idle' | 'loading' | 'consent' | 'done' | 'error'>('idle');
  /** Action à reprendre après le consentement. */
  private pending: 'run' | 'check' = 'run';
  progress = $state<string>('');
  errors = $state.raw<string[]>([]);
  result = $state.raw<PortfolioResult | null>(null);
  priceInfo = $state.raw<PriceInfo | null>(null);
  /** Cours utilisés par le dernier résultat (pour la sauvegarde). */
  private usedPrices = new Map<string, Map<string, Dec>>();
  toast = $state<string | null>(null);
  private toastTimer: ReturnType<typeof setTimeout> | undefined;

  init() {
    const store = this.storage.store;
    const saved = readJson<Partial<Form> & { asset?: string; amount?: string }>(store, FORM_KEY);
    if (saved) {
      const assets = Array.isArray(saved.assets)
        ? saved.assets.map((a) => row(String(a.asset ?? ''), String(a.amount ?? '')))
        : saved.asset !== undefined
          ? [row(saved.asset, saved.amount ?? '100')] // formulaire de la v0.2 (une crypto)
          : defaultForm().assets;
      this.form = { ...defaultForm(), ...saved, assets: assets.length ? assets : defaultForm().assets };
      delete (this.form as Partial<{ asset: string; amount: string; source: string }>).asset;
      delete (this.form as Partial<{ asset: string; amount: string; source: string }>).amount;
      delete (this.form as Partial<{ asset: string; amount: string; source: string }>).source;
    }
    if (this.form.endMode === 'today') this.form.end = todayUtc();
    const settings = readJson<Partial<Settings>>(store, SETTINGS_KEY);
    if (settings) this.settings = { ...this.settings, ...settings };
    this.loadCsv();
    const list = readJson<{ day: string; list: string[]; symbols?: string[] }>(store, ASSETS_KEY);
    if (list?.list?.length) this.assets = list.list;
    if (list?.symbols?.length) this.binanceList = new Set(list.symbols);
    // Relance la dernière simulation sans réseau (cache ou cours importés).
    void this.run({ offline: true });
  }

  private loadCsv() {
    const raw = readJson<unknown>(this.storage.store, CSV_KEY);
    if (!raw || typeof raw !== 'object') return;
    const toCsv = (fileName: string, rows: [string, string][], errorCount = 0): CsvPrices => {
      const prices = new Map(rows.map(([d, p]) => [d, dec(p)] as const));
      const dates = [...prices.keys()].sort();
      return { fileName, prices, first: dates[0], last: dates[dates.length - 1], errorCount };
    };
    try {
      const r = raw as Record<string, unknown>;
      if (Array.isArray(r.rows) && typeof r.fileName === 'string') {
        // Format de la v0.2 : un seul fichier, rattaché à la première crypto.
        const asset = sym(this.form.assets[0]?.asset ?? '');
        if (asset) this.csv = { [asset]: toCsv(r.fileName, r.rows as [string, string][], Number(r.errorCount) || 0) };
        this.saveCsv();
        return;
      }
      const out: Record<string, CsvPrices> = {};
      for (const [asset, v] of Object.entries(r)) {
        const e = v as { fileName: string; rows: [string, string][]; errorCount?: number };
        if (e && Array.isArray(e.rows)) out[asset] = toCsv(e.fileName, e.rows, e.errorCount);
      }
      this.csv = out;
    } catch {
      this.csv = {};
    }
  }

  private saveCsv(): boolean {
    const out: Record<string, { fileName: string; errorCount: number; rows: [string, string][] }> = {};
    for (const [asset, c] of Object.entries(this.csv)) {
      out[asset] = { fileName: c.fileName, errorCount: c.errorCount, rows: [...c.prices].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([d, p]) => [d, p.toString()]) };
    }
    if (Object.keys(out).length === 0) {
      removeKey(this.storage.store, CSV_KEY);
      return true;
    }
    return writeJson(this.storage.store, CSV_KEY, out);
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

  // ------------------------------------------------------------------
  // Lignes de cryptos
  // ------------------------------------------------------------------

  addAsset() {
    if (this.form.assets.length >= MAX_ASSETS) return;
    this.form.assets.push(row('', this.form.assets[this.form.assets.length - 1]?.amount || '50'));
  }

  removeAsset(id: number) {
    if (this.form.assets.length <= 1) return;
    this.form.assets = this.form.assets.filter((a) => a.id !== id);
  }

  /** Où trouver les cours de ce symbole. */
  check(asset: string): AssetCheck {
    const s = sym(asset);
    if (!s) return 'empty';
    if (this.csv[s]) return 'csv';
    if (!this.binanceList) return 'unchecked';
    if (s === 'USDT' && this.binanceList.has('EURUSDT')) return 'binance';
    return this.binanceList.has(`${s}EUR`) || this.binanceList.has(`${s}USDT`) ? 'binance' : 'unknown';
  }

  /** Paires Binance utilisables pour ce symbole (pour l'affichage). */
  pairsFor(asset: string): string[] {
    const s = sym(asset);
    if (!this.binanceList) return [];
    if (s === 'USDT') return this.binanceList.has('EURUSDT') ? ['EURUSDT'] : [];
    return [`${s}EUR`, `${s}USDT`].filter((p) => this.binanceList!.has(p));
  }

  /** Charge la liste des paires Binance (une requête) pour vérifier les symboles saisis. */
  async verifyOnBinance() {
    if (!this.settings.allowPriceFetch) {
      this.pending = 'check';
      this.status = 'consent';
      return;
    }
    this.checking = true;
    try {
      await this.refreshAssets(true);
      const unknown = this.form.assets.map((a) => sym(a.asset)).filter((s) => s && this.check(s) === 'unknown');
      this.notify(unknown.length ? `Introuvable sur Binance : ${unknown.join(', ')}.` : 'Toutes les cryptos sont cotées sur Binance.');
    } catch (e) {
      this.notify(e instanceof PriceFetchError ? e.message : 'Vérification impossible.');
    } finally {
      this.checking = false;
    }
  }

  /** Après consentement : reprend l'action interrompue. */
  async acceptConsent() {
    this.setConsent(true);
    if (this.pending === 'check') {
      this.status = this.result ? 'done' : 'idle';
      this.pending = 'run';
      await this.verifyOnBinance();
    } else await this.run();
  }

  private async refreshAssets(force = false) {
    const cached = readJson<{ day: string }>(this.storage.store, ASSETS_KEY);
    const age = cached ? (Date.parse(todayUtc()) - Date.parse(cached.day)) / 86_400_000 : Infinity;
    if (!force && this.binanceList && age < ASSETS_MAX_AGE_DAYS) return;
    const symbols = await this.binance.symbols();
    const list = await this.binance.assets();
    this.binanceList = new Set(symbols);
    if (list.length) this.assets = list;
    // Seules les paires utiles à la vérification sont gardées (EUR, USDT).
    const useful = [...symbols].filter((s) => /(EUR|USDT)$/.test(s));
    writeJson(this.storage.store, ASSETS_KEY, { day: todayUtc(), list, symbols: useful });
  }

  // ------------------------------------------------------------------
  // Simulation
  // ------------------------------------------------------------------

  /** Paramètres du moteur à partir du formulaire. */
  params(): PortfolioParams {
    const f = this.form;
    const frequency: Frequency =
      f.frequency === 'daily'
        ? { kind: 'daily' }
        : f.frequency === 'weekly'
          ? { kind: 'weekly', weekday: Number(f.weekday) }
          : { kind: 'monthly', day: f.monthDay === 'last' ? 'last' : Number(f.monthDay) };
    return {
      assets: f.assets.map((a) => ({ asset: sym(a.asset), amountEur: num(a.amount) })),
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
    const errors = validatePortfolio(params);
    if (params.end > todayUtc()) errors.push('La date de fin ne peut pas être dans le futur.');
    if (errors.length) {
      if (options.offline) return;
      this.errors = errors;
      this.status = 'error';
      return;
    }
    this.errors = [];

    const prices = new Map<string, Map<string, Dec>>();
    const byAsset: Record<string, AssetPriceInfo> = {};
    const toFetch: string[] = [];
    for (const { asset } of params.assets) {
      const csv = this.csv[asset];
      if (csv) {
        prices.set(asset, csv.prices);
        byAsset[asset] = { source: 'csv', fileName: csv.fileName };
        continue;
      }
      const cached = readCachedSeries(this.storage.store, asset, params.start, params.end);
      if (cached) {
        prices.set(asset, cached.prices);
        byAsset[asset] = { source: 'binance', routes: cached.routeCounts, fromCache: true };
      } else toFetch.push(asset);
    }

    let noEcb = false;
    if (toFetch.length) {
      if (options.offline) return;
      if (!this.settings.allowPriceFetch) {
        this.pending = 'run';
        this.status = 'consent';
        return;
      }
      this.status = 'loading';
      try {
        const ecb = await this.loadEcb();
        noEcb = ecb === null;
        for (const [i, asset] of toFetch.entries()) {
          this.progress = toFetch.length > 1 ? `${asset} (${i + 1} sur ${toFetch.length})` : asset;
          const series = await this.binance.eurSeries(asset, params.start, params.end, ecb);
          if (series.prices.size > 0) writeCachedSeries(this.storage.store, series, params.start, params.end);
          prices.set(asset, series.prices);
          byAsset[asset] = { source: 'binance', routes: series.routeCounts };
        }
        void this.refreshAssets().catch(() => undefined);
      } catch (e) {
        this.errors = [
          typeof navigator !== 'undefined' && navigator.onLine === false
            ? 'Vous êtes hors ligne : les cours de cette période ne sont pas encore sur cet appareil. Reconnectez-vous, ou utilisez une période déjà simulée ou vos fichiers de prix.'
            : e instanceof PriceFetchError
              ? e.message
              : `Chargement des cours impossible : ${String(e)}`,
        ];
        this.status = 'error';
        return;
      } finally {
        this.progress = '';
      }
    }

    const empty = params.assets.filter(({ asset }) => byAsset[asset]?.source === 'binance' && (prices.get(asset)?.size ?? 0) === 0).map((a) => a.asset);
    if (empty.length) {
      if (options.offline) return;
      this.errors = empty.map(
        (a) => `${a} : Binance n’a aucun cours sur cette période (symbole inconnu, ou coté après la date de fin). Vérifiez le symbole ou importez un fichier de prix pour cette crypto.`,
      );
      this.status = 'error';
      return;
    }

    const r = simulatePortfolio(params, prices);
    if (!r.ok) {
      if (options.offline) return;
      this.errors = r.errors;
      this.status = 'error';
      return;
    }
    this.usedPrices = new Map(
      params.assets.map(({ asset }) => [asset, new Map([...(prices.get(asset) ?? [])].filter(([d]) => d >= params.start && d <= params.end))]),
    );
    this.priceInfo = { byAsset, noEcb };
    this.result = r;
    this.status = 'done';
  }

  /** Importe un fichier CSV de prix pour une crypto ; renvoie un message d'erreur ou null. */
  importCsv(asset: string, fileName: string, text: string): string | null {
    const s = sym(asset);
    if (!s) return 'Saisissez d’abord le symbole de la crypto.';
    try {
      const r = parsePriceCsv(text);
      if (r.prices.size === 0) return `Aucun cours lisible dans ${fileName}.${r.errors.length ? ` ${r.errors[0]}.` : ''}`;
      const dates = [...r.prices.keys()].sort();
      this.csv = { ...this.csv, [s]: { fileName, prices: r.prices, first: dates[0], last: dates[dates.length - 1], errorCount: r.errorCount } };
      if (!this.saveCsv()) this.notify('Fichier de prix chargé, mais trop volumineux pour être gardé sur cet appareil.');
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  }

  clearCsv(asset: string) {
    const rest = { ...this.csv };
    delete rest[sym(asset)];
    this.csv = rest;
    this.saveCsv();
  }

  backupJson(): string | null {
    if (!this.result) return null;
    const priceFiles: Record<string, string> = {};
    for (const [asset, info] of Object.entries(this.priceInfo?.byAsset ?? {})) if (info.source === 'csv' && info.fileName) priceFiles[asset] = info.fileName;
    const saved = makeBackup({ params: this.result.params, endMode: this.form.endMode, prices: this.usedPrices, priceFiles });
    return JSON.stringify(saved, null, 1);
  }

  /** Ouvre une sauvegarde : ses cours deviennent des fichiers importés, puis la simulation est relancée. */
  async openBackup(fileName: string, text: string): Promise<string | null> {
    try {
      const saved = readBackup(text);
      const p = saved.params;
      const f = p.frequency;
      this.form = {
        ...this.form,
        assets: p.assets.map((a) => row(a.asset, a.amountEur.replace('.', ','))),
        frequency: f.kind,
        weekday: f.kind === 'weekly' ? f.weekday : this.form.weekday,
        monthDay: f.kind === 'monthly' ? String(f.day) : this.form.monthDay,
        start: p.start,
        endMode: 'date',
        end: isIsoDate(p.end) ? p.end : this.form.end,
        feeKind: p.fee.kind,
        feeValue: p.fee.value.replace('.', ','),
        initial: (p.initialCapitalEur ?? '').replace('.', ','),
      };
      const csv = { ...this.csv };
      for (const [asset, series] of backupPrices(saved)) {
        const dates = [...series.keys()].sort();
        csv[asset] = { fileName: saved.priceFiles?.[asset] ?? `sauvegarde ${fileName}`, prices: series, first: dates[0], last: dates[dates.length - 1], errorCount: 0 };
      }
      this.csv = csv;
      this.saveCsv();
      this.saveForm();
      await this.run();
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  }
}

export const app = new AppState();
