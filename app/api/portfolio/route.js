import { getPortfolio } from '../../../lib/portfolio';
export const maxDuration = 30;
export async function GET() {
  try { return Response.json({ status: 'ok', data: await getPortfolio() }, { headers: { 'Cache-Control': 'public, s-maxage=30' } }); }
  catch { return Response.json({ status: 'unavailable', message: 'Portfolio data is temporarily unavailable.' }, { headers: { 'Cache-Control': 'no-store' } }); }
}
