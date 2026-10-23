import {
  extractTelegramUsernameFromLink,
  isDiscoverableUsername,
} from '../channels/telegram-username';
import { splitMentionedUsernames } from './telegram-preview-html';

export const DISCOVERY_MIN_DISTINCT_CHANNELS = 2;
export const DISCOVERY_MIN_MEMBERS = 100;
/** MTProto 로 확인한 인원이 이 이상이면 1개 채널 언급으로도 통과 */
export const DISCOVERY_SINGLE_MENTION_MIN_MEMBERS = 1_000;
export const DISCOVERY_MAX_PER_DAY = 200;
export const DISCOVERY_DELAY_MS = 1500;
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

export type DiscoveryQueueSource = 'mention' | 'keyword';

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

/** MTProto 가 꺼져 있으면 2곳 이상만. 켜져 있으면 1곳 언급도 검사 큐에 넣습니다. */
export function shouldQueueSnowballCandidate(
  mentionCount: number,
  mtprotoEnabled: boolean,
): boolean {
  if (mentionCount >= DISCOVERY_MIN_DISTINCT_CHANNELS) return true;
  return mtprotoEnabled && mentionCount >= 1;
}

/** 등록 전 눈덩이 인원 규칙. 1곳 언급은 MTProto 인원 1,000명 이상만. */
export function passesSnowballDiscovery(input: {
  mentionCount: number;
  memberCount: number | null;
  membersFromMtproto: boolean;
}): boolean {
  if (input.memberCount == null || input.memberCount < DISCOVERY_MIN_MEMBERS) {
    return false;
  }
  if (input.mentionCount >= DISCOVERY_MIN_DISTINCT_CHANNELS) return true;
  return (
    input.mentionCount >= 1 &&
    input.membersFromMtproto &&
    input.memberCount >= DISCOVERY_SINGLE_MENTION_MIN_MEMBERS
  );
}

/** 언급 후보를 앞에, 키워드 대기열은 뒤에. 같은 username 은 한 번만. */
export function mergeDiscoveryQueue(
  mentions: MentionAggregate[],
  keywordQueued: string[],
  known: Set<string>,
  recentlyChecked: Set<string>,
  mtprotoEnabled: boolean,
): DiscoveryQueueItem[] {
  const out: DiscoveryQueueItem[] = [];
  const seen = new Set<string>();
  for (const item of mentions) {
    if (known.has(item.username) || recentlyChecked.has(item.username)) continue;
    if (!shouldQueueSnowballCandidate(item.mentionCount, mtprotoEnabled)) {
      continue;
    }
    if (seen.has(item.username)) continue;
    seen.add(item.username);
    out.push({ ...item, source: 'mention' });
  }
  if (!mtprotoEnabled) return out;
  for (const raw of keywordQueued) {
    const username = raw.replace(/^@/, '').trim().toLowerCase();
    if (!username || known.has(username) || seen.has(username)) continue;
    seen.add(username);
    out.push({
      username,
      sourceChannelIds: [],
      mentionCount: 0,
      source: 'keyword',
    });
  }
  return out;
}
