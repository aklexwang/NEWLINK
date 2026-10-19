import {
  apiBase,
  apiOrigin,
  cachedHtml,
  fetchIndexHtml,
  SITE_ORIGIN,
  type PagesEnv,
} from '../_lib/env';

interface ChannelSeoDetail {
  title: string;
  username: string | null;
  link: string;
  category: string;
  description: string;
  avatarUrl: string | null;
  memberCount: number | null;
  viewRate: number | null;
  medianViews7d: number | null;
}

export const onRequestGet = async (context: {
  request: Request;
  env: PagesEnv;
  params: { username?: string | string[] };
}) => {
  const index = await fetchIndexHtml(context.request, context.env);
  const rawParam = Array.isArray(context.params.username)
    ? context.params.username[0]
    : context.params.username;
  const username = decodeURIComponent(rawParam ?? '')
    .replace(/^@/, '')
    .trim()
    .toLowerCase();

  try {
    const base = apiBase(context.env);
    if (!base || !username) {
      return cachedHtml(index);
    }

    const detailRes = await fetch(
      `${base}/channels/by-username/${encodeURIComponent(username)}/detail`,
      { signal: AbortSignal.timeout(8_000) },
    );
    if (!detailRes.ok) {
      return cachedHtml(index);
    }
    const detail = (await detailRes.json()) as ChannelSeoDetail;
    const tags = buildHeadHtml(detail, username, context.env);
    const bodyBlock = buildBodyHtml(detail, username);

    const rewritten = new HTMLRewriter()
      .on('title', {
        element(element) {
          element.setInnerContent(pageTitle(detail));
        },
      })
      .on('head', {
        element(element) {
          element.append(tags, { html: true });
        },
      })
      .on('body', {
        element(element) {
          element.prepend(bodyBlock, { html: true });
        },
      })
      .transform(index);

    return cachedHtml(rewritten);
  } catch {
    return cachedHtml(index);
  }
};

function pageTitle(detail: ChannelSeoDetail): string {
  return `${detail.title} 텔레그램 채널 · 구독자 ${formatCount(detail.memberCount)}명 - NEWLINK`;
}

function metaDescription(detail: ChannelSeoDetail): string {
  const parts = [
    `구독자 ${formatCount(detail.memberCount)}명`,
    `7일 평균조회 ${formatCount(detail.medianViews7d)}`,
    `카테고리 ${detail.category || '미분류'}`,
  ];
  if (detail.viewRate != null && Number.isFinite(detail.viewRate)) {
    parts.splice(2, 0, `조회율 ${(detail.viewRate * 100).toFixed(1)}%`);
  }
  const desc = (detail.description ?? '').replace(/\s+/g, ' ').trim();
  const summary = `${detail.title} 텔레그램 채널. ${parts.join(', ')}.`;
  return desc ? `${summary} ${desc.slice(0, 140)}` : summary;
}

function canonicalUrl(username: string): string {
  return `${SITE_ORIGIN}/c/${encodeURIComponent(username)}`;
}

function ogImage(detail: ChannelSeoDetail, env: PagesEnv): string {
  const fallback = `${SITE_ORIGIN}/tonconnect-icon.png`;
  const avatar = detail.avatarUrl?.trim();
  if (!avatar) return fallback;
  if (/^https?:\/\//i.test(avatar)) return avatar;
  const origin = apiOrigin(env);
  if (avatar.startsWith('/')) return `${origin}${avatar}`;
  return `${origin}/${avatar}`;
}

function buildHeadHtml(detail: ChannelSeoDetail, username: string, env: PagesEnv): string {
  const title = pageTitle(detail);
  const description = metaDescription(detail);
  const url = canonicalUrl(username);
  const image = ogImage(detail, env);
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: title,
    url,
    description,
    about: {
      '@type': 'Organization',
      name: detail.title,
      url: detail.link || `https://t.me/${username}`,
      image,
    },
  };
  const json = JSON.stringify(jsonLd).replace(/</g, '\\u003c');

  return [
    `<link rel="canonical" href="${attr(url)}">`,
    `<meta name="description" content="${attr(description)}">`,
    `<meta property="og:title" content="${attr(title)}">`,
    `<meta property="og:description" content="${attr(description)}">`,
    `<meta property="og:image" content="${attr(image)}">`,
    `<meta property="og:url" content="${attr(url)}">`,
    `<meta property="og:type" content="profile">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${attr(title)}">`,
    `<meta name="twitter:description" content="${attr(description)}">`,
    `<meta name="twitter:image" content="${attr(image)}">`,
    `<script type="application/ld+json">${json}</script>`,
  ].join('');
}

function buildBodyHtml(detail: ChannelSeoDetail, username: string): string {
  const handle = `@${username}`;
  const intro = text(detail.description || '소개가 없습니다.');
  const summary = [
    `<article id="seo-summary">`,
    `<h1>${text(detail.title)}</h1>`,
    `<p>${text(handle)} · ${text(detail.category || '미분류')}</p>`,
    `<p>${intro}</p>`,
    `<ul>`,
    `<li>구독자 ${text(formatCount(detail.memberCount))}명</li>`,
    `<li>7일 평균조회 ${text(formatCount(detail.medianViews7d))}</li>`,
    `<li>조회율 ${text(formatPercent(detail.viewRate))}</li>`,
    `</ul>`,
    `</article>`,
    `<noscript>`,
    `<h1>${text(detail.title)}</h1>`,
    `<p>${intro}</p>`,
    `<p>구독자 ${text(formatCount(detail.memberCount))}명 · 7일 평균조회 ${text(formatCount(detail.medianViews7d))} · 카테고리 ${text(detail.category || '미분류')}</p>`,
    `</noscript>`,
  ].join('');
  return summary;
}

function formatCount(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '0';
  return Math.round(value).toLocaleString('ko-KR');
}

function formatPercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${(value * 100).toFixed(1)}%`;
}

function attr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function text(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
