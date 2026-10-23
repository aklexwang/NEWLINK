import { KST } from './channel-metrics.math';

export type CollectTier = 'daily' | 'weekly';

/** 이 인원 이상이면 매일 수집 */
export const COLLECT_DAILY_MIN_MEMBERS = 1_000;

export function resolveCollectTier(input: {
  memberCount?: number | null;
  posts7d?: number | null;
}): CollectTier {
  if ((input.posts7d ?? 0) > 0) return 'daily';
  if ((input.memberCount ?? 0) >= COLLECT_DAILY_MIN_MEMBERS) return 'daily';
  return 'weekly';
}

/** 채널 id 를 0(일)~6(토) 버킷으로 나눕니다. */
export function weeklyCollectBucket(channelId: string): number {
  const text = (channelId ?? '').trim();
  if (!text) return 0;
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return hash % 7;
}

/** KST 요일. 0=일요일 … 6=토요일 */
export function kstWeekdayIndex(now = new Date()): number {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: KST,
    weekday: 'short',
  }).format(now);
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[weekday] ?? 0;
}

export function isCollectDueToday(input: {
  id: string;
  memberCount?: number | null;
  posts7d?: number | null;
  collectTier?: CollectTier | string | null;
  weekday?: number;
  now?: Date;
}): boolean {
  const weekday = input.weekday ?? kstWeekdayIndex(input.now);
  const tier = resolveCollectTier({
    memberCount: input.memberCount,
    posts7d: input.posts7d,
  });
  if (tier === 'daily') return true;
  return weeklyCollectBucket(input.id) === weekday;
}
