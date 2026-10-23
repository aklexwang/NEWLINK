import { AUTO_EXPOSE_MIN_MEMBERS } from '../channels/auto-expose.logic';
import { detectChannelLanguage } from '../channels/channel-language.logic';
import { LinkType } from '../channels/channel.entity';
import type { AutoExposeKind } from '../channels/auto-expose.logic';
import type { ChannelLanguage } from '../channels/channel.entity';
import type { DiscoveredUsernameResult } from './discovered-username.entity';
import type { ParsedPreviewPost } from './telegram-preview-html';
import { LANGUAGE_POST_LIMIT } from '../channels/channel-language.logic';

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

export type PublicInspectDecision = {
  result: DiscoveredUsernameResult | 'ok';
  language: ChannelLanguage;
  linkType: LinkType;
  kind: AutoExposeKind;
};

export function publicInspectDecision(
  page: PublicInspectPage,
): PublicInspectDecision {
  const kind: AutoExposeKind =
    page.kind === 'channel' || page.kind === 'group' || page.kind === 'invalid'
      ? page.kind
      : 'unknown';
  const linkType = kind === 'group' ? LinkType.GROUP : LinkType.CHANNEL;
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
  if (language !== 'ko') {
    return { result: 'not_korean', language, linkType, kind };
  }
  if (
    page.memberCount == null ||
    page.memberCount < AUTO_EXPOSE_MIN_MEMBERS
  ) {
    return { result: 'too_small', language, linkType, kind };
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

export function shouldStopBulkAuto(input: {
  newCandidatesThisRound: number;
  minNew?: number;
  startedAtMs: number;
  maxHours?: number | null;
  nowMs?: number;
}): boolean {
  const minNew = input.minNew ?? BULK_AUTO_MIN_NEW_CANDIDATES;
  if (input.newCandidatesThisRound < minNew) return true;
  const hours = input.maxHours;
  if (hours == null || hours <= 0) return false;
  const now = input.nowMs ?? Date.now();
  return now - input.startedAtMs >= hours * 60 * 60 * 1000;
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
