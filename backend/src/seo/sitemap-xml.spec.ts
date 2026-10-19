import {
  buildSitemapIndexXml,
  buildUrlsetXml,
  sitemapPageCount,
  SITEMAP_PAGE_SIZE,
  xmlEscape,
} from './sitemap-xml';

describe('sitemap-xml', () => {
  it('XML 특수문자를 이스케이프한다', () => {
    expect(xmlEscape(`a&b<c>"d"'e`)).toBe(
      'a&amp;b&lt;c&gt;&quot;d&quot;&apos;e',
    );
  });

  it('urlset에 loc와 lastmod를 넣는다', () => {
    const xml = buildUrlsetXml([
      { loc: 'https://global-spay.com/c/telegram', lastmod: '2026-10-18' },
    ]);
    expect(xml).toContain('<loc>https://global-spay.com/c/telegram</loc>');
    expect(xml).toContain('<lastmod>2026-10-18</lastmod>');
  });

  it('5만 개를 넘으면 페이지 수가 늘어난다', () => {
    expect(sitemapPageCount(SITEMAP_PAGE_SIZE)).toBe(1);
    expect(sitemapPageCount(SITEMAP_PAGE_SIZE + 1)).toBe(2);
  });

  it('sitemap index loc를 나열한다', () => {
    const xml = buildSitemapIndexXml([
      { loc: 'https://global-spay.com/sitemaps/1.xml' },
    ]);
    expect(xml).toContain('<sitemapindex');
    expect(xml).toContain('https://global-spay.com/sitemaps/1.xml');
  });
});
