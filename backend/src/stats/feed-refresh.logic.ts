/** 홈 피드에 고른 방 빠른 새 글 확인 간격 */

/** 웹 미리보기로 읽히는 공개 채널: 수집 계정을 안 쓰므로 자주 */
export const FEED_PUBLIC_REFRESH_MS = 15 * 60 * 1000;
/** 수집 계정으로만 읽히는 방(비공개·미리보기 막힘): 하루 이 요청 수 안에서 나눠 쓴다 */
export const FEED_MTPROTO_DAILY_CALLS = 400;
export const FEED_MTPROTO_MIN_INTERVAL_MS = 30 * 60 * 1000;

/** 수집 계정 방이 n개일 때 한 방을 몇 분마다 확인하는지 (최소 30분) */
export function feedMtprotoIntervalMs(roomCount: number): number {
  if (roomCount <= 0) return FEED_MTPROTO_MIN_INTERVAL_MS;
  const perRoomDaily = FEED_MTPROTO_DAILY_CALLS / roomCount;
  const ms = Math.ceil((24 * 60) / perRoomDaily) * 60 * 1000;
  return Math.max(FEED_MTPROTO_MIN_INTERVAL_MS, ms);
}

export function isRefreshDue(
  lastAtMs: number | null | undefined,
  intervalMs: number,
  nowMs: number,
): boolean {
  if (lastAtMs == null) return true;
  return nowMs - lastAtMs >= intervalMs;
}
