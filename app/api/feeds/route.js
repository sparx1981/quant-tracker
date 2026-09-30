import { checkFeeds } from '../../../lib/sources';

export const maxDuration = 30;

export async function GET() {
  const result = await checkFeeds();
  return Response.json(result, {
    headers: {
      'Cache-Control': 'no-store, max-age=0'
    }
  });
}
