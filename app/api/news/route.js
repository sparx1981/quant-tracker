import { getNews } from '../../../lib/sources';
export const maxDuration = 30;
export async function GET() {
  return Response.json(await getNews(), { headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=600' } });
}

