export const SITEMAP_PAGE_SIZE = 50_000;

export function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function buildUrlsetXml(
  urls: { loc: string; lastmod?: string | null }[],
): string {
  const body = urls
    .map((item) => {
      const lastmod = item.lastmod
        ? `\n    <lastmod>${xmlEscape(item.lastmod)}</lastmod>`
        : '';
      return `  <url>\n    <loc>${xmlEscape(item.loc)}</loc>${lastmod}\n  </url>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

export function buildSitemapIndexXml(sitemaps: { loc: string }[]): string {
  const body = sitemaps
    .map(
      (item) =>
        `  <sitemap>\n    <loc>${xmlEscape(item.loc)}</loc>\n  </sitemap>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</sitemapindex>\n`;
}

export function sitemapPageCount(
  total: number,
  pageSize = SITEMAP_PAGE_SIZE,
): number {
  if (total <= 0) return 1;
  return Math.ceil(total / pageSize);
}
