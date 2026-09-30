import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze, forecast, normalizeCandles } from '../lib/analysis.js';
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
  for (const name of ['SMA 20', 'SMA 50', 'SMA 200', 'EMA 20', 'Rate of change · 12d', 'On-balance volume']) {
    assert.equal(rising.indicators.find(x => x.name === name).signal, 'Bullish', name);
    assert.equal(falling.indicators.find(x => x.name === name).signal, 'Bearish', name);
  }
  assert.equal(rising.indicators.find(x => x.name === 'RSI 14').signal, 'Neutral', 'Overbought must not be a buy signal');
  assert.equal(falling.indicators.find(x => x.name === 'RSI 14').signal, 'Neutral', 'Oversold must not be a buy signal');
  assert.equal(Object.values(rising.counts).reduce((a, b) => a + b, 0), rising.indicators.length);
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

