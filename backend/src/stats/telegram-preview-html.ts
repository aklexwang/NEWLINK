import { load, type CheerioAPI, type Cheerio } from 'cheerio';
import type { Element } from 'domhandler';
import {
  extractTelegramUsernameFromLink,
  isDiscoverableUsername,
} from '../channels/telegram-username';
import { clipPostExcerpt } from '../channels/channel-language.logic';
import type { ChannelPostMediaType } from './channel-post.entity';
import { abbreviatedCountTolerance } from './member-count.logic';

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
  /** 글 속 비공개 초대 링크 해시 ("+AbC..." 형태, 대소문자 그대로) */
  inviteHashes?: string[];
  textExcerpt: string | null;
}

export interface ParsedTelegramPreview {
  title: string | null;
  memberCount: number | null;
  /**
   * memberCount 의 반올림 오차. t.me/s 미리보기는 "40.8K" 처럼 축약해서 보여 주므로
   * 정확한 값이 아니다. 정확한 숫자면 0.
   */
  memberCountTolerance: number;
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

/** tgme_page_extra 의 subscribers → 채널, members → 그룹 */
export function kindFromTelegramPageExtra(
  extra: string | null | undefined,
): 'channel' | 'group' | null {
  const text = (extra ?? '').replace(/\s+/g, ' ').toLowerCase();
  if (/\bsubscribers?\b/.test(text)) return 'channel';
  if (/\bmembers?\b/.test(text) || /\bonline\b/.test(text)) return 'group';
  return null;
}

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
  const extra = textOrNull($('.tgme_page_extra').first());
  const action = ($('.tgme_action_button').first().text() || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  const fromExtra = kindFromTelegramPageExtra(extra);
  if (fromExtra === 'channel') {
    return { kind: 'channel', reason: 'page:subscribers', title };
  }
  if (fromExtra === 'group') {
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
  const memberText = extractMemberCountText($);
  const memberCount = parseCount(memberText);
  const memberCountTolerance = abbreviatedCountTolerance(memberText);
  const posts = parsePosts($);
  const usernameFromPosts =
    posts.length > 0 ? extractUsernameFromDataPost($) : null;
  const hasPreview =
    $('.tgme_channel_info').length > 0 ||
    $('.tgme_widget_message[data-post]').length > 0;

  return {
    title,
    memberCount,
    memberCountTolerance: memberCount == null ? 0 : memberCountTolerance,
    usernameFromPosts,
    posts,
    hasPreview,
  };
}

/**
 * 소개글처럼 줄바꿈이 뜻을 갖는 글을 정리한다. 줄 안의 공백은 하나로 줄이되
 * 줄바꿈은 남기고, 연속된 빈 줄은 한 줄로 합친다.
 */
export function normalizeMultilineText(
  raw: string | null | undefined,
): string | null {
  const text = (raw ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[^\S\n]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text || null;
}

/** <br> 을 줄바꿈으로 바꿔 읽는다. 원본에 실제 줄바꿈이 있어도 그대로 살린다. */
function multilineTextOrNull(node: Cheerio<Element>): string | null {
  const copy = node.clone();
  copy.find('br').replaceWith('\n');
  return normalizeMultilineText(copy.text());
}

function textOrNull(node: Cheerio<Element>): string | null {
  const text = node.text().replace(/\s+/g, ' ').trim();
  return text || null;
}

/** 미리보기 상단의 구독자·회원 수 표시 글자("40.8K" 같은 축약일 수 있다) */
function extractMemberCountText($: CheerioAPI): string | null {
  let found: string | null = null;
  $('.tgme_channel_info_counter').each((_, el) => {
    if (found != null) return;
    const type = $(el).find('.counter_type').text().trim().toLowerCase();
    if (!type.includes('subscriber') && !type.includes('member')) return;
    const text = $(el).find('.counter_value').first().text().trim();
    if (parseCount(text) != null) found = text;
  });
  return found;
}

/**
 * t.me/<username> 공개 페이지의 정확한 회원 수. 이 페이지는 "9 243 803 subscribers"
 * 처럼 축약 없는 숫자를 준다. 읽지 못하면 null.
 */
export function parseExactMemberCountFromPage(html: string): number | null {
  const $ = load(html);
  const extra = textOrNull($('.tgme_page_extra').first());
  return parseTelegramExtraMemberCount(extra);
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
    const selfUsername =
      dataPost.split('/')[0]?.replace(/^@/, '').trim() || null;
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
      inviteHashes: extractTmeInvitesFromText(node.html() ?? ''),
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

export function splitMentionedUsernames(
  raw: string | null | undefined,
): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[,;\s]+/)
    .map((part) => part.replace(/^@/, '').toLowerCase().trim())
    .filter(Boolean);
}

export function isTelegramOrgUrl(url: string | null | undefined): boolean {
  if (!url?.trim()) return false;
  try {
    const host = new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
    return host === 'telegram.org' || host.endsWith('.telegram.org');
  } catch {
    return false;
  }
}

export interface ParsedInvitePreview {
  expired: boolean;
  title: string | null;
  memberCount: number | null;
  description: string | null;
  avatarUrl: string | null;
  kind: 'channel' | 'group' | null;
}

export function parseTelegramExtraMemberCount(
  extra: string | null | undefined,
): number | null {
  if (!extra) return null;
  const match = extra.match(
    /([\d][\d\s,.]*[KMB]?)\s*(members?|subscribers?)\b/i,
  );
  return parseCount(match?.[1] ?? null);
}

function parseInviteMemberCount(extra: string | null): number | null {
  return parseTelegramExtraMemberCount(extra);
}

export type ParsedPublicUsernamePage = {
  kind: TelegramAccountKind;
  reason: string;
  title: string | null;
  description: string | null;
  memberCount: number | null;
  avatarUrl: string | null;
};

/** t.me/{username} 공개 페이지. 채널/그룹 구분·제목·소개·인원 */
export function parsePublicUsernamePage(
  html: string,
): ParsedPublicUsernamePage {
  const classified = classifyTelegramAccountHtml(html);
  const $ = load(html);
  const title =
    classified.title ||
    textOrNull($('.tgme_page_title').first()) ||
    $('meta[property="og:title"]').attr('content')?.trim() ||
    null;
  const description =
    multilineTextOrNull($('.tgme_page_description').first()) ||
    normalizeMultilineText(
      $('meta[property="og:description"]').attr('content'),
    ) ||
    null;
  const extra = textOrNull($('.tgme_page_extra').first());
  const memberCount = parseTelegramExtraMemberCount(extra);
  const rawAvatar =
    $('meta[property="og:image"]').attr('content')?.trim() ||
    $('.tgme_page_photo img').first().attr('src')?.trim() ||
    null;
  const avatarUrl = isGenericTelegramLogo(rawAvatar) ? null : rawAvatar;
  return {
    kind: classified.kind,
    reason: classified.reason,
    title,
    description,
    memberCount,
    avatarUrl,
  };
}

function isGenericTelegramLogo(url: string | null | undefined): boolean {
  if (!url) return true;
  return /t_logo|telegram_logo|\/img\/telegram/i.test(url);
}

function isInvitePreviewExpired(input: {
  html: string;
  title: string | null;
  extra: string | null;
  memberCount: number | null;
}): boolean {
  if (isMissingChannelHtml(input.html)) return true;
  if (isPlaceholderTitle(input.title)) return true;
  const title = (input.title ?? '').trim().toLowerCase();
  if (!title) return true;
  if (title === 'telegram' || title === 'telegram messenger') return true;
  if (/join group chat/i.test(title) && input.memberCount == null) return true;
  if (
    /you can no longer (join|access)/i.test(input.html) ||
    /this invite link is (invalid|expired)/i.test(input.html) ||
    /invite link has expired/i.test(input.html)
  ) {
    return true;
  }
  return false;
}

/** t.me/+ · joinchat 공개 미리보기만 읽습니다. 로그인·가입은 하지 않습니다. */
export function parseInviteLinkHtml(
  html: string,
  finalUrl?: string | null,
): ParsedInvitePreview {
  if (isTelegramOrgUrl(finalUrl)) {
    return {
      expired: true,
      title: null,
      memberCount: null,
      description: null,
      avatarUrl: null,
      kind: null,
    };
  }

  const $ = load(html);
  const title =
    textOrNull($('.tgme_page_title').first()) ||
    $('meta[property="og:title"]').attr('content')?.trim() ||
    null;
  const extra = textOrNull($('.tgme_page_extra').first());
  const description =
    multilineTextOrNull($('.tgme_page_description').first()) ||
    normalizeMultilineText(
      $('meta[property="og:description"]').attr('content'),
    ) ||
    null;
  const rawAvatar =
    $('meta[property="og:image"]').attr('content')?.trim() ||
    $('.tgme_page_photo img').first().attr('src')?.trim() ||
    null;
  const avatarUrl = isGenericTelegramLogo(rawAvatar) ? null : rawAvatar;
  const memberCount = parseInviteMemberCount(extra);
  const expired = isInvitePreviewExpired({ html, title, extra, memberCount });
  const kind = kindFromTelegramPageExtra(extra);

  return {
    expired,
    title: expired ? title : title,
    memberCount: expired ? null : memberCount,
    description: expired ? null : description,
    avatarUrl: expired ? null : avatarUrl,
    kind: expired ? null : kind,
  };
}

function detectMediaType(node: Cheerio<Element>): ChannelPostMediaType {
  // "○○ pinned …", "Channel photo updated" 같은 채널 알림
  if (node.hasClass('service_message') || node.find('.tgme_widget_message_service').length > 0) {
    return 'service';
  }
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

const TME_INVITE_RE =
  /(?:https?:\/\/)?(?:t\.me|telegram\.me|telegram\.dog)\/(?:\+|joinchat\/)([A-Za-z0-9_-]{10,40})/gi;

/**
 * 글·소개글 속 비공개 초대 링크(t.me/+해시, joinchat/해시)를 "+해시" 로 모은다.
 * 해시는 대소문자가 다르면 다른 링크라서 그대로 둔다.
 */
export function extractTmeInvitesFromText(
  text: string | null | undefined,
): string[] {
  if (!text) return [];
  const found: string[] = [];
  const seen = new Set<string>();
  TME_INVITE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TME_INVITE_RE.exec(text))) {
    const token = `+${match[1]}`;
    if (seen.has(token)) continue;
    seen.add(token);
    found.push(token);
  }
  return found;
}
