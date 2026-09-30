import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeFeedChecks } from '../lib/sources.js';

test('feed summary counts statuses and exposes degraded state', () => {
  const summary = summarizeFeedChecks([
    { status: 'ok' },
    { status: 'warning' },
    { status: 'not_configured' },
    { status: 'not_used' }
  ]);
  assert.equal(summary.overall, 'degraded');
  assert.deepEqual(summary.counts, { ok: 1, warning: 1, not_configured: 1, not_used: 1 });
  assert.equal(summary.checked, 4);
});

test('feed summary only fails when a provider explicitly fails', () => {
  assert.equal(summarizeFeedChecks([{ status: 'ok' }, { status: 'not_configured' }]).overall, 'healthy');
  assert.equal(summarizeFeedChecks([{ status: 'failed' }]).overall, 'failed');
});
