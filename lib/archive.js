// Server routes only. Personal holdings, cost basis and targets are never accepted here.
export function storageConfig(env = process.env) {
  const key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!env.SUPABASE_URL || !key) return null;
  const url = new URL(env.SUPABASE_URL);
  if (url.protocol !== 'https:') throw new Error('HTTPS required');
  const headers = { apikey: key, 'Content-Type': 'application/json' };
  if (!key.startsWith('sb_secret_')) headers.Authorization = `Bearer ${key}`;
  return { base: `${url.origin}/rest/v1`, headers };
}

export function publicSnapshot(market) {
  const quote = market.market;
  if (quote?.status !== 'ok' || market.history?.status !== 'ok' || !market.forecasts) return null;
  const asOf = Date.parse(quote.data.updatedAt);
  if (!Number.isFinite(asOf) || Math.abs(Date.now() - asOf) > 15 * 60000) return null;
  return {
    day: new Date().toISOString().slice(0, 10), model_version: 'log-brownian-v1',
    recorded_at: new Date().toISOString(), price_usd: quote.data.price,
    source: quote.data.source, source_at: quote.data.updatedAt,
    candle_at: market.history.data.analysis?.asOf,
    forecast: market.forecasts
  };
}

let lastAttempt = 0;
let lastResult = { status: 'not_checked', message: 'No recording attempted in this server instance.' };
export async function recordPublicSnapshot(market) {
  let config;
  try { config = storageConfig(); } catch { return { status: 'error', message: 'Invalid Supabase URL.' }; }
  if (!config) return { status: 'not_configured', message: 'Server storage credentials are missing.' };
  if (Date.now() - lastAttempt < 300000) return lastResult;
  const row = publicSnapshot(market);
  if (!row) return { status: 'skipped', message: 'Fresh price and history required before recording.' };
  lastAttempt = Date.now();
  try {
    const response = await fetch(`${config.base}/qnt_public_snapshots?on_conflict=day,model_version`, {
      method: 'POST', headers: { ...config.headers, Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify(row), signal: AbortSignal.timeout(3000), cache: 'no-store'
    });
    if (!response.ok) throw new Error();
    lastResult = { status: 'ok', message: 'Daily public snapshot archive accepted the request. Existing forecasts are preserved.' };
  } catch { lastResult = { status: 'error', message: 'Archive unavailable. Check credentials and apply the Supabase schema.' }; }
  return lastResult;
}
