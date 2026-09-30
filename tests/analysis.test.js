import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze, forecast, normalizeCandles, targetProbability, normalCDF } from '../lib/analysis.js';
import { simulate, strategyPositions, backtest } from '../lib/backtest.js';
import { number } from '../lib/sources.js';

const series = (count, price) => Array.from({ length: count }, (_, i) => ({ time: i * 86400000, closeTime: (i + 1) * 86400000 - 1, open: price(i), high: price(i) * 1.01, low: price(i) * .99, close: price(i), volume: 1000 + i }));

test('unfinished daily candles and malformed values cannot enter the model', () => {
  const data = normalizeCandles([[0, '99', '102', '98', '100', '500', 999], [1000, '100', '110', '90', '105', '100', 1999], [0, 'x', '102', '98', '100', '500', 999]], 1500);
  assert.equal(data.length, 1);
  assert.equal(data[0].close, 100);
});

test('rising and falling prices produce opposite trend readings', () => {
  const rising = analyze(series(300, i => 50 + i * .5));
  const falling = analyze(series(300, i => 300 - i * .5));
  for (const name of ['SMA 20', 'SMA 50', 'SMA 200', 'EMA 20', 'Rate of change · 12 bars', 'On-balance volume']) {
    assert.equal(rising.indicators.find(x => x.name === name).signal, 'Bullish', name);
    assert.equal(falling.indicators.find(x => x.name === name).signal, 'Bearish', name);
  }
  assert.equal(rising.indicators.find(x => x.name === 'RSI 14').signal, 'Neutral', 'Overbought must not be a buy signal');
  assert.equal(falling.indicators.find(x => x.name === 'RSI 14').signal, 'Neutral', 'Oversold must not be a buy signal');
  assert.equal(Object.values(rising.counts).reduce((a, b) => a + b, 0), rising.indicators.length);
});

test('monthly history excludes unavailable long averages rather than inventing them', () => {
  const a = analyze(series(62, i => 100 + i), '1M');
  assert.equal(a.indicators.find(i => i.name === 'SMA 200').signal, 'Unavailable');
  assert.equal(a.available, 10);
  assert.equal(a.counts.Unavailable, 1);
  assert.ok(a.indicators.every(i => !/NaN|undefined/.test(i.value)));
});

test('touch probabilities satisfy Brownian reflection, symmetry and horizon behavior', () => {
  const up = targetProbability(100, 120, 30, 0, .04);
  const down = targetProbability(100, 100 / 1.2, 30, 0, .04);
  const expected = 2 * (1 - normalCDF(Math.log(1.2) / (.04 * Math.sqrt(30))));
  assert.ok(Math.abs(up.touch - expected) < 1e-6);
  assert.ok(Math.abs(up.touch - down.touch) < 1e-6);
  assert.ok(up.touch >= up.finish);
  assert.ok(targetProbability(100, 120, 90, 0, .04).touch > up.touch);
  assert.equal(targetProbability(100, 100, 30, 0, .04).touch, 1);
  assert.equal(targetProbability(100, 120, 30, 0, 0).touch, 0);
  assert.equal(targetProbability(100, 120, 30, .01, 0).touch, 1);
  assert.equal(targetProbability(0, 120, 30, 0, .04), null);
});

test('a close signal fills on the following open and pays both entry and exit costs', () => {
  const candles = series(4, () => 100);
  candles[2].open = 200;
  const r = simulate(candles, [false, true, true, true], 1, { capital: 10000, fee: .001, slippage: .0005 });
  const expected = 10000 / (200 * 1.0005 * 1.001) * 100 * .9995 * .999;
  assert.ok(Math.abs(r.finalValue - expected) < 1e-6);
  assert.equal(r.trades, 1);
  assert.ok(r.returnPct < -50);
  assert.ok(r.costs > 0);
});

test('future prices cannot change past strategy signals', () => {
  const candles = series(400, i => 100 + Math.sin(i / 7) * 20);
  const changed = candles.map((c,i) => i < 300 ? c : {...c, close: c.close * 10, high:c.high*10, low:c.low*10});
  for (const strategy of ['sma','ema','macd','rsi','breakout']) assert.deepEqual(strategyPositions(candles,strategy).slice(0,300), strategyPositions(changed,strategy).slice(0,300));
  const d = backtest(candles);
  assert.equal(d.strategies.length, 6);
  assert.ok(d.recentStart > d.start);
  assert.ok(d.strategies.every(s => Number.isFinite(s.full.returnPct) && s.recent.equity.length < s.full.equity.length));
});

test('insufficient history is unavailable, not a fabricated neutral analysis', () => {
  assert.equal(analyze(series(20, () => 100)).stance, 'Unavailable');
  assert.equal(forecast(series(30, () => 100), 100), null);
  assert.equal(forecast(series(300, () => 100), null), null);
});

test('constant prices have no modeled drift or spread', () => {
  const result = forecast(series(200, () => 100), 150);
  assert.equal(result.dailyVolatility, 0);
  for (const row of result.levels) assert.deepEqual([row.bear, row.base, row.bull], [150, 150, 150]);
});

test('scenario ranges stay positive and ordered, widening relatively with horizon', () => {
  const result = forecast(series(300, i => 100 * Math.exp(.006 * i + .09 * Math.sin(i))), 250);
  assert.deepEqual(result.levels.map(r => r.days), [7, 30, 90, 180, 365]);
  let previousRatio = 0;
  for (const row of result.levels) {
    assert.ok(row.bear > 0 && row.bear <= row.base && row.base <= row.bull);
    assert.ok(row.bull / row.bear > previousRatio);
    previousRatio = row.bull / row.bear;
  }
  assert.ok(result.levels.at(-1).base <= 500.0000001, 'Median annual increase is capped at doubling');
});

test('missing API values remain missing instead of becoming zero', () => {
  for (const value of [null, undefined, '', 'bad', Infinity]) assert.equal(number(value), null);
  assert.equal(number('0'), 0);
  assert.equal(number('12.5'), 12.5);
});
