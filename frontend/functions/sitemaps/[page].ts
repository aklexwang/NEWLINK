import type { PagesEnv } from '../_lib/env';
import { proxySitemap } from '../_lib/proxy-sitemap';

export const onRequestGet = async (context: {
  env: PagesEnv;
  params: { page?: string | string[] };
}) => {
  const raw = Array.isArray(context.params.page) ? context.params.page[0] : context.params.page;
  const page = Number(String(raw ?? '').replace(/\.xml$/i, ''));
  if (!Number.isInteger(page) || page < 1) {
    return new Response('잘못된 sitemap 페이지입니다.', { status: 400 });
  }
  return proxySitemap(context.env, `/seo/sitemaps/${page}`);
};
