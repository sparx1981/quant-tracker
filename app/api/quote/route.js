import { getQuote } from '../../../lib/sources';
export const maxDuration = 30;
export async function GET() {
  return Response.json(await getQuote(), { headers: { 'Cache-Control': 'public, s-maxage=10' } });
}
