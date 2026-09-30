import * as technical from 'technicalindicators';
import { drawdownStats } from './risk.js';

export const STRATEGIES = [
  { id: 'hold', name: 'Buy & hold', rule: 'Buy at the first test open and hold until the last test close.' },
  { id: 'sma', name: 'SMA 20 / 50', rule: 'Long when SMA 20 is above SMA 50; otherwise cash.' },
  { id: 'ema', name: 'EMA 12 / 26', rule: 'Long when EMA 12 is above EMA 26; otherwise cash.' },
  { id: 'macd', name: 'MACD 12 / 26 / 9', rule: 'Long when the MACD histogram is positive; otherwise cash.' },
  { id: 'rsi', name: 'RSI mean reversion', rule: 'Enter below RSI 30; exit above RSI 55. Hold between the thresholds.' },
  { id: 'breakout', name: 'Donchian 20 / 10', rule: 'Enter on a close above the preceding 20 highs; exit below the preceding 10 lows.' }
];
const align = (values, length) => Array(length - values.length).fill(null).concat(values);
export function strategyPositions(candles, id) {
  const values = candles.map(c => c.close), n = values.length;
  if (id === 'hold') return values.map(() => true);
  const sma20 = align(technical.SMA.calculate({ values, period: 20 }), n), sma50 = align(technical.SMA.calculate({ values, period: 50 }), n);
  const ema12 = align(technical.EMA.calculate({ values, period: 12 }), n), ema26 = align(technical.EMA.calculate({ values, period: 26 }), n);
  const rsi = align(technical.RSI.calculate({ values, period: 14 }), n);
  const macd = align(technical.MACD.calculate({ values, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, SimpleMAOscillator: false, SimpleMASignal: false }), n);
  let holding = false;
  return values.map((value, i) => {
    if (id === 'sma') holding = sma50[i] !== null && sma20[i] > sma50[i];
    if (id === 'ema') holding = ema26[i] !== null && ema12[i] > ema26[i];
    if (id === 'macd') holding = Number.isFinite(macd[i]?.histogram) && macd[i].histogram > 0;
    if (id === 'rsi' && rsi[i] !== null) { if (rsi[i] < 30) holding = true; else if (rsi[i] > 55) holding = false; }
    if (id === 'breakout' && i >= 20) {
      if (value > Math.max(...candles.slice(i - 20, i).map(c => c.high))) holding = true;
      else if (value < Math.min(...candles.slice(i - 10, i).map(c => c.low))) holding = false;
    }
    return holding;
  });
}

export function simulate(candles, positions, start, { capital = 10000, fee = .001, slippage = .0005 } = {}) {
  let cash = capital, units = 0, entryValue = 0, peak = capital, maxDrawdown = 0, exposed = 0, totalCosts = 0;
  const trades = [], equity = [];
  const sell = (price, time, final = false) => {
    const gross = units * price, proceeds = gross * (1 - slippage) * (1 - fee);
    totalCosts += gross - proceeds;
    cash = proceeds;
    trades.push({ exit: time, returnPct: (cash / entryValue - 1) * 100, final });
    units = 0;
  };
  for (let i = start; i < candles.length; i++) {
    // Yesterday's completed signal is executed at today's open, never yesterday's close.
    const long = positions[i - 1] === true, c = candles[i];
    if (long && units === 0) {
      entryValue = cash;
      units = cash / (c.open * (1 + slippage) * (1 + fee));
      totalCosts += cash - units * c.open;
      cash = 0;
    } else if (!long && units > 0) sell(c.open, c.time);
    if (units > 0) exposed++;
    if (i === candles.length - 1 && units > 0) sell(c.close, c.closeTime, true);
    const value = cash + units * c.close;
    peak = Math.max(peak, value);
    maxDrawdown = Math.max(maxDrawdown, (peak - value) / peak);
    equity.push({ time: c.time, value });
  }
  const finalValue = equity.at(-1)?.value ?? capital;
  return { finalValue, returnPct: (finalValue / capital - 1) * 100, maxDrawdown: maxDrawdown * 100, trades: trades.length,
    winRate: trades.length ? trades.filter(t => t.returnPct > 0).length / trades.length * 100 : null,
    exposure: exposed / Math.max(1, candles.length - start) * 100, costs: totalCosts, equity,
    ...drawdownStats(equity, capital), tradeLog: trades.slice(-20) };
}

function forwardEvidence(candles, positions, days) {
  const observations = [];
  let nextEligible = 200;
  for (let i = 200; i + days < candles.length; i++) {
    // Non-overlapping entry episodes: subsequent entries must follow the previous horizon.
    if (i < nextEligible || !positions[i] || positions[i - 1]) continue;
    observations.push(candles[i + days].close / candles[i + 1].open - 1);
    nextEligible = i + days + 1;
  }
  observations.sort((a, b) => a - b);
  const n = observations.length;
  const median = n ? (observations[Math.floor((n - 1) / 2)] + observations[Math.ceil((n - 1) / 2)]) / 2 : null;
  return { days, samples: n, medianReturn: median, positiveRate: n ? observations.filter(r => r > 0).length / n : null, adequate: n >= 20 };
}

export function backtest(candles, options = {}) {
  if (candles.length < 260) return null;
  const start = 200, recentStart = start + Math.floor((candles.length - start) * .7);
  return { start: candles[start].time, end: candles.at(-1).closeTime, bars: candles.length - start, recentStart: candles[recentStart].time,
    assumptions: { capital: 10000, fee: .001, slippage: .0005, ...options },
    strategies: STRATEGIES.map(strategy => {
      const positions = strategyPositions(candles, strategy.id);
      return { ...strategy, currentSignal: positions.at(-1) ? 'Long' : 'Cash', full: simulate(candles, positions, start, options), recent: simulate(candles, positions, recentStart, options), forward: strategy.id === 'hold' ? [] : [7, 30].map(days => forwardEvidence(candles, positions, days)) };
    })
  };
}
