// Portfolio checker data: Yahoo Finance chart endpoint (keyless) for prices and ex-dividend history.
export const HOLDINGS = [
  { id: 'QNT', name: 'Quant', symbol: 'QNT-USD', kind: 'Crypto' },
  { id: 'NVDA', name: 'NVIDIA', symbol: 'NVDA', kind: 'Stock' },
  { id: 'XLK', name: 'Technology Select Sector SPDR', symbol: 'XLK', kind: 'ETF' },
  { id: 'SOXX', name: 'iShares Semiconductor ETF', symbol: 'SOXX', kind: 'ETF' },
  { id: 'VFH', name: 'Vanguard Financials ETF', symbol: 'VFH', kind: 'ETF' },
  { id: 'URA', name: 'Global X Uranium ETF', symbol: 'URA', kind: 'ETF' },
  { id: 'IAG.L', name: 'International Airlines Group', symbol: 'IAG.L', kind: 'Stock' },
  { id: 'ITA', name: 'iShares U.S. Aerospace & Defense ETF', symbol: 'ITA', kind: 'ETF' },
  { id: 'RHM.DE', name: 'Rheinmetall', symbol: 'RHM.DE', kind: 'Stock' },
  { id: 'NVDA.RTH', name: 'NVIDIA (extended hours)', symbol: 'NVDA', kind: 'Stock' }
];

const DAY = 86400000;
const median = values => { const s = [...values].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

// Yahoo quotes London shares in pence (GBp) and sometimes in other minor units.
export function toMajor(amount, currency) {
  if (currency === 'GBp' || currency === 'GBX') return { amount: amount / 100, currency: 'GBP' };
  return { amount, currency };
}

export function parseChart(body) {
  const result = body?.chart?.result?.[0];
  const price = result?.meta?.regularMarketPrice;
  if (!result || !Number.isFinite(price) || !result.meta.currency) throw new Error('Unexpected chart response');
  const dividends = Object.values(result.events?.dividends || {})
    .filter(d => Number.isFinite(d.amount) && d.amount > 0 && Number.isFinite(d.date))
    .map(d => ({ exDate: new Date(d.date * 1000).toISOString().slice(0, 10), amount: d.amount }))
    .sort((a, b) => a.exDate.localeCompare(b.exDate));
  // chartPreviousClose is the close before the whole requested range, so take the last daily close before today's session.
  const closes = result.indicators?.quote?.[0]?.close || [], stamps = result.timestamp || [];
  const sessionDay = result.meta.regularMarketTime ? new Date(result.meta.regularMarketTime * 1000).toISOString().slice(0, 10) : null;
  let previousClose = null;
  for (let i = stamps.length - 1; i >= 0 && sessionDay; i--) {
    if (new Date(stamps[i] * 1000).toISOString().slice(0, 10) < sessionDay && Number.isFinite(closes[i])) { previousClose = closes[i]; break; }
  }
  return { price, currency: result.meta.currency, previousClose, marketTime: result.meta.regularMarketTime ? new Date(result.meta.regularMarketTime * 1000).toISOString() : null, dividends };
}

// Projects the next ex-dividend date from the payment rhythm and the amount from the last payment.
// The date is a projection unless the provider already lists a future ex-date.
export function estimateNextDividend(dividends, now = Date.now()) {
  if (!dividends?.length) return null;
  const times = dividends.map(d => Date.parse(d.exDate));
  const last = dividends.at(-1);
  const recent = times.slice(-5);
  const gaps = recent.slice(1).map((t, i) => t - recent[i]);
  const interval = gaps.length ? median(gaps) : 365 * DAY;
  if (!(interval >= 20 * DAY)) return null;
  let next = times.at(-1), announced = false;
  if (next > now) announced = true;
  else {
    // A payer that has skipped well past its usual gap has probably stopped; don't project a date for it.
    if (now - next > Math.max(interval, ...gaps) * 1.25) return null;
    while (next <= now) next += interval;
  }
  const trailingYear = dividends.filter(d => Date.parse(d.exDate) > now - 365 * DAY).reduce((sum, d) => sum + d.amount, 0);
  return { exDate: new Date(next).toISOString().slice(0, 10), announced, amount: last.amount, lastExDate: last.exDate, trailingYear, paymentsPerYear: Math.max(1, Math.round(365 * DAY / interval)) };
}

const cache = new Map();
async function chart(symbol) {
  const hit = cache.get(symbol);
  if (hit && Date.now() - hit.time < 60000) return hit.data;
  const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=3y&interval=1d&events=div`, { signal: AbortSignal.timeout(10000), cache: 'no-store', headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; quant-tracker)' } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = parseChart(await response.json());
  cache.set(symbol, { time: Date.now(), data });
  return data;
}

async function fxRates() {
  const hit = cache.get('fx');
  if (hit && Date.now() - hit.time < 3600000) return hit.data;
  const response = await fetch('https://api.frankfurter.dev/v1/latest?base=GBP&symbols=USD,EUR', { signal: AbortSignal.timeout(8000), cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const body = await response.json();
  const data = { date: body.date, perGBP: { GBP: 1, ...body.rates } };
  cache.set('fx', { time: Date.now(), data });
  return data;
}

export async function getPortfolio() {
  const [fx, ...results] = await Promise.allSettled([fxRates(), ...[...new Set(HOLDINGS.map(h => h.symbol))].map(async symbol => [symbol, await chart(symbol)])]);
  const quotes = Object.fromEntries(results.filter(r => r.status === 'fulfilled').map(r => r.value));
  const rates = fx.status === 'fulfilled' ? fx.value : null;
  const now = Date.now();
  const holdings = HOLDINGS.map(h => {
    const q = quotes[h.symbol];
    if (!q) return { ...h, status: 'unavailable' };
    const major = toMajor(q.price, q.currency);
    const rate = rates?.perGBP[major.currency];
    const toGBP = amount => rate ? toMajor(amount, q.currency).amount / rate : null;
    const dividend = estimateNextDividend(q.dividends, now);
    return {
      ...h, status: rate ? 'ok' : 'no-fx', currency: major.currency, price: major.amount, priceGBP: toGBP(q.price),
      // Daily bars for 24/7 crypto don't line up with a rolling 24h change, so only show it for exchange-traded assets.
      change: q.previousClose && h.kind !== 'Crypto' ? (q.price / q.previousClose - 1) * 100 : null, asOf: q.marketTime,
      dividend: dividend && { ...dividend, amountGBP: toGBP(dividend.amount), amountLocal: toMajor(dividend.amount, q.currency).amount, trailingYearGBP: toGBP(dividend.trailingYear) }
    };
  });
  return { fetchedAt: new Date().toISOString(), fx: rates && { date: rates.date, source: 'Frankfurter / ECB' }, holdings };
}
