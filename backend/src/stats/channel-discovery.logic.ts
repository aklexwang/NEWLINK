import {
  extractTelegramUsernameFromLink,
  isDiscoverableUsername,
} from '../channels/telegram-username';
import { splitMentionedUsernames } from './telegram-preview-html';

export const DISCOVERY_MIN_DISTINCT_CHANNELS = 2;
export const DISCOVERY_MIN_MEMBERS = 100;
export const DISCOVERY_MAX_PER_DAY = 50;
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
    .filter((item) => item.mentionCount >= DISCOVERY_MIN_DISTINCT_CHANNELS)
    .sort((a, b) => b.mentionCount - a.mentionCount || a.username.localeCompare(b.username));
}
