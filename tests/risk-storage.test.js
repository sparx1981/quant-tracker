import test from 'node:test';
import assert from 'node:assert/strict';
import { drawdownStats, journalOutcome } from '../lib/risk.js';
import { storageConfig, publicSnapshot } from '../lib/archive.js';

test('underwater duration includes unrecovered losses and resets on recovery', () => {
  const result = drawdownStats([100, 90, 80, 100, 110, 90].map(value => ({ value })), 100);
  assert.equal(result.longestUnderwaterBars, 2);
  assert.equal(result.currentUnderwaterBars, 1);
  assert.equal(result.underwaterPct, 50);
});
test('journal scores the deadline candle, not later market movement', () => {
  const day = 86400000, entry = { created: 0, horizonDays: 30, price: 100, stance: 'Bullish' };
  const candles = [{ closeTime: 30 * day, close: 110 }, { closeTime: 40 * day, close: 20 }];
  assert.equal(journalOutcome(entry, candles, 29 * day), null);
  assert.equal(journalOutcome(entry, candles, 40 * day).aligned, true);
  assert.equal(journalOutcome(entry, candles.slice(1), 40 * day), null);
});
test('Supabase normalizes REST URLs and does not send new secrets as JWTs', () => {
  const config = storageConfig({ SUPABASE_URL: 'https://example.supabase.co/rest/v1/', SUPABASE_SECRET_KEY: 'sb_secret_test' });
  assert.equal(config.base, 'https://example.supabase.co/rest/v1');
  assert.equal(config.headers.Authorization, undefined);
  assert.equal(storageConfig({ SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'test' }), null);
});
test('archive payload uses an allowlist and excludes personal fields', () => {
  const row = publicSnapshot({ holding: 123, cost: 130, target: 1000, market: { status: 'ok', data: { price: 80, source: 'Example', updatedAt: new Date().toISOString() } }, history: { status: 'ok', data: {} }, forecasts: { levels: [] } });
  assert.equal(row.price_usd, 80);
  for (const key of ['holding', 'cost', 'target']) assert.equal(key in row, false);
});
