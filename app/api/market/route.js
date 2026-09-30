import { getMarket } from '../../../lib/sources';
import { recordPublicSnapshot } from '../../../lib/archive';
export const maxDuration = 30;
export async function GET() {
  const market = await getMarket();
  const archive = await recordPublicSnapshot(market);
  return Response.json({ ...market, archive }, { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' } });
}
