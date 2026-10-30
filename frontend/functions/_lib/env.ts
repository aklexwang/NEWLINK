export const SITE_ORIGIN = 'https://newlink-bez.pages.dev';
export const CACHE_CONTROL = 'public, max-age=3600';

export interface PagesEnv {
  API_BASE_URL?: string;
  ASSETS?: { fetch: (request: Request | string) => Promise<Response> };
}

export function apiBase(env: PagesEnv): string | null {
  const raw = (env.API_BASE_URL ?? '').trim().replace(/\/$/, '');
  if (!raw) return null;
  return raw.endsWith('/api') ? raw : `${raw}/api`;
}

export function apiOrigin(env: PagesEnv): string {
  const base = apiBase(env);
  if (!base) return SITE_ORIGIN;
  return base.replace(/\/api$/, '');
}

export async function fetchIndexHtml(request: Request, env: PagesEnv): Promise<Response> {
  const indexUrl = new URL('/index.html', request.url);
  if (env.ASSETS) {
    return env.ASSETS.fetch(new Request(indexUrl.toString(), { method: 'GET' }));
  }
  return fetch(indexUrl.toString());
}

export function cachedHtml(source: Response, body?: BodyInit | null): Response {
  const headers = new Headers(source.headers);
  headers.set('Cache-Control', CACHE_CONTROL);
  headers.set('Content-Type', 'text/html; charset=utf-8');
  return new Response(body === undefined ? source.body : body, {
    status: source.status,
    headers,
  });
}
