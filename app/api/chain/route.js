import { getChain } from '../../../lib/sources';
export const maxDuration = 30;
export async function GET() {
  return Response.json(await getChain(), { headers: { 'Cache-Control': 'public, s-maxage=60' } });
}
