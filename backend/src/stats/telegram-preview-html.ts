import { load, type CheerioAPI, type Cheerio } from 'cheerio';
import type { Element } from 'domhandler';
import type { ChannelPostMediaType } from './channel-post.entity';

export const TELEGRAM_FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept-Language': 'ko,en;q=0.9',
} as const;

export interface ParsedPreviewPost {
  messageId: number;
  postedAt: Date;
  views: number | null;
  mediaType: ChannelPostMediaType;
  forwardedFrom: string | null;
  isEdited: boolean;
}

export interface ParsedTelegramPreview {
  title: string | null;
  memberCount: number | null;
  usernameFromPosts: string | null;
  posts: ParsedPreviewPost[];
  hasPreview: boolean;
}

/** "1.2K", "3.4M", "1,234" 형태의 조회수·구독자 수를 정수로 바꿉니다. */
export function parseCount(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim().replace(/,/g, '').replace(/\s/g, '');
  if (!trimmed) return null;

  const match = trimmed.match(/^([\d.]+)\s*([KMBkmb])?$/);
  if (!match) {
    const digits = trimmed.replace(/[^\d]/g, '');
    if (!digits) return null;
    const n = Number(digits);
    return Number.isFinite(n) ? n : null;
  }

  let n = Number(match[1]);
  if (!Number.isFinite(n)) return null;
  const suffix = (match[2] ?? '').toUpperCase();
  if (suffix === 'K') n *= 1_000;
  else if (suffix === 'M') n *= 1_000_000;
  else if (suffix === 'B') n *= 1_000_000_000;
  return Math.round(n);
}

export function isMissingChannelHtml(html: string): boolean {
  return /doesn(?:'|’|&apos;)?t seem to exist/i.test(html);
}

export function isPrivateChannelHtml(html: string): boolean {
  return /this (?:channel|group) is private/i.test(html);
}

export function parseTelegramChannelHtml(html: string): ParsedTelegramPreview {
  const $ = load(html);
  const title = textOrNull($('.tgme_channel_info_header_title').first());
  const memberCount = extractMemberCount($);
  const posts = parsePosts($);
  const usernameFromPosts =
    posts.length > 0 ? extractUsernameFromDataPost($) : null;
  const hasPreview =
    $('.tgme_channel_info').length > 0 ||
    $('.tgme_widget_message[data-post]').length > 0;

  return { title, memberCount, usernameFromPosts, posts, hasPreview };
}

function textOrNull(node: Cheerio<Element>): string | null {
  const text = node.text().replace(/\s+/g, ' ').trim();
  return text || null;
}

function extractMemberCount($: CheerioAPI): number | null {
  let found: number | null = null;
  $('.tgme_channel_info_counter').each((_, el) => {
    if (found != null) return;
    const type = $(el).find('.counter_type').text().trim().toLowerCase();
    if (!type.includes('subscriber') && !type.includes('member')) return;
    found = parseCount($(el).find('.counter_value').first().text());
  });
  return found;
}

function extractUsernameFromDataPost($: CheerioAPI): string | null {
  const dataPost =
    $('.tgme_widget_message[data-post]').first().attr('data-post') ?? '';
  const name = dataPost.split('/')[0]?.replace(/^@/, '').trim();
  return name || null;
}

function parsePosts($: CheerioAPI): ParsedPreviewPost[] {
  const posts: ParsedPreviewPost[] = [];
  $('.tgme_widget_message[data-post]').each((_, el) => {
    const node = $(el);
    const dataPost = node.attr('data-post') ?? '';
    const idPart = dataPost.split('/')[1];
    const messageId = Number(idPart);
    if (!Number.isFinite(messageId) || messageId <= 0) return;

    const datetime = node.find('time[datetime]').first().attr('datetime');
    if (!datetime) return;
    const postedAt = new Date(datetime);
    if (Number.isNaN(postedAt.getTime())) return;

    const views = parseCount(
      node.find('.tgme_widget_message_views').first().text(),
    );
    const forwardedHref =
      node
        .find('.tgme_widget_message_forwarded_from_name')
        .first()
        .attr('href') ?? null;
    const forwardedFrom = forwardedHref?.trim() || null;

    posts.push({
      messageId,
      postedAt,
      views,
      mediaType: detectMediaType(node),
      forwardedFrom,
      isEdited: node.find('.tgme_widget_message_edited').length > 0,
    });
  });
  return posts;
}

function detectMediaType(node: Cheerio<Element>): ChannelPostMediaType {
  if (
    node.find(
      '.tgme_widget_message_video, .tgme_widget_message_video_wrap, .tgme_widget_message_video_player, .tgme_widget_message_roundvideo, .tgme_widget_message_roundvideo_wrap, video',
    ).length > 0
  ) {
    return 'video';
  }
  if (
    node.find('.tgme_widget_message_photo, .tgme_widget_message_photo_wrap')
      .length > 0
  ) {
    return 'photo';
  }
  if (
    node.find(
      '.tgme_widget_message_document, .tgme_widget_message_document_wrap',
    ).length > 0
  ) {
    return 'file';
  }
  if (
    node.find(
      '.tgme_widget_message_sticker, .tgme_widget_message_poll, .tgme_widget_message_location, .tgme_widget_message_voice',
    ).length > 0
  ) {
    return 'other';
  }
  return 'text';
}
