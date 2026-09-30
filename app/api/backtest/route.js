import { getBacktest } from '../../../lib/sources';
export const maxDuration = 30;
export async function GET() {
  return Response.json(await getBacktest(), { headers: { 'Cache-Control': 'public, s-maxage=300' } });
}
