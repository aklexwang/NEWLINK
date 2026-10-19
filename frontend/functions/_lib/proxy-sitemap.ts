import { apiBase, CACHE_CONTROL, type PagesEnv } from './env';

export async function proxySitemap(env: PagesEnv, path: string): Promise<Response> {
  const base = apiBase(env);
  if (!base) {
    return new Response('API_BASE_URL이 없습니다.', { status: 500 });
  }
  const upstream = await fetch(`${base}${path}`, {
    headers: { Accept: 'application/xml' },
    signal: AbortSignal.timeout(15_000),
  });
  const xml = await upstream.text();
  return new Response(xml, {
    status: upstream.status,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': CACHE_CONTROL,
    },
  });
}
