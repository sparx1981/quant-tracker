const RAW = 'https://raw.githubusercontent.com/sparx1981/quant-tracker/paper-ledger';
const fresh = () => ({ cache: 'no-store', signal: AbortSignal.timeout(8000) });

async function bundled() {
  // Published by the worker; avoids a directory listing and one request per day.
  const response = await fetch(`${RAW}/reports.json?minute=${Math.floor(Date.now() / 60000)}`, fresh());
  if (!response.ok) throw new Error('No bundle');
  const data = await response.json();
  if (data.schema !== 1 || !Array.isArray(data.reports)) throw new Error('Invalid bundle');
  return data.reports;
}

// Until the worker has published a bundle, probe the dated files on the data branch. Raw file reads avoid
// the GitHub API's unauthenticated rate limit; days with no report simply return 404.
async function probed() {
  const days = Array.from({ length: 30 }, (_, i) => new Date(Date.now() - i * 86400000).toISOString().slice(0, 10));
  const found = await Promise.all(days.map(async date => {
    const file = await fetch(`${RAW}/${date}.md?minute=${Math.floor(Date.now() / 60000)}`, fresh());
    return file.ok ? { date, markdown: await file.text() } : null;
  }));
  const reports = found.filter(Boolean);
  if (!reports.length) throw new Error('No reports');
  return reports;
}

export async function GET() {
  try {
    let reports;
    try { reports = await bundled(); } catch { reports = await probed(); }
    reports = reports.filter(r => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && typeof r.markdown === 'string').sort((a, b) => b.date.localeCompare(a.date));
    return Response.json({ status: 'ok', data: reports }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ status: 'unavailable', message: 'Daily reports are unavailable. Check the QNT paper research workflow on GitHub.' }, { headers: { 'Cache-Control': 'no-store' } });
  }
}
