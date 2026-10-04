import { describe, expect, it } from 'vitest';
import { parseEcbCsv } from '../../../scripts/update-ecb.mjs';
import { dec, type Dec } from '../core/money';
import { BinanceDaily, combineEurSeries, PriceFetchError, type Fetcher } from './binance';
import { parsePriceCsv, parsePriceDate, parsePriceNumber } from './csvPrices';
import { EcbRates, type EcbData } from './ecb';
import embedded from './ecb-eurusd.json';

const m = (entries: Record<string, string>): Map<string, Dec> => new Map(Object.entries(entries).map(([d, p]) => [d, dec(p)]));
const DAY = 86_400_000;
const utc = (d: string) => Date.parse(`${d}T00:00:00Z`);

describe('EcbRates', () => {
  const ecb = new EcbRates({
    source: 'test',
    url: '',
    updated: '',
    rates: [
      ['2019-01-04', '1.1395'],
      ['2019-01-02', '1.1309'],
      ['2019-01-03', '1.1324'],
    ],
  });

  it('taux du jour, ou dernier taux publié (week-end)', () => {
    expect(ecb.usdPerEur('2019-01-03')?.toString()).toBe('1.1324');
    expect(ecb.usdPerEur('2019-01-06')?.toString()).toBe('1.1395');
    expect(ecb.first).toBe('2019-01-02');
    expect(ecb.last).toBe('2019-01-04');
  });

  it('pas de taux avant la série ni trop longtemps après', () => {
    expect(ecb.usdPerEur('2019-01-01')).toBeNull();
    expect(ecb.usdPerEur('2019-01-11')).toBeNull();
  });

  it('le fichier embarqué est lisible', () => {
    const data = embedded as EcbData;
    expect(() => new EcbRates(data)).not.toThrow();
    expect(data.source).toContain('Banque centrale européenne');
  });
});

describe('parseEcbCsv (script de mise à jour)', () => {
  it('lit le format du Data Portal de la BCE', () => {
    const csv =
      'KEY,FREQ,CURRENCY,CURRENCY_DENOM,EXR_TYPE,EXR_SUFFIX,TIME_PERIOD,OBS_VALUE,OBS_STATUS\n' +
      'EXR.D.USD.EUR.SP00.A,D,USD,EUR,SP00,A,2019-01-03,1.1324,A\n' +
      'EXR.D.USD.EUR.SP00.A,D,USD,EUR,SP00,A,2019-01-02,1.1309,A\n' +
      'EXR.D.USD.EUR.SP00.A,D,USD,EUR,SP00,A,2019-01-01,,M\n';
    expect(parseEcbCsv(csv)).toEqual([
      ['2019-01-02', '1.1309'],
      ['2019-01-03', '1.1324'],
    ]);
  });

  it('refuse un format inattendu', () => {
    expect(() => parseEcbCsv('a,b\n1,2\n')).toThrow(/TIME_PERIOD/);
  });
});

describe('combineEurSeries', () => {
  const ecb = new EcbRates({ source: '', url: '', updated: '', rates: [['2019-12-30', '1.12']] });

  it('EUR, puis USDT ÷ EURUSDT, puis USDT ÷ BCE, sinon manquant', () => {
    const s = combineEurSeries(
      'BTC',
      '2019-12-29',
      '2020-01-02',
      {
        direct: m({ '2020-01-02': '6400' }),
        viaUsdt: m({ '2019-12-30': '7280', '2019-12-31': '7200', '2020-01-01': '7150', '2020-01-02': '7180' }),
        eurUsdt: m({ '2020-01-01': '1.1' }),
      },
      ecb,
    );
    expect(s.prices.get('2019-12-30')?.toString()).toBe('6500');
    expect(s.routes.get('2019-12-31')).toBe('USDT/BCE');
    expect(s.prices.get('2020-01-01')?.toString()).toBe('6500');
    expect(s.routes.get('2020-01-01')).toBe('USDT/EURUSDT');
    expect(s.prices.get('2020-01-02')?.toString()).toBe('6400');
    expect(s.missing).toEqual(['2019-12-29']);
    expect(s.routeCounts).toEqual({ EUR: 1, 'USDT/EURUSDT': 1, 'USDT/BCE': 2 });
  });

  it("l'USDT lui-même : 1 ÷ EURUSDT ou 1 ÷ BCE", () => {
    const s = combineEurSeries('USDT', '2019-12-30', '2020-01-01', { direct: new Map(), viaUsdt: null, eurUsdt: m({ '2020-01-01': '1.25' }) }, ecb);
    expect(s.prices.get('2020-01-01')?.toString()).toBe('0.8');
    expect(s.prices.get('2019-12-30')?.toDecimalPlaces(6).toString()).toBe('0.892857');
  });

  it('sans taux BCE embarqués : jours manquants', () => {
    const s = combineEurSeries('BTC', '2019-12-30', '2019-12-30', { direct: new Map(), viaUsdt: m({ '2019-12-30': '7000' }), eurUsdt: new Map() }, null);
    expect(s.missing).toEqual(['2019-12-30']);
  });
});

/** Faux Binance : liste de paires et bougies journalières générées. */
function fakeBinance(series: Record<string, Record<string, string>>, opts: { failFirstHost?: boolean } = {}) {
  const calls: string[] = [];
  const fetcher: Fetcher = async (url) => {
    calls.push(url);
    if (opts.failFirstHost && url.startsWith('https://data-api.binance.vision')) throw new TypeError('Failed to fetch');
    const u = new URL(url);
    const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
    if (u.pathname === '/api/v3/ticker/price') return json(Object.keys(series).map((symbol) => ({ symbol, price: '1' })));
    const symbol = u.searchParams.get('symbol')!;
    const start = Number(u.searchParams.get('startTime'));
    const end = Number(u.searchParams.get('endTime'));
    const limit = Number(u.searchParams.get('limit'));
    const candles = Object.entries(series[symbol] ?? {})
      .map(([d, close]) => [utc(d), '0', '0', '0', close, '0'])
      .filter((c) => (c[0] as number) >= start && (c[0] as number) <= end)
      .sort((a, b) => (a[0] as number) - (b[0] as number))
      .slice(0, limit);
    return json(candles);
  };
  return { fetcher, calls };
}

describe('BinanceDaily', () => {
  it('pagine au-delà de 1 000 bougies', async () => {
    const closes: Record<string, string> = {};
    for (let i = 0; i < 1500; i++) closes[new Date(utc('2018-01-01') + i * DAY).toISOString().slice(0, 10)] = String(i + 1);
    const { fetcher, calls } = fakeBinance({ BTCUSDT: closes });
    const b = new BinanceDaily(fetcher);
    const out = await b.closes('BTCUSDT', '2018-01-01', '2022-12-31');
    expect(out.size).toBe(1500);
    expect(out.get('2018-01-01')?.toString()).toBe('1');
    expect(calls.filter((c) => c.includes('klines'))).toHaveLength(2);
  });

  it("n'interroge pas une paire inexistante", async () => {
    const { fetcher, calls } = fakeBinance({ BTCUSDT: {} });
    const out = await new BinanceDaily(fetcher).closes('ACEEUR', '2024-01-01', '2024-01-02');
    expect(out.size).toBe(0);
    expect(calls.some((c) => c.includes('ACEEUR'))).toBe(false);
  });

  it('série en euros complète, avec repli sur le second hôte', async () => {
    const { fetcher } = fakeBinance(
      { BTCEUR: { '2020-01-03': '6600' }, BTCUSDT: { '2020-01-02': '7700', '2020-01-03': '7300' }, EURUSDT: { '2020-01-02': '1.1' } },
      { failFirstHost: true },
    );
    const s = await new BinanceDaily(fetcher).eurSeries('btc', '2020-01-02', '2020-01-03', null);
    expect(s.prices.get('2020-01-02')?.toString()).toBe('7000');
    expect(s.prices.get('2020-01-03')?.toString()).toBe('6600');
  });

  it('liste des actifs cotés en EUR ou USDT', async () => {
    const { fetcher } = fakeBinance({ BTCEUR: {}, ETHUSDT: {}, EURUSDT: {}, SOLBTC: {} });
    expect(await new BinanceDaily(fetcher).assets()).toEqual(['BTC', 'ETH', 'USDT']);
  });

  it('erreur explicite si Binance est injoignable', async () => {
    const b = new BinanceDaily(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(b.symbols()).rejects.toBeInstanceOf(PriceFetchError);
  });
});

describe('import CSV de prix', () => {
  it('dates ISO, JJ/MM/AAAA et Unix', () => {
    expect(parsePriceDate('2024-03-01T00:00:00Z')).toBe('2024-03-01');
    expect(parsePriceDate('1/3/2024')).toBe('2024-03-01');
    expect(parsePriceDate('1709251200')).toBe('2024-03-01');
    expect(parsePriceDate('1709251200000')).toBe('2024-03-01');
    expect(parsePriceDate('31/02/2024')).toBeNull();
  });

  it('nombres français et anglais', () => {
    expect(parsePriceNumber('1 234,56')?.toString()).toBe('1234.56');
    expect(parsePriceNumber('1,234.56')?.toString()).toBe('1234.56');
    expect(parsePriceNumber('42 000 €')?.toString()).toBe('42000');
    expect(parsePriceNumber('abc')).toBeNull();
    expect(parsePriceNumber('0')).toBeNull();
  });

  it('fichier à deux colonnes avec en-têtes français', () => {
    const r = parsePriceCsv('Date;Prix\n01/03/2024;56 000,5\n02/03/2024;57 100\n02/03/2024;57 200\nxx;1\n');
    expect(r.prices.get('2024-03-01')?.toString()).toBe('56000.5');
    expect(r.prices.get('2024-03-02')?.toString()).toBe('57200');
    expect(r.duplicates).toBe(1);
    expect(r.errorCount).toBe(1);
    expect(r.errors[0]).toMatch(/ligne 5/);
    expect([r.first, r.last]).toEqual(['2024-03-01', '2024-03-02']);
  });

  it('historique OHLC : la clôture est retenue', () => {
    const r = parsePriceCsv('timestamp,open,high,low,close,volume\n2024-03-01,1,3,0.5,2,10\n');
    expect(r.priceColumn).toBe('close');
    expect(r.prices.get('2024-03-01')?.toString()).toBe('2');
  });

  it('fichier sans en-tête', () => {
    const r = parsePriceCsv('2024-03-01,100\n2024-03-02,101\n');
    expect(r.prices.size).toBe(2);
  });

  it('colonnes introuvables : message clair', () => {
    expect(() => parsePriceCsv('a,b,c\n1,2,3\n')).toThrow(/introuvables/);
  });
});
