/**
 * 비공개(초대 링크) 채널: 저장된 접근 정보(채팅 ID·접근 해시)가 다른/멈춘 방을 가리키면
 * 수집은 "정상"인데 새 글이 안 들어온다. 마지막 글이 오래 멈춘 방은 초대 링크로 다시 확인한다.
 */
export const STALE_INVITE_POST_DAYS = 3;
export const STALE_INVITE_RECHECK_DAILY_MAX = 20;
/** 같은 방은 다시 확인한 뒤 이 시간 동안은 또 하지 않는다 (진짜 조용한 방이 한도를 매일 먹지 않게) */
export const STALE_INVITE_RECHECK_COOLDOWN_MS = 3 * 86_400_000;

export function shouldRecheckStaleInvite(input: {
  isChannel: boolean;
  latestPostAtMs: number | null;
  lastRecheckAtMs: number | null;
  rechecksToday: number;
  invitesToday: number;
  inviteDailyLimit: number;
  nowMs: number;
}): boolean {
  if (!input.isChannel) return false;
  if (input.rechecksToday >= STALE_INVITE_RECHECK_DAILY_MAX) return false;
  if (input.invitesToday >= input.inviteDailyLimit) return false;
  if (
    input.lastRecheckAtMs != null &&
    input.nowMs - input.lastRecheckAtMs < STALE_INVITE_RECHECK_COOLDOWN_MS
  )
    return false;
  if (input.latestPostAtMs == null) return true;
  return (
    input.nowMs - input.latestPostAtMs > STALE_INVITE_POST_DAYS * 86_400_000
  );
}
