import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateNextDividend, parseChart, toMajor } from '../lib/portfolio.js';

const now = Date.parse('2026-10-26T12:00:00Z');

test('quarterly payer projects the next ex-date and uses the last amount', () => {
  const next = estimateNextDividend([
    { exDate: '2026-01-05', amount: 0.2 }, { exDate: '2026-04-06', amount: 0.2 }, { exDate: '2026-07-06', amount: 0.25 }, { exDate: '2026-10-05', amount: 0.25 }
  ], now);
  assert.equal(next.announced, false);
  assert.ok(next.exDate > '2026-10-26' && next.exDate < '2027-02-01');
  assert.equal(next.amount, 0.25);
  assert.equal(next.paymentsPerYear, 4);
  assert.ok(Math.abs(next.trailingYear - 0.9) < 1e-9);
});

test('a future ex-date from the provider is reported as listed', () => {
  const next = estimateNextDividend([{ exDate: '2026-06-01', amount: 1 }, { exDate: '2026-11-15', amount: 1.1 }], now);
  assert.equal(next.exDate, '2026-11-15');
  assert.equal(next.announced, true);
});

test('no history, or a payer gone quiet for over a period, gives no estimate', () => {
  assert.equal(estimateNextDividend([], now), null);
  assert.equal(estimateNextDividend([{ exDate: '2023-03-01', amount: 1 }], now), null);
});

test('pence are converted to pounds and chart responses are validated', () => {
  assert.deepEqual(toMajor(395, 'GBp'), { amount: 3.95, currency: 'GBP' });
  assert.deepEqual(toMajor(10, 'USD'), { amount: 10, currency: 'USD' });
  const parsed = parseChart({ chart: { result: [{ meta: { regularMarketPrice: 10, currency: 'USD', chartPreviousClose: 9 }, events: { dividends: { a: { amount: 0.5, date: 1780579800 }, b: { amount: 0, date: 1 } } } }] } });
  assert.equal(parsed.dividends.length, 1);
  const day = d => Date.parse(d + 'T14:30:00Z') / 1000;
  const daily = parseChart({ chart: { result: [{ meta: { regularMarketPrice: 105, currency: 'USD', chartPreviousClose: 1, regularMarketTime: day('2026-10-26') }, timestamp: [day('2026-10-22'), day('2026-10-23'), day('2026-10-26')], indicators: { quote: [{ close: [98, 100, 104.9] }] } }] } });
  assert.equal(daily.previousClose, 100);
  assert.throws(() => parseChart({ chart: { result: null } }));
});
