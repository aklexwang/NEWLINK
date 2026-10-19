import type { PagesEnv } from './_lib/env';
import { proxySitemap } from './_lib/proxy-sitemap';

export const onRequestGet = async (context: { env: PagesEnv }) => {
  return proxySitemap(context.env, '/seo/sitemap.xml');
};
