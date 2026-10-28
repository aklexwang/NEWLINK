import {
  extractTelegramUsernameFromLink,
  isDiscoverableUsername,
} from '../channels/telegram-username';
import { splitMentionedUsernames } from './telegram-preview-html';

export const DISCOVERY_MIN_DISTINCT_CHANNELS = 2;
export const DISCOVERY_MIN_MEMBERS = 100;
/** MTProto 로 확인한 인원이 이 이상이면 1개 채널 언급으로도 통과 */
export const DISCOVERY_SINGLE_MENTION_MIN_MEMBERS = 1_000;
export const DISCOVERY_MAX_PER_DAY = 1000;
/** 기타·키워드 queued 검사 하루 한도 (눈덩이 1000과 별도) */
export const DISCOVERY_QUEUED_MAX_PER_DAY_DEFAULT = 300;
export const DISCOVERY_QUEUED_MIN_BUDGET_MS = 5 * 60 * 1000;
/** 서버 눈덩이(키워드 대기열 검사 포함). PC 대량 도구는 source 를 안 넣음 */
export const DISCOVERY_SOURCE_SNOWBALL = 'snowball';
export const DISCOVERY_SOURCE_KEYWORD = 'keyword';
export const DISCOVERY_SOURCE_OTHER = 'other';
/** 공개 채널의 연결 대화방(MTProto linkedChatId)에서 찾은 공개 그룹 */
export const DISCOVERY_SOURCE_LINKED = 'linked';
export const DISCOVERY_DELAY_MS = 1000;
export const DISCOVERY_LOOKBACK_DAYS = 7;
export const DISCOVERY_RECHECK_DAYS = 30;

export type MentionRow = {
  sourceChannelId: string;
  sourceUsername: string | null;
  forwardedFrom: string | null;
  mentionedUsernames: string | null;
};

export type MentionAggregate = {
  username: string;
  sourceChannelIds: string[];
  mentionCount: number;
};

export type DiscoveryQueueSource = 'mention' | 'keyword' | 'other';

export type QueuedDiscoveryRow = {
  username: string;
  source?: string | null;
};

export function parseQueuedDailyMax(raw?: string | null): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return DISCOVERY_QUEUED_MAX_PER_DAY_DEFAULT;
  return Math.floor(n);
}

/** 15분 예산을 나눌 때 queued 검사에 최소 5분을 남긴다. */
export function splitDiscoveryDeadlines(
  deadlineMs: number | undefined,
  nowMs = Date.now(),
  queuedMinMs = DISCOVERY_QUEUED_MIN_BUDGET_MS,
): { mentionDeadlineMs?: number; queuedDeadlineMs?: number } {
  if (deadlineMs == null) return {};
  const remaining = Math.max(0, deadlineMs - nowMs);
  const reserved = Math.min(queuedMinMs, remaining);
  return {
    mentionDeadlineMs: deadlineMs - reserved,
    queuedDeadlineMs: deadlineMs,
  };
}

export function persistDiscoverySource(
  itemSource: string | null | undefined,
): string {
  if (itemSource === 'mention' || itemSource === DISCOVERY_SOURCE_SNOWBALL) {
    return DISCOVERY_SOURCE_SNOWBALL;
  }
  if (itemSource === DISCOVERY_SOURCE_KEYWORD) return DISCOVERY_SOURCE_KEYWORD;
  if (itemSource === DISCOVERY_SOURCE_LINKED) return DISCOVERY_SOURCE_LINKED;
  return DISCOVERY_SOURCE_OTHER;
}

export type DiscoveryQueueItem = MentionAggregate & {
  source: DiscoveryQueueSource;
};

/** 눈덩이는 채널 글 속 링크만 씁니다. 그룹 대화는 쓰지 않습니다. */
export function isDiscoverySourceChannel(
  linkType: string | null | undefined,
): boolean {
  return linkType === 'channel';
}

/** 한 게시글의 전달·본문 언급 아이디 (자기 자신·봇 제외) */
export function usernamesFromPost(row: MentionRow): string[] {
  const names = splitMentionedUsernames(row.mentionedUsernames);
  const forwarded = extractTelegramUsernameFromLink(row.forwardedFrom);
  if (forwarded) names.push(forwarded);

  const unique: string[] = [];
  const seen = new Set<string>();
  for (const name of names) {
    if (!isDiscoverableUsername(name, row.sourceUsername)) continue;
    if (seen.has(name)) continue;
    seen.add(name);
    unique.push(name);
  }
  return unique;
}

/**
 * 아이디별 「서로 다른 소스 채널」 수를 셉니다.
 * 한 채널이 같은 아이디를 여러 번 언급해도 1로 칩니다.
 */
export function aggregateMentionedUsernames(
  rows: MentionRow[],
): MentionAggregate[] {
  const byUsername = new Map<string, Set<string>>();
  for (const row of rows) {
    for (const username of usernamesFromPost(row)) {
      let set = byUsername.get(username);
      if (!set) {
        set = new Set();
        byUsername.set(username, set);
      }
      set.add(row.sourceChannelId);
    }
  }

  return [...byUsername.entries()]
    .map(([username, ids]) => ({
      username,
      sourceChannelIds: [...ids],
      mentionCount: ids.size,
    }))
    .filter((item) => item.mentionCount >= 1)
    .sort(
      (a, b) =>
        b.mentionCount - a.mentionCount || a.username.localeCompare(b.username),
    );
}

/** 공개 페이지 확인이라 1곳 언급도 큐에 넣습니다. */
export function shouldQueueSnowballCandidate(mentionCount: number): boolean {
  return mentionCount >= 1;
}

/** 등록 전 눈덩이 인원 규칙. 공개 페이지 인원 100명 이상. */
export function passesSnowballDiscovery(input: {
  mentionCount: number;
  memberCount: number | null;
}): boolean {
  if (input.memberCount == null || input.memberCount < DISCOVERY_MIN_MEMBERS) {
    return false;
  }
  return input.mentionCount >= 1;
}

/** 언급 후보를 앞에, 키워드 대기열은 뒤에. 같은 username 은 한 번만. */
export function mergeDiscoveryQueue(
  mentions: MentionAggregate[],
  queuedRows: QueuedDiscoveryRow[],
  known: Set<string>,
  recentlyChecked: Set<string>,
): DiscoveryQueueItem[] {
  const out: DiscoveryQueueItem[] = [];
  const seen = new Set<string>();
  for (const item of mentions) {
    if (known.has(item.username) || recentlyChecked.has(item.username))
      continue;
    if (!shouldQueueSnowballCandidate(item.mentionCount)) {
      continue;
    }
    if (seen.has(item.username)) continue;
    seen.add(item.username);
    out.push({ ...item, source: 'mention' });
  }
  for (const raw of queuedRows) {
    // 비공개 초대 링크(+해시)는 대소문자를 그대로 둔다
    const username = raw.username.startsWith('+')
      ? raw.username.trim()
      : raw.username.replace(/^@/, '').trim().toLowerCase();
    if (!username || known.has(username) || seen.has(username)) continue;
    seen.add(username);
    out.push({
      username,
      sourceChannelIds: [],
      mentionCount: 0,
      source: raw.source === DISCOVERY_SOURCE_KEYWORD ? 'keyword' : 'other',
    });
  }
  return out;
}
