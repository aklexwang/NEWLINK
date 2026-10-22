import { load, type CheerioAPI, type Cheerio } from 'cheerio';
import type { Element } from 'domhandler';
import {
  extractTelegramUsernameFromLink,
  isDiscoverableUsername,
} from '../channels/telegram-username';
import { clipPostExcerpt } from '../channels/channel-language.logic';
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
  mentionedUsernames: string[];
  textExcerpt: string | null;
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

export type TelegramAccountKind = 'channel' | 'group' | 'invalid';

export interface ClassifiedTelegramAccount {
  kind: TelegramAccountKind;
  reason: string;
  title: string | null;
}

const PLACEHOLDER_TITLE_RE =
  /^(telegram:\s*contact\s+@|view\s+@|launch\s+@|telegram:\s*join group chat)/i;

/** 텔레그램 기본 문구 제목(Contact/View/Launch/Join Group Chat)인지 */
export function isPlaceholderTitle(title: string | null | undefined): boolean {
  if (!title?.trim()) return false;
  return PLACEHOLDER_TITLE_RE.test(title.trim());
}

export function clipCollectError(raw: string, max = 255): string {
  const text = raw.replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  return text.slice(0, max);
}

export function formatBotCollectError(
  errorCode?: number,
  description?: string,
): string {
  const code = errorCode == null ? '?' : String(errorCode);
  const desc = (description ?? '').replace(/\s+/g, ' ').trim() || 'error';
  return clipCollectError(`bot:${code}:${desc}`);
}

/**
 * t.me/{username} (s 없는 페이지) HTML로 채널/그룹/그 외를 판별합니다.
 */
export function classifyTelegramAccountHtml(
  html: string,
): ClassifiedTelegramAccount {
  if (isMissingChannelHtml(html)) {
    return { kind: 'invalid', reason: 'page:not_found', title: null };
  }

  const $ = load(html);
  const title = textOrNull($('.tgme_page_title').first());
  const extra = (textOrNull($('.tgme_page_extra').first()) ?? '').toLowerCase();
  const action = ($('.tgme_action_button').first().text() || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  if (/\bsubscribers?\b/.test(extra)) {
    return { kind: 'channel', reason: 'page:subscribers', title };
  }
  if (/\bmembers?\b/.test(extra) || /\bonline\b/.test(extra)) {
    return { kind: 'group', reason: 'page:members', title };
  }
  if (action.includes('start')) {
    return { kind: 'invalid', reason: 'page:bot', title };
  }
  if (action.includes('send message')) {
    return { kind: 'invalid', reason: 'page:user', title };
  }
  return { kind: 'invalid', reason: 'page:unknown', title };
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
    const selfUsername = dataPost.split('/')[0]?.replace(/^@/, '').trim() || null;
    const mentionedUsernames = extractTmeUsernamesFromHtml(
      node.html() ?? '',
      selfUsername,
    );
    const rawText =
      node.find('.tgme_widget_message_text').first().text() ||
      node.find('.tgme_widget_message_caption').first().text() ||
      '';

    posts.push({
      messageId,
      postedAt,
      views,
      mediaType: detectMediaType(node),
      forwardedFrom,
      isEdited: node.find('.tgme_widget_message_edited').length > 0,
      mentionedUsernames,
      textExcerpt: clipPostExcerpt(rawText),
    });
  });
  return posts;
}

const TME_URL_RE =
  /(?:https?:\/\/)?(?:t\.me|telegram\.me|telegram\.dog)\/[^\s"'<>]+/gi;

/**
 * 게시글 HTML에서 t.me 공개 채널 아이디를 뽑습니다.
 * 초대 링크, t.me/s, 봇, 자기 자신은 제외합니다. 글 링크(t.me/id/숫자)는 아이디만 남깁니다.
 */
export function extractTmeUsernamesFromHtml(
  html: string,
  selfUsername?: string | null,
): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  const add = (raw: string) => {
    const username = extractTelegramUsernameFromLink(raw);
    if (!isDiscoverableUsername(username, selfUsername)) return;
    if (seen.has(username)) return;
    seen.add(username);
    found.push(username);
  };

  if (!html.trim()) return found;

  const $ = load(html);
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (href) add(href);
  });

  TME_URL_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TME_URL_RE.exec(html))) {
    add(match[0]);
  }

  return found;
}

export function joinMentionedUsernames(names: string[]): string | null {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const name of names) {
    const u = name.replace(/^@/, '').toLowerCase().trim();
    if (!u || seen.has(u)) continue;
    seen.add(u);
    unique.push(u);
  }
  return unique.length > 0 ? unique.join(',') : null;
}

export function splitMentionedUsernames(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[,;\s]+/)
    .map((part) => part.replace(/^@/, '').toLowerCase().trim())
    .filter(Boolean);
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
