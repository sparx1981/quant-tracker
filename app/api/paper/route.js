const URL = 'https://raw.githubusercontent.com/sparx1981/quant-tracker/paper-ledger/summary.json';

export async function GET() {
  try {
    // Avoid retaining GitHub CDN's initial 404 or an older branch snapshot.
    const response = await fetch(`${URL}?minute=${Math.floor(Date.now() / 60000)}`, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error('No published observation');
    const data = await response.json();
    if (data.schema !== 1 || data.mode !== 'PAPER' || data.symbol !== 'QNT/USD' || !Array.isArray(data.decisions)) throw new Error('Invalid report');
    return Response.json({ status: 'ok', data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ status: 'unavailable', message: 'No paper report available. Check the QNT paper research workflow on GitHub.' }, { headers: { 'Cache-Control': 'no-store' } });
  }
}
