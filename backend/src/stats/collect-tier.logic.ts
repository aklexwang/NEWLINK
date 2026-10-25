/**
 * (사용 중단) 예전 daily/weekly 요일 버킷 규칙.
 * 수집 대상은 collect-queue.logic.ts 의 우선순위 큐(next_collect_at)가 정한다. 수집기·등록 경로는 이 파일을 쓰지 않는다.
 * scripts/bulk-candidates.ts 가 collect_tier 칸을 채우려고 resolveCollectTier 만 아직 가져다 쓰므로 파일은 남겨 둔다.
 */

export type CollectTier = 'daily' | 'weekly';

/** 이 인원 이상이면 매일 수집 */
export const COLLECT_DAILY_MIN_MEMBERS = 1_000;

/** 새로 등록된 채널은 이 기간 동안 매일 수집 */
export const NEW_CHANNEL_DAILY_DAYS = 7;
const NEW_CHANNEL_DAILY_MS = NEW_CHANNEL_DAILY_DAYS * 24 * 60 * 60 * 1000;

export function isNewChannelDailyWindow(
  createdAt?: Date | string | null,
  now = new Date(),
): boolean {
  if (createdAt == null) return false;
  const at =
    createdAt instanceof Date
      ? createdAt.getTime()
      : Date.parse(String(createdAt));
  if (!Number.isFinite(at)) return false;
  return now.getTime() - at < NEW_CHANNEL_DAILY_MS;
}

export function resolveCollectTier(input: {
  memberCount?: number | null;
  posts7d?: number | null;
  createdAt?: Date | string | null;
  now?: Date;
}): CollectTier {
  if (isNewChannelDailyWindow(input.createdAt, input.now)) return 'daily';
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
  const time = now.getTime();
  if (!Number.isFinite(time)) return 0;
  // 한국은 서머타임이 없어 UTC+9 고정
  return new Date(time + 9 * 60 * 60 * 1000).getUTCDay();
}

export function isCollectDueToday(input: {
  id: string;
  memberCount?: number | null;
  posts7d?: number | null;
  collectTier?: CollectTier | string | null;
  createdAt?: Date | string | null;
  weekday?: number;
  now?: Date;
}): boolean {
  const weekday = input.weekday ?? kstWeekdayIndex(input.now);
  const tier = resolveCollectTier({
    memberCount: input.memberCount,
    posts7d: input.posts7d,
    createdAt: input.createdAt,
    now: input.now,
  });
  if (tier === 'daily') return true;
  return weeklyCollectBucket(input.id) === weekday;
}
