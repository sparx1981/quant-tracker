import { XMLParser } from 'fast-xml-parser';
import { analyze, forecast, normalizeCandles } from './analysis.js';
import { backtest } from './backtest.js';

export const CONTRACT = '0x4a220E6096B25EADb88358cb44068A3248254675';
const DEFAULT_BLOCKSCOUT_API = 'https://eth.blockscout.com/api/v2';
const BLOCKSCOUT_CONFIG = (() => {
  const raw = process.env.BLOCKSCOUT_API_URL || DEFAULT_BLOCKSCOUT_API;
  try {
    const url = new URL(raw);
    const marker = '/api/v2';
    const index = url.pathname.indexOf(marker);
    const base = index >= 0 ? `${url.origin}${url.pathname.slice(0, index + marker.length)}` : raw.replace(/\/$/, '');
    return { base: base.replace(/\/$/, ''), apiKey: url.searchParams.get('apikey') || null };
  } catch { return { base: DEFAULT_BLOCKSCOUT_API, apiKey: null }; }
})();
const BLOCKSCOUT_API = BLOCKSCOUT_CONFIG.base;
const BLOCKSCOUT_API_KEY = BLOCKSCOUT_CONFIG.apiKey;
const blockscoutUrl = path => {
  const target = `${BLOCKSCOUT_API}${path}`;
  if (!BLOCKSCOUT_API_KEY || /[?&]apikey=/i.test(target)) return target;
  return `${target}${target.includes('?') ? '&' : '?'}apikey=${encodeURIComponent(BLOCKSCOUT_API_KEY)}`;
};
const RPC_ENDPOINTS = [process.env.ALCHEMY_ETHEREUM_URL, process.env.INFURA_ETHEREUM_URL].filter(Boolean);
const COINGECKO_API_KEY = process.env.COINGECKO_API_KEY;
const COINMARKETCAP_API_KEY = process.env.COINMARKETCAP_API_KEY;
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;
const CRYPTOQUANT_API_KEY = process.env.CRYPTOQUANT_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
export const WALLETS = [
  { name: 'Binance 14', exchange: 'Binance', address: '0x28c6c06298d514db089934071355e5743bf21d60' },
  { name: 'Kraken 4', exchange: 'Kraken', address: '0x267be1c1d684f78cb4f6a176c4911b741e4ffdc0' },
  { name: 'Coinbase 12', exchange: 'Coinbase', address: '0x503828976d22510aad0201ac7ec88293211d23da' }
];
const cache = new Map();
const ongoing = new Map();
const stamp = () => new Date().toISOString();
export const number = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;

async function request(url, text = false, timeout = 10000, extraHeaders = {}) {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeout), cache: 'no-store', headers: { Accept: text ? 'application/rss+xml, application/xml, text/xml' : 'application/json', ...extraHeaders } });
  if (!response.ok) throw new Error(`Source returned HTTP ${response.status}`);
  return text ? response.text() : response.json();
}

async function rpc(method, params) {
  for (const endpoint of RPC_ENDPOINTS) {
    try {
      const response = await fetch(endpoint, { method: 'POST', signal: AbortSignal.timeout(5000), headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }) });
      if (!response.ok) continue;
      const result = await response.json();
      if (!result.error && result.result) return result.result;
    } catch { /* try the next provider */ }
  }
  return null;
}

async function rpcTokenBalance(address) {
  const data = `0x70a08231000000000000000000000000${address.slice(2).toLowerCase()}`;
  const result = await rpc('eth_call', [{ to: CONTRACT, data }, 'latest']);
  return result && /^0x[0-9a-f]+$/i.test(result) ? Number(BigInt(result)) / 1e18 : null;
}

export const INTERVALS = new Set(['1m', '5m', '15m', '1h', '4h', '1d', '1w', '1M']);
export async function getHistory(interval = '1d') {
  if (!INTERVALS.has(interval)) throw new Error('Unsupported interval');
  const ttl = ['1m', '5m', '15m'].includes(interval) ? 15000 : interval === '1h' || interval === '4h' ? 60000 : 300000;
  return cached(`history-${interval}`, ttl, async () => {
    let rows = await request(`https://data-api.binance.vision/api/v3/klines?symbol=QNTUSDT&interval=${interval}&limit=1000`);
    if (!Array.isArray(rows)) throw new Error('Invalid history');
    if (interval === '1d' && rows.length === 1000) {
      const older = await request(`https://data-api.binance.vision/api/v3/klines?symbol=QNTUSDT&interval=1d&limit=1000&endTime=${Number(rows[0][0]) - 1}`);
      if (Array.isArray(older)) rows = older.concat(rows);
    }
    const candles = normalizeCandles(rows);
    if (candles.length < 2) throw new Error('Insufficient history');
    return { candles, timeframe: interval, source: 'Binance · QNT/USDT', url: 'https://www.binance.com/en/trade/QNT_USDT', analysis: analyze(candles, interval) };
  });
}

export async function getQuote() {
  return cached('quote-usd', 10000, async () => {
    const [ticker, stats] = await Promise.all([request('https://api.exchange.coinbase.com/products/QNT-USD/ticker'), request('https://api.exchange.coinbase.com/products/QNT-USD/stats')]);
    if (!(number(ticker.price) > 0)) throw new Error('Missing quote');
    return { price: number(ticker.price), updatedAt: ticker.time, change24h: number(stats.open) > 0 ? (Number(ticker.price) / Number(stats.open) - 1) * 100 : null, source: 'Coinbase · QNT/USD', url: 'https://exchange.coinbase.com/trade/QNT-USD' };
  });
}

export async function getBacktest() {
  const history = await getHistory('1d');
  return { ...history, data: history.data ? backtest(history.data.candles) : null };
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
        const d = await request('https://api.coingecko.com/api/v3/coins/quant-network?localization=false&tickers=false&community_data=false&developer_data=false', false, 10000, COINGECKO_API_KEY ? { 'x-cg-demo-api-key': COINGECKO_API_KEY } : {});
        if (!(number(d.market_data?.current_price?.usd) > 0)) throw new Error('Missing price');
        const m = d.market_data;
        return { source: 'CoinGecko', url: 'https://www.coingecko.com/en/coins/quant', price: number(m.current_price.usd), change24h: number(m.price_change_percentage_24h), totalSupply: number(m.total_supply), circulatingSupply: number(m.circulating_supply), circulatingEstimated: false, volume: number(m.total_volume?.usd), marketCap: number(m.market_cap?.usd), high24h: number(m.high_24h?.usd), low24h: number(m.low_24h?.usd), updatedAt: d.last_updated || null };
      } catch {
        if (COINMARKETCAP_API_KEY) {
          try {
            const d = await request('https://pro-api.coinmarketcap.com/v2/cryptocurrency/quotes/latest?symbol=QNT&convert=USD', false, 10000, { 'X-CMC_PRO_API_KEY': COINMARKETCAP_API_KEY });
            const q = d.data?.QNT?.[0]?.quote?.USD, supply = number(d.data?.QNT?.[0]?.circulating_supply);
            if (!(number(q?.price) > 0)) throw new Error('Missing CoinMarketCap price');
            return { source: 'CoinMarketCap (fallback)', url: 'https://coinmarketcap.com/currencies/quant/', price: number(q.price), change24h: number(q.percent_change_24h), totalSupply: number(d.data.QNT[0].total_supply), circulatingSupply: supply, circulatingEstimated: false, volume: number(q.volume_24h), marketCap: number(q.market_cap), high24h: null, low24h: null, updatedAt: d.status?.timestamp || null };
          } catch { /* use the public CoinPaprika fallback */ }
        }
        const d = await request('https://api.coinpaprika.com/v1/tickers/qnt-quant');
        const q = d.quotes?.USD;
        if (!(number(q?.price) > 0)) throw new Error('Missing price');
        const supply = number(d.circulating_supply);
        return { source: 'CoinPaprika (fallback)', url: 'https://coinpaprika.com/coin/qnt-quant/', price: number(q.price), change24h: number(q.percent_change_24h), totalSupply: number(d.total_supply), circulatingSupply: supply ?? (number(q.market_cap) > 0 ? q.market_cap / q.price : null), circulatingEstimated: supply === null, volume: number(q.volume_24h), marketCap: number(q.market_cap), high24h: null, low24h: null, updatedAt: d.last_updated || null };
      }
    }),
    getHistory('1d'),
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
        const d = await request(blockscoutUrl(`/tokens/${CONTRACT}`));
      if (d.symbol !== 'QNT') throw new Error('Wrong token');
      return { holders: number(d.holders_count), rawContractSupply: number(d.total_supply) === null ? null : Number(d.total_supply) / 10 ** Number(d.decimals) };
    }),
    cached('transfers-v2', 60000, async () => {
      const raw = [];
      let cursor = null, partial = false, pages = 0;
      const started = Date.now();
      do {
        try {
          const query = cursor ? `?${new URLSearchParams(cursor)}` : '';
          const d = await request(blockscoutUrl(`/tokens/${CONTRACT}/transfers${query}`), false, 4000);
          if (!Array.isArray(d.items)) throw new Error('Invalid transfers');
          raw.push(...d.items); cursor = d.next_page_params; pages++;
          if (raw.length && Date.parse(raw.at(-1).timestamp) < Date.now() - 86400000) break;
        } catch (error) { if (!raw.length) throw error; partial = true; break; }
      } while (cursor && pages < 10 && Date.now() - started < 15000);
      const seen = new Set();
      const items = raw.map(t => ({
        hash: t.transaction_hash, index: t.log_index, block: t.block_number, at: t.timestamp,
        from: t.from?.hash, to: t.to?.hash,
        fromName: WALLETS.find(w => w.address === t.from?.hash?.toLowerCase())?.name || t.from?.name || null,
        toName: WALLETS.find(w => w.address === t.to?.hash?.toLowerCase())?.name || t.to?.name || null,
        amount: number(t.total?.value) === null ? null : Number(t.total.value) / 10 ** Number(t.total.decimals ?? 18)
      })).filter(t => number(t.amount) !== null && t.amount >= 0 && /^0x[0-9a-f]{64}$/i.test(t.hash || ''))
        .filter(t => { const key = `${t.hash}-${t.index}`; if (seen.has(key)) return false; seen.add(key); return true; });
      return { items, sampled: items.length, pages, partial, hasMore: Boolean(cursor), oldest: items.at(-1)?.at ?? null, newest: items[0]?.at ?? null };
    }),
    ...WALLETS.map(wallet => cached(wallet.address, 300000, async () => {
      try {
        const d = await request(`https://eth.blockscout.com/api?module=account&action=tokenbalance&contractaddress=${CONTRACT}&address=${wallet.address}`, false, 4000);
        if (d.status !== '1' || !/^\d+$/.test(String(d.result))) throw new Error('Balance unavailable');
        return { ...wallet, balance: Number(d.result) / 1e18 };
      } catch {
        const rpcBalance = await rpcTokenBalance(wallet.address);
        if (rpcBalance !== null) return { ...wallet, balance: rpcBalance, source: 'RPC fallback' };
        const balances = await request(blockscoutUrl(`/addresses/${wallet.address}/token-balances`));
        const qnt = Array.isArray(balances) && balances.find(b => b.token?.address_hash?.toLowerCase() === CONTRACT.toLowerCase());
        if (!qnt || !/^\d+$/.test(String(qnt.value))) throw new Error('Balance unavailable');
        return { ...wallet, balance: Number(qnt.value) / 1e18 };
      }
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
    title: String(item.title || '').replace(/&#(x[0-9a-f]+|\d+);/gi, (match, code) => { const n = code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : Number(code); return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : match; }).replace(/<[^>]*>/g, ''),
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

function safeProbeMessage(error) {
  const message = String(error?.message || 'Request failed');
  const http = message.match(/HTTP \d{3}/i);
  return http ? `Provider returned ${http[0].toUpperCase()}` : 'Timed out or connection failed';
}

async function probe(id, label, group, configured, loader, { docsUrl = null, keyOptional = false, notUsed = false } = {}) {
  const base = { id, label, group, configured: Boolean(configured), docsUrl, expected: !notUsed };
  if (notUsed) return { ...base, status: configured ? 'not_used' : 'not_configured', message: configured ? 'Credential present; this provider is not currently queried by the dashboard.' : 'Optional provider is not configured.' };
  if (!configured && !keyOptional) return { ...base, status: 'not_configured', message: 'Optional credential is not configured.' };
  const started = Date.now();
  try {
    const result = await loader();
    return { ...base, status: configured || !keyOptional ? 'ok' : 'warning', latencyMs: Date.now() - started, message: result?.message || (configured ? 'Responding' : 'Public endpoint responding without an API key') };
  } catch (error) {
    return { ...base, status: configured ? 'failed' : 'warning', latencyMs: Date.now() - started, message: safeProbeMessage(error) };
  }
}

export function summarizeFeedChecks(checks = []) {
  const counts = checks.reduce((result, check) => { result[check.status] = (result[check.status] || 0) + 1; return result; }, {});
  const overall = counts.failed ? 'failed' : counts.warning ? 'degraded' : 'healthy';
  return { overall, counts, checked: checks.length };
}

async function checkRpcEndpoint(endpoint) {
  const response = await fetch(endpoint, {
    method: 'POST',
    signal: AbortSignal.timeout(5000),
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method: 'eth_blockNumber', params: [] })
  });
  if (!response.ok) throw new Error(`Source returned HTTP ${response.status}`);
  const body = await response.json();
  if (body.error || !/^0x[0-9a-f]+$/i.test(String(body.result || ''))) throw new Error('RPC did not return a block number');
}

export async function checkFeeds() {
  const started = Date.now();
  const checks = await Promise.all([
    probe('coinbase', 'Coinbase spot quote', 'Market', true, async () => {
      const data = await request('https://api.exchange.coinbase.com/products/QNT-USD/ticker', false, 6500);
      if (!(number(data?.price) > 0)) throw new Error('Missing quote');
      return { message: `QNT/USD ${number(data.price).toFixed(4)}` };
    }, { docsUrl: 'https://exchange.coinbase.com/trade/QNT-USD' }),
    probe('coingecko', 'CoinGecko market snapshot', 'Market', Boolean(COINGECKO_API_KEY), async () => {
      const data = await request('https://api.coingecko.com/api/v3/coins/quant-network?localization=false&tickers=false&community_data=false&developer_data=false', false, 6500, COINGECKO_API_KEY ? { 'x-cg-demo-api-key': COINGECKO_API_KEY } : {});
      if (!(number(data?.market_data?.current_price?.usd) > 0)) throw new Error('Missing market price');
      return { message: `${COINGECKO_API_KEY ? 'Demo key accepted · ' : ''}QNT/USD ${number(data.market_data.current_price.usd).toFixed(4)}` };
    }, { docsUrl: 'https://www.coingecko.com/en/api', keyOptional: true }),
    probe('coinmarketcap', 'CoinMarketCap fallback', 'Market', Boolean(COINMARKETCAP_API_KEY), async () => {
      const data = await request('https://pro-api.coinmarketcap.com/v2/cryptocurrency/quotes/latest?symbol=QNT&convert=USD', false, 6500, { 'X-CMC_PRO_API_KEY': COINMARKETCAP_API_KEY });
      const quote = data?.data?.QNT?.[0]?.quote?.USD;
      if (!(number(quote?.price) > 0)) throw new Error('Missing market price');
      return { message: `QNT/USD ${number(quote.price).toFixed(4)}` };
    }, { docsUrl: 'https://coinmarketcap.com/api/' }),
    probe('binance', 'Binance candle history', 'Market', true, async () => {
      const data = await request('https://data-api.binance.vision/api/v3/klines?symbol=QNTUSDT&interval=1d&limit=2', false, 6500);
      if (!Array.isArray(data) || data.length < 2) throw new Error('Insufficient candles');
      return { message: `${data.length} completed QNT/USDT candles` };
    }, { docsUrl: 'https://www.binance.com/en/trade/QNT_USDT' }),
    probe('fx', 'Frankfurter GBP conversion', 'Market', true, async () => {
      const data = await request('https://api.frankfurter.dev/v1/latest?base=USD&symbols=GBP', false, 6500);
      if (!(number(data?.rates?.GBP) > 0)) throw new Error('Missing GBP rate');
      return { message: `$1 = £${number(data.rates.GBP).toFixed(5)}` };
    }, { docsUrl: 'https://frankfurter.dev/' }),
    probe('blockscout-token', 'Blockscout token data', 'Ethereum', true, async () => {
      const data = await request(blockscoutUrl(`/tokens/${CONTRACT}`), false, 6500);
      if (String(data?.symbol).toUpperCase() !== 'QNT') throw new Error('Unexpected token response');
      return { message: `QNT contract recognised · ${fmtProbeNumber(data.holders_count)} indexed holders` };
    }, { docsUrl: 'https://eth.blockscout.com/token/0x4a220E6096B25EADb88358cb44068A3248254675' }),
    probe('blockscout-transfers', 'Blockscout transfer index', 'Ethereum', true, async () => {
      const data = await request(blockscoutUrl(`/tokens/${CONTRACT}/transfers?limit=1`), false, 6500);
      if (!Array.isArray(data?.items)) throw new Error('Invalid transfer response');
      return { message: `${data.items.length ? 'Recent transfer available' : 'No recent transfer returned'}` };
    }, { docsUrl: 'https://eth.blockscout.com/token/0x4a220E6096B25EADb88358cb44068A3248254675' }),
    ...[
      ['alchemy', 'Alchemy Ethereum RPC', process.env.ALCHEMY_ETHEREUM_URL, 'https://www.alchemy.com/ethereum'],
      ['infura', 'Infura Ethereum RPC', process.env.INFURA_ETHEREUM_URL, 'https://www.infura.io/product/ethereum']
    ].map(([id, label, endpoint, docsUrl]) => probe(id, label, 'Ethereum', Boolean(endpoint), async () => {
      await checkRpcEndpoint(endpoint);
      return { message: 'Latest block query succeeded' };
    }, { docsUrl })),
    probe('etherscan', 'Etherscan token balance API', 'Ethereum', Boolean(ETHERSCAN_API_KEY), async () => {
      const query = new URL('https://api.etherscan.io/v2/api');
      query.search = new URLSearchParams({ chainid: '1', module: 'account', action: 'tokenbalance', contractaddress: CONTRACT, address: WALLETS[0].address, tag: 'latest', apikey: ETHERSCAN_API_KEY }).toString();
      const data = await request(query.href, false, 6500);
      if (String(data?.status) !== '1' || !/^\d+$/.test(String(data?.result || ''))) throw new Error('Etherscan rejected the request');
      return { message: 'Token balance query succeeded' };
    }, { docsUrl: 'https://docs.etherscan.io/metadata-api/' }),
    probe('supabase', 'Supabase REST connection', 'Storage', Boolean(SUPABASE_URL && SUPABASE_KEY), async () => {
      const base = String(SUPABASE_URL).replace(/\/$/, '');
      const response = await fetch(`${base}/rest/v1/`, { signal: AbortSignal.timeout(6500), cache: 'no-store', headers: { Accept: 'application/openapi+json, application/json', apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } });
      if (!response.ok) throw new Error(`Source returned HTTP ${response.status}`);
      return { message: 'REST endpoint accepted the configured key; dashboard persistence is not yet used' };
    }, { docsUrl: 'https://supabase.com/docs/guides/api' }),
    probe('official-news', 'Quant official RSS', 'News', true, async () => {
      const xml = await request('https://quant.network/feed/', true, 6500);
      if (!/<item[\s>]/i.test(xml)) throw new Error('RSS feed returned no items');
      return { message: 'Official RSS feed returned entries' };
    }, { docsUrl: 'https://quant.network/news/' }),
    probe('news-coverage', 'Google News QNT RSS', 'News', true, async () => {
      const xml = await request('https://news.google.com/rss/search?q=QNT+OR+%22Quant+Network%22+when:30d&hl=en-GB&gl=GB&ceid=GB:en', true, 6500);
      if (!/<item[\s>]/i.test(xml)) throw new Error('RSS feed returned no items');
      return { message: 'Coverage RSS feed returned entries' };
    }, { docsUrl: 'https://news.google.com/' }),
    probe('cryptoquant', 'CryptoQuant API', 'Optional', Boolean(CRYPTOQUANT_API_KEY), async () => null, { docsUrl: 'https://www.cryptoquant.com/apis', notUsed: true })
  ]);
  return { checkedAt: stamp(), durationMs: Date.now() - started, ...summarizeFeedChecks(checks), checks };
}

function fmtProbeNumber(value) {
  const parsed = number(value);
  return parsed === null ? '—' : parsed.toLocaleString('en-GB', { maximumFractionDigits: 0 });
}
