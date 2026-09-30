import { XMLParser } from 'fast-xml-parser';
import { analyze, forecast, normalizeCandles } from './analysis.js';

export const CONTRACT = '0x4a220E6096B25EADb88358cb44068A3248254675';
export const WALLETS = [
  { name: 'Binance 14', exchange: 'Binance', address: '0x28c6c06298d514db089934071355e5743bf21d60' },
  { name: 'Kraken 4', exchange: 'Kraken', address: '0x267be1c1d684f78cb4f6a176c4911b741e4ffdc0' },
  { name: 'Coinbase 12', exchange: 'Coinbase', address: '0x503828976d22510aad0201ac7ec88293211d23da' }
];
const cache = new Map();
const ongoing = new Map();
const stamp = () => new Date().toISOString();
export const number = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;

async function request(url, text = false) {
  const response = await fetch(url, { signal: AbortSignal.timeout(10000), cache: 'no-store', headers: { Accept: text ? 'application/rss+xml, application/xml, text/xml' : 'application/json' } });
  if (!response.ok) throw new Error(`Source returned HTTP ${response.status}`);
  return text ? response.text() : response.json();
}

async function cached(key, ttl, loader) {
  const previous = cache.get(key);
  if (previous && Date.now() - previous.time < ttl) return previous.result;
  if (ongoing.has(key)) return ongoing.get(key);
  const work = (async () => {
    try {
      const data = await loader();
      const result = { status: 'ok', fetchedAt: stamp(), data };
      cache.set(key, { time: Date.now(), result });
      return result;
    } catch {
      if (previous) return { ...previous.result, status: 'stale', error: 'Source unavailable; showing last successful retrieval.' };
      return { status: 'unavailable', fetchedAt: null, data: null, error: 'The public source is temporarily unavailable.' };
    } finally { ongoing.delete(key); }
  })();
  ongoing.set(key, work);
  return work;
}

export async function getMarket() {
  const [market, history, fx] = await Promise.all([
    cached('market', 60000, async () => {
      try {
        const d = await request('https://api.coingecko.com/api/v3/coins/quant-network?localization=false&tickers=false&community_data=false&developer_data=false');
        if (!(number(d.market_data?.current_price?.usd) > 0)) throw new Error('Missing price');
        const m = d.market_data;
        return { source: 'CoinGecko', url: 'https://www.coingecko.com/en/coins/quant', price: number(m.current_price.usd), change24h: number(m.price_change_percentage_24h), totalSupply: number(m.total_supply), circulatingSupply: number(m.circulating_supply), circulatingEstimated: false, volume: number(m.total_volume?.usd), marketCap: number(m.market_cap?.usd), high24h: number(m.high_24h?.usd), low24h: number(m.low_24h?.usd), updatedAt: d.last_updated || null };
      } catch {
        const d = await request('https://api.coinpaprika.com/v1/tickers/qnt-quant');
        const q = d.quotes?.USD;
        if (!(number(q?.price) > 0)) throw new Error('Missing price');
        const supply = number(d.circulating_supply);
        return { source: 'CoinPaprika (fallback)', url: 'https://coinpaprika.com/coin/qnt-quant/', price: number(q.price), change24h: number(q.percent_change_24h), totalSupply: number(d.total_supply), circulatingSupply: supply ?? (number(q.market_cap) > 0 ? q.market_cap / q.price : null), circulatingEstimated: supply === null, volume: number(q.volume_24h), marketCap: number(q.market_cap), high24h: null, low24h: null, updatedAt: d.last_updated || null };
      }
    }),
    cached('history', 900000, async () => {
      const data = await request('https://data-api.binance.vision/api/v3/klines?symbol=QNTUSDT&interval=1d&limit=500');
      const candles = normalizeCandles(data);
      if (candles.length < 210) throw new Error('Insufficient daily history');
      return { candles, source: 'Binance · QNT/USDT', url: 'https://www.binance.com/en/trade/QNT_USDT', analysis: analyze(candles) };
    }),
    cached('fx', 3600000, async () => {
      const data = await request('https://api.frankfurter.dev/v1/latest?base=USD&symbols=GBP');
      if (!(number(data.rates?.GBP) > 0)) throw new Error('Missing FX');
      return { rate: data.rates.GBP, date: data.date, source: 'Frankfurter / ECB', url: 'https://frankfurter.dev/' };
    })
  ]);
  return { market, history, fx, forecasts: history.data && market.data ? forecast(history.data.candles, market.data.price) : null, fetchedAt: stamp() };
}

export async function getChain() {
  const [token, transfers, ...wallets] = await Promise.all([
    cached('token', 300000, async () => {
      const d = await request(`https://eth.blockscout.com/api/v2/tokens/${CONTRACT}`);
      if (d.symbol !== 'QNT') throw new Error('Wrong token');
      return { holders: number(d.holders_count), rawContractSupply: number(d.total_supply) === null ? null : Number(d.total_supply) / 10 ** Number(d.decimals) };
    }),
    cached('transfers', 180000, async () => {
      const d = await request(`https://eth.blockscout.com/api/v2/tokens/${CONTRACT}/transfers`);
      if (!Array.isArray(d.items)) throw new Error('Invalid transfers');
      const items = d.items.map(t => ({
        hash: t.transaction_hash, index: t.log_index, block: t.block_number, at: t.timestamp,
        from: t.from?.hash, to: t.to?.hash,
        fromName: WALLETS.find(w => w.address === t.from?.hash?.toLowerCase())?.name || t.from?.name || null,
        toName: WALLETS.find(w => w.address === t.to?.hash?.toLowerCase())?.name || t.to?.name || null,
        amount: number(t.total?.value) === null ? null : Number(t.total.value) / 10 ** Number(t.total.decimals ?? 18)
      })).filter(t => number(t.amount) !== null && t.amount >= 0 && /^0x[0-9a-f]{64}$/i.test(t.hash || ''));
      return { items, sampled: d.items.length, hasMore: Boolean(d.next_page_params), oldest: items.at(-1)?.at ?? null, newest: items[0]?.at ?? null };
    }),
    ...WALLETS.map(wallet => cached(wallet.address, 300000, async () => {
      const d = await request(`https://eth.blockscout.com/api?module=account&action=tokenbalance&contractaddress=${CONTRACT}&address=${wallet.address}`);
      if (d.status !== '1' || !/^\d+$/.test(String(d.result))) throw new Error('Balance unavailable');
      return { ...wallet, balance: Number(d.result) / 1e18 };
    }))
  ]);
  const rows = wallets.map((result, i) => ({ ...result, wallet: WALLETS[i] }));
  const available = wallets.filter(w => w.data !== null);
  return { token, transfers, wallets: rows, total: available.length ? available.reduce((sum, w) => sum + w.data.balance, 0) : null, covered: available.length, tracked: WALLETS.length, fetchedAt: stamp() };
}

function safeUrl(value) {
  try { const u = new URL(String(value)); return u.protocol === 'https:' ? u.href : null; } catch { return null; }
}
const parser = new XMLParser({ ignoreAttributes: false, processEntities: true });
function feedItems(xml, official) {
  const parsed = parser.parse(xml);
  const items = parsed?.rss?.channel?.item;
  if (!items) return [];
  return (Array.isArray(items) ? items : [items]).map(item => ({
    title: String(item.title || '').replace(/<[^>]*>/g, ''),
    url: safeUrl(item.link), date: Number.isFinite(Date.parse(item.pubDate)) ? new Date(item.pubDate).toISOString() : null,
    source: official ? 'Quant · official' : String(item.source?.['#text'] || item.source || 'Google News'),
    official
  })).filter(item => item.title && item.url && item.date && (official || /\bQNT\b|quant network|\bquant[’'s]*\b.*(?:token|blockchain|bank|payment|overledger|fusion)/i.test(item.title)));
}

export async function getNews() {
  const [official, coverage] = await Promise.all([
    cached('official-news', 600000, async () => feedItems(await request('https://quant.network/feed/', true), true)),
    cached('coverage-news', 600000, async () => feedItems(await request('https://news.google.com/rss/search?q=QNT+OR+%22Quant+Network%22+when:30d&hl=en-GB&gl=GB&ceid=GB:en', true), false))
  ]);
  const combined = [...(official.data || []), ...(coverage.data || [])].sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  const seen = new Set();
  return { official, coverage, items: combined.filter(item => { const key = item.title.toLowerCase(); if (seen.has(key)) return false; seen.add(key); return true; }).slice(0, 30), fetchedAt: stamp() };
}

