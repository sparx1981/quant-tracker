import * as technical from 'technicalindicators';

const last = values => values.at(-1);
const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
const finite = value => typeof value === 'number' && Number.isFinite(value);

export function normalizeCandles(rows, now = Date.now()) {
  if (!Array.isArray(rows)) throw new Error('Invalid candle response');
  return rows.filter(row => Number(row[6]) < now).map(row => ({
    time: Number(row[0]), open: Number(row[1]), high: Number(row[2]), low: Number(row[3]),
    close: Number(row[4]), volume: Number(row[5]), closeTime: Number(row[6])
  })).filter(row => Object.values(row).every(finite) && row.close > 0 && row.low > 0 && row.high >= row.low)
    .sort((a, b) => a.time - b.time);
}

export function analyze(candles, timeframe = '1d') {
  if (candles.length < 35) return { indicators: [], stance: 'Unavailable', score: null, reason: 'At least 35 completed candles are needed.', timeframe, bars: candles.length };
  const close = candles.map(c => c.close), high = candles.map(c => c.high), low = candles.map(c => c.low), volume = candles.map(c => c.volume);
  const price = last(close), indicators = [];
  const add = (name, value, signal, explanation, category) => indicators.push({ name, value, signal, explanation, category });
  const compare = (a, b, band = 0) => a > b * (1 + band) ? 'Bullish' : a < b * (1 - band) ? 'Bearish' : 'Neutral';
  const n = value => finite(value) ? value.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '—';
  for (const period of [20, 50, 200]) {
    if (close.length < period) { add(`SMA ${period}`, '—', 'Unavailable', `Needs ${period} completed ${timeframe} candles; only ${close.length} are available.`, 'Trend'); continue; }
    const value = last(technical.SMA.calculate({ values: close, period }));
    add(`SMA ${period}`, `${n(value)} USDT`, compare(price, value, .005), `Close ${price >= value ? 'above' : 'below'} the ${period}-candle average. Within 0.5% is neutral.`, 'Trend');
  }
  const ema = last(technical.EMA.calculate({ values: close, period: 20 }));
  add('EMA 20', `${n(ema)} USDT`, compare(price, ema, .005), 'Recent prices carry more weight. Close within 0.5% of the average is neutral.', 'Trend');
  const rsi = last(technical.RSI.calculate({ values: close, period: 14 }));
  add('RSI 14', n(rsi), rsi > 70 || rsi < 30 ? 'Neutral' : rsi > 55 ? 'Bullish' : rsi < 45 ? 'Bearish' : 'Neutral', rsi > 70 ? 'Overbought: stretched momentum, not an automatic sell signal.' : rsi < 30 ? 'Oversold: stretched momentum, not an automatic buy signal.' : '55–70 bullish; 30–45 bearish; 45–55 neutral. Extremes need confirmation.', 'Momentum');
  const macd = last(technical.MACD.calculate({ values: close, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, SimpleMAOscillator: false, SimpleMASignal: false }));
  add('MACD 12 / 26 / 9', n(macd.histogram), Math.abs(macd.histogram) < price * .0005 ? 'Neutral' : macd.histogram > 0 ? 'Bullish' : 'Bearish', 'Histogram above zero supports bullish momentum; below zero supports bearish. Tiny readings are neutral.', 'Momentum');
  const adx = last(technical.ADX.calculate({ close, high, low, period: 14 }));
  add('ADX 14', n(adx.adx), !finite(adx.adx) || adx.adx < 25 ? 'Neutral' : compare(adx.pdi, adx.mdi), `Trend strength ${adx.adx >= 25 ? 'above' : 'below'} 25. +DI ${n(adx.pdi)} / −DI ${n(adx.mdi)} determines direction.`, 'Trend');
  const bb = last(technical.BollingerBands.calculate({ values: close, period: 20, stdDev: 2 }));
  add('Bollinger bands', `${n(bb.lower)}–${n(bb.upper)}`, price > bb.upper || price < bb.lower ? 'Neutral' : compare(price, bb.middle, .005), price > bb.upper || price < bb.lower ? 'Outside the bands: an extended move needs confirmation.' : 'Inside bands: above the middle supports bullish positioning, below it bearish.', 'Volatility');
  const stoch = last(technical.Stochastic.calculate({ high, low, close, period: 14, signalPeriod: 3 }));
  add('Stochastic 14 / 3', `${n(stoch.k)} / ${n(stoch.d)}`, stoch.k > 80 || stoch.k < 20 ? 'Neutral' : Math.abs(stoch.k - stoch.d) < 2 ? 'Neutral' : stoch.k > stoch.d ? 'Bullish' : 'Bearish', 'K versus D measures momentum. Below 20 or above 80 is an extreme, treated as neutral pending confirmation.', 'Momentum');
  const roc = last(technical.ROC.calculate({ values: close, period: 12 }));
  add('Rate of change · 12 bars', `${n(roc)}%`, roc > 1 ? 'Bullish' : roc < -1 ? 'Bearish' : 'Neutral', 'Price change over 12 candles; moves within ±1% are neutral.', 'Momentum');
  const obv = technical.OBV.calculate({ close, volume });
  const obvChange = last(obv) - obv.at(-11);
  add('On-balance volume', `${obvChange >= 0 ? '+' : ''}${n(obvChange)}`, obvChange > 0 ? 'Bullish' : obvChange < 0 ? 'Bearish' : 'Neutral', '10-session change in cumulative signed volume. This reflects Binance QNT/USDT trading only.', 'Volume');
  const counts = { Bullish: 0, Bearish: 0, Neutral: 0, Unavailable: 0 };
  for (const item of indicators) counts[item.signal]++;
  const available = indicators.length - counts.Unavailable;
  const score = (counts.Bullish - counts.Bearish) / available;
  return { indicators, counts, available, timeframe, bars: candles.length, score, stance: score > .2 ? 'Bullish' : score < -.2 ? 'Bearish' : 'Neutral', asOf: new Date(last(candles).closeTime).toISOString(), close: price };
}

// Normal CDF approximation; target probabilities assume continuous log-Brownian prices.
export function normalCDF(x) {
  const t = 1 / (1 + .2316419 * Math.abs(x));
  const tail = .3989422804014327 * Math.exp(-x * x / 2) * t * (.319381530 + t * (-.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - tail : tail;
}
export function targetProbability(spot, target, days, drift, volatility) {
  if (![spot, target, days, drift, volatility].every(finite) || spot <= 0 || target <= 0 || days <= 0 || volatility < 0) return null;
  const direction = target >= spot ? 1 : -1;
  const barrier = Math.abs(Math.log(target / spot));
  const mu = direction * drift;
  if (volatility === 0) return { touch: barrier === 0 || mu * days >= barrier ? 1 : 0, finish: mu * days >= barrier ? 1 : 0, direction: direction > 0 ? 'at or above' : 'at or below' };
  const sd = volatility * Math.sqrt(days);
  const x = (-mu * days - barrier) / sd;
  const logTail = x < -8 ? -.5 * x * x - Math.log(-x) - .5 * Math.log(2 * Math.PI) + Math.log(1 - 1 / (x * x) + 3 / x ** 4) : Math.log(normalCDF(x));
  const touch = normalCDF((mu * days - barrier) / sd) + Math.exp(2 * mu * barrier / (volatility ** 2) + logTail);
  return { touch: barrier === 0 ? 1 : Math.min(1, Math.max(0, touch)), finish: normalCDF((mu * days - barrier) / sd), direction: direction > 0 ? 'at or above' : 'at or below' };
}

export function forecast(candles, spot) {
  if (!finite(spot) || spot <= 0 || candles.length < 91) return null;
  const closes = candles.slice(-91).map(c => c.close);
  const returns = closes.slice(1).map((c, i) => Math.log(c / closes[i]));
  const average = mean(returns);
  const volatility = Math.sqrt(returns.reduce((sum, r) => sum + (r - average) ** 2, 0) / (returns.length - 1));
  // A deliberately weak trend assumption: shrink observed log-return drift by 75%,
  // then limit the median's annual change to a doubling or halving.
  const drift = Math.max(-Math.log(2) / 365, Math.min(Math.log(2) / 365, average * .25));
  const z = 1.2815515655446004;
  return { dailyVolatility: volatility, dailyDrift: drift, observations: returns.length,
    levels: [['1 week', 7], ['1 month', 30], ['3 months', 90], ['6 months', 180], ['12 months', 365]].map(([horizon, days]) => {
      const row = { horizon, days, bear: spot * Math.exp(drift * days - z * volatility * Math.sqrt(days)), base: spot * Math.exp(drift * days), bull: spot * Math.exp(drift * days + z * volatility * Math.sqrt(days)) };
      row.probabilities = Object.fromEntries(['bear', 'base', 'bull'].map(kind => [kind, targetProbability(spot, row[kind], days, drift, volatility)]));
      return row;
    })
  };
}
