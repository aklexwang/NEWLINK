import { load } from 'cheerio';

/** 텔레그램 게시글 1개를 우리 화면에 그릴 정보 (텔레그램 상자를 쓰지 않고 직접 그리기용) */
export type PostEmbedPreview = {
  text: string;
  images: string[];
  hasVideo: boolean;
  views: number | null;
  postedAt: string | null;
};

/** 텔레그램 이미지 서버 주소만 허용 (다른 주소를 그대로 넘기지 않게) */
export function isTelegramImageUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    return /(^|\.)telesco\.pe$|(^|\.)cdn-telegram\.org$|(^|\.)telegram-cdn\.org$/i.test(
      u.hostname,
    );
  } catch {
    return false;
  }
}

function bgUrl(style: string | undefined): string | null {
  const m = (style ?? '').match(
    /background-image:\s*url\(['"]?([^'")]+)['"]?\)/i,
  );
  return m ? m[1] : null;
}

function parseViews(raw: string): number | null {
  const v = raw.trim().replace(/,/g, '');
  if (!v) return null;
  const m = v.match(/^([\d.]+)\s*([KkMm])?$/);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  const mul = m[2] ? (m[2].toLowerCase() === 'k' ? 1_000 : 1_000_000) : 1;
  return Math.round(n * mul);
}

/** https://t.me/<채널>/<글번호>?embed=1 HTML → 그릴 정보 */
export function parsePostEmbedHtml(html: string): PostEmbedPreview | null {
  const $ = load(html);
  const msg = $('.tgme_widget_message').first();
  if (!msg.length) return null;

  const textNode = msg.find('.tgme_widget_message_text').first();
  // <br> 은 줄바꿈으로
  textNode.find('br').replaceWith('\n');
  const text = textNode
    .text()
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 1500);

  const images: string[] = [];
  msg
    .find(
      '.tgme_widget_message_photo_wrap, .tgme_widget_message_video_thumb, .link_preview_image, .tgme_widget_message_link_preview .link_preview_right_image',
    )
    .each((_, el) => {
      const url = bgUrl($(el).attr('style'));
      if (url && isTelegramImageUrl(url) && !images.includes(url))
        images.push(url);
    });

  const views = parseViews(
    msg.find('.tgme_widget_message_views').first().text(),
  );
  const postedAt = msg.find('time[datetime]').first().attr('datetime') ?? null;
  const hasVideo =
    msg.find(
      '.tgme_widget_message_video_player, .tgme_widget_message_video, .tgme_widget_message_roundvideo',
    ).length > 0;

  if (!text && images.length === 0) return null;
  return { text, images: images.slice(0, 4), hasVideo, views, postedAt };
}
