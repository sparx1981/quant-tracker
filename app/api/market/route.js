import { getMarket } from '../../../lib/sources';
export const maxDuration = 30;
export async function GET() {
  return Response.json(await getMarket(), { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' } });
}
