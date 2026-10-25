import { AUTO_EXPOSE_MIN_MEMBERS } from '../channels/auto-expose.logic';
import {
  detectChannelLanguage,
  type ChannelLanguage,
} from '../channels/channel-language.logic';
import type { AutoExposeKind } from '../channels/auto-expose.logic';
import type { DiscoveredUsernameResult } from './discovered-username.entity';
import type { ParsedPreviewPost } from './telegram-preview-html';
import { LANGUAGE_POST_LIMIT } from '../channels/channel-language.logic';
import {
  extractTelegramUsernameFromLink,
  isDiscoverableUsername,
  isInviteOnlyLink,
  RESERVED_TELEGRAM_PATHS,
} from '../channels/telegram-username';
import { load } from 'cheerio';

export const PUBLIC_INSPECT_GAP_MS = 1_000;
export const PUBLIC_EXPAND_MAX_PAGES = 5;
export const BULK_AUTO_MIN_NEW_CANDIDATES = 20;
export const BULK_PROGRESS_EVERY = 100;

export type PublicInspectPage = {
  kind: AutoExposeKind;
  title: string | null;
  description: string | null;
  memberCount: number | null;
  avatarUrl: string | null;
  excerpts?: Array<string | null | undefined>;
};

export type PublicInspectResult =
  | DiscoveredUsernameResult
  | 'ok'
  /** 한국어인지 외국어인지 확인하지 못함. 경고만 하고 등록은 허용한다 */
  | 'language_unknown';

export type PublicInspectDecision = {
  result: PublicInspectResult;
  language: ChannelLanguage;
  linkType: 'channel' | 'group';
  kind: AutoExposeKind;
};

/**
 * 자동 발견·PC 대량 도구용. 사람이 확인하지 않으므로 언어 미확인은 예전처럼 한국어 아님으로 본다.
 */
export function toDiscoveryResult(
  result: PublicInspectResult,
): DiscoveredUsernameResult | 'ok' {
  return result === 'language_unknown' ? 'not_korean' : result;
}

export function publicInspectDecision(
  page: PublicInspectPage,
): PublicInspectDecision {
  const kind: AutoExposeKind =
    page.kind === 'channel' || page.kind === 'group' || page.kind === 'invalid'
      ? page.kind
      : 'unknown';
  const linkType = kind === 'group' ? 'group' : 'channel';
  const excerpts =
    kind === 'channel'
      ? (page.excerpts ?? []).filter(Boolean).slice(0, LANGUAGE_POST_LIMIT)
      : [];
  const language = detectChannelLanguage({
    title: page.title,
    description: page.description,
    excerpts,
  });
  if (kind === 'invalid' || kind === 'unknown') {
    return { result: 'not_found', language, linkType, kind };
  }
  // 외국어로 확인된 경우만 탈락. 확인 못 한 것(unknown)은 따로 구분한다
  if (language === 'foreign') {
    return { result: 'not_korean', language, linkType, kind };
  }
  if (
    page.memberCount == null ||
    page.memberCount < AUTO_EXPOSE_MIN_MEMBERS
  ) {
    return { result: 'too_small', language, linkType, kind };
  }
  if (language !== 'ko') {
    return { result: 'language_unknown', language, linkType, kind };
  }
  return { result: 'ok', language, linkType, kind };
}

export function excerptsFromPreviewPosts(
  posts: ParsedPreviewPost[] | undefined,
): string[] {
  return (posts ?? [])
    .map((post) => post.textExcerpt)
    .filter((text): text is string => Boolean(text))
    .slice(0, LANGUAGE_POST_LIMIT);
}

export function bulkDeadlineMs(
  startedAtMs: number,
  maxHours?: number | null,
): number | null {
  if (maxHours == null || maxHours <= 0) return null;
  return startedAtMs + maxHours * 60 * 60 * 1000;
}

export function isBulkDeadlinePassed(
  deadlineMs: number | null | undefined,
  nowMs = Date.now(),
): boolean {
  if (deadlineMs == null) return false;
  return nowMs >= deadlineMs;
}

export function shouldStopBulkAuto(input: {
  newCandidatesThisRound: number;
  minNew?: number;
  startedAtMs: number;
  maxHours?: number | null;
  nowMs?: number;
}): boolean {
  const minNew = input.minNew ?? BULK_AUTO_MIN_NEW_CANDIDATES;
  if (input.newCandidatesThisRound < minNew) return true;
  return isBulkDeadlinePassed(
    bulkDeadlineMs(input.startedAtMs, input.maxHours),
    input.nowMs ?? Date.now(),
  );
}

export function isBulkProgressTick(checked: number): boolean {
  return checked > 0 && checked % BULK_PROGRESS_EVERY === 0;
}

export function parseUsernameListText(raw: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const name = trimmed
      .replace(/^https?:\/\/(t\.me|telegram\.me)\//i, '')
      .replace(/^t\.me\//i, '')
      .replace(/^@/, '')
      .split(/[/?#]/)[0]
      ?.trim()
      .toLowerCase();
    if (!name || name === 's' || name === 'joinchat' || name.startsWith('+')) {
      continue;
    }
    if (!/^[a-z][a-z0-9_]{3,31}$/i.test(name)) continue;
    if (seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

export type BulkMode = 'verify' | 'expand' | 'auto';

export function parseBulkCandidatesArgs(argv: string[]): {
  mode: BulkMode;
  dryRun: boolean;
  limit: number | null;
  maxHours: number | null;
  file: string | null;
} {
  const rest = argv.filter((arg) => arg !== '--');
  let mode: BulkMode = 'verify';
  if (rest.includes('expand')) mode = 'expand';
  else if (rest.includes('auto')) mode = 'auto';
  else if (rest.includes('verify')) mode = 'verify';

  const dryRun = rest.includes('--dry-run');
  let limit: number | null = null;
  let maxHours: number | null = null;
  let file: string | null = null;
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (arg === '--limit') {
      const n = Number(rest[i + 1]);
      if (Number.isFinite(n) && n > 0) limit = Math.floor(n);
    }
    if (arg.startsWith('--limit=')) {
      const n = Number(arg.slice('--limit='.length));
      if (Number.isFinite(n) && n > 0) limit = Math.floor(n);
    }
    if (arg === '--max-hours') {
      const n = Number(rest[i + 1]);
      if (Number.isFinite(n) && n > 0) maxHours = n;
    }
    if (arg.startsWith('--max-hours=')) {
      const n = Number(arg.slice('--max-hours='.length));
      if (Number.isFinite(n) && n > 0) maxHours = n;
    }
    if (arg === '--file') {
      file = rest[i + 1] ?? null;
    }
    if (arg.startsWith('--file=')) {
      file = arg.slice('--file='.length) || null;
    }
  }
  return { mode, dryRun, limit, maxHours, file };
}

const TME_HREF_RE =
  /(?:https?:\/\/)?(?:t\.me|telegram\.me|telegram\.dog)\/[^\s"'<>]+/gi;

export type TmeHrefClass =
  | { kind: 'username'; username: string }
  | { kind: 'invalid_format'; path: string }
  | { kind: 'skip' };

/** t.me 링크가 공개 아이디인지, 형식이 틀린지, 초대·예약어라 건너뛸지 */
export function classifyTmeHref(
  raw: string,
  selfUsername?: string | null,
): TmeHrefClass {
  const extracted = extractTelegramUsernameFromLink(raw);
  if (extracted) {
    if (!isDiscoverableUsername(extracted, selfUsername)) return { kind: 'skip' };
    return { kind: 'username', username: extracted };
  }
  if (isInviteOnlyLink(raw)) return { kind: 'skip' };

  let href = raw.trim();
  if (!href) return { kind: 'skip' };
  if (!/^https?:\/\//i.test(href)) {
    if (/^(?:t\.me|telegram\.me|telegram\.dog)\//i.test(href)) {
      href = `https://${href}`;
    } else {
      return { kind: 'skip' };
    }
  }
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return { kind: 'skip' };
  }
  const host = url.hostname.replace(/^www\./i, '').toLowerCase();
  if (!['t.me', 'telegram.me', 'telegram.dog'].includes(host)) {
    return { kind: 'skip' };
  }
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length === 0) return { kind: 'skip' };
  let candidate = parts[0];
  if (candidate.toLowerCase() === 's' && parts[1]) candidate = parts[1];
  candidate = candidate.replace(/^@/, '');
  if (!candidate || candidate.startsWith('+')) return { kind: 'skip' };
  if (RESERVED_TELEGRAM_PATHS.has(candidate.toLowerCase())) {
    return { kind: 'skip' };
  }
  if (!/^[a-zA-Z][a-zA-Z0-9_]{3,31}$/.test(candidate)) {
    return { kind: 'invalid_format', path: candidate.toLowerCase() };
  }
  return { kind: 'skip' };
}

export function mentionsFromTelegramHtml(
  html: string,
  selfUsername?: string | null,
): { usernames: string[]; invalidFormat: string[] } {
  const usernames: string[] = [];
  const invalidFormat: string[] = [];
  const seenUser = new Set<string>();
  const seenInvalid = new Set<string>();
  const add = (raw: string) => {
    const classified = classifyTmeHref(raw, selfUsername);
    if (classified.kind === 'username') {
      if (seenUser.has(classified.username)) return;
      seenUser.add(classified.username);
      usernames.push(classified.username);
      return;
    }
    if (classified.kind === 'invalid_format') {
      if (seenInvalid.has(classified.path)) return;
      seenInvalid.add(classified.path);
      invalidFormat.push(classified.path);
    }
  };
  if (!html.trim()) return { usernames, invalidFormat };
  const $ = load(html);
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (href) add(href);
  });
  TME_HREF_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TME_HREF_RE.exec(html))) {
    add(match[0]);
  }
  return { usernames, invalidFormat };
}
