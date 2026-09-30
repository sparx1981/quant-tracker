import { getHistory, INTERVALS } from '../../../lib/sources';
export const maxDuration = 30;
export async function GET(request) {
  const interval = new URL(request.url).searchParams.get('interval') || '1d';
  if (!INTERVALS.has(interval)) return Response.json({ error: 'Unsupported interval' }, { status: 400 });
  return Response.json(await getHistory(interval), { headers: { 'Cache-Control': 'public, s-maxage=15' } });
}
