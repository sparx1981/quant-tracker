const BASE = 'https://raw.githubusercontent.com/sparx1981/quant-tracker/paper-ledger';
const fresh = () => ({ cache: 'no-store', signal: AbortSignal.timeout(8000) });
const minute = () => Math.floor(Date.now() / 60000);
const valid = data => data.schema === 1 && data.mode === 'PAPER' && data.symbol === 'QNT/USD' && Array.isArray(data.decisions);

async function previous(strategy) {
  // The frozen summary of the strategy this one replaced; optional, so any failure just omits it.
  try {
    const response = await fetch(`${BASE}/summary-${strategy}.json?minute=${minute()}`, fresh());
    if (!response.ok) return null;
    const data = await response.json();
    return valid(data) ? { strategy: data.strategy, started_at: data.started_at, updated_at: data.updated_at, equity: data.equity, pnl: data.pnl, closed_trades: data.closed_trades, win_rate: data.win_rate, days_observed: data.days_observed } : null;
  } catch { return null; }
}

export async function GET() {
  try {
    // Avoid retaining GitHub CDN's initial 404 or an older branch snapshot.
    const response = await fetch(`${BASE}/summary.json?minute=${minute()}`, fresh());
    if (!response.ok) throw new Error('No published observation');
    const data = await response.json();
    if (!valid(data)) throw new Error('Invalid report');
    const before = data.strategy === 'qnt-trend-v2' ? await previous('qnt-trend-v1') : null;
    return Response.json({ status: 'ok', data, previous: before }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ status: 'unavailable', message: 'No paper report available. Check the QNT paper research workflow on GitHub.' }, { headers: { 'Cache-Control': 'no-store' } });
  }
}
