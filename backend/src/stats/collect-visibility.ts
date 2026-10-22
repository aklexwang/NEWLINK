import type { ChannelCollectStatus } from '../channels/channel.entity';

const HIDDEN_COLLECT: ReadonlySet<string> = new Set([
  'invalid',
  'gone',
  'merged',
  'invite_expired',
]);

/** 홈·피드·랭킹·검색에 올릴 수 있는 채널인지 */
export function isPublicCollectable(channel: {
  firstObservedAt?: Date | null;
  collectStatus?: ChannelCollectStatus | null;
}): boolean {
  if (channel.collectStatus === 'invite_only') return true;
  if (channel.firstObservedAt == null) return false;
  const status = channel.collectStatus ?? null;
  if (status && HIDDEN_COLLECT.has(status)) return false;
  return true;
}

/** 점수 계산 대상. 초대 전용 방은 통계가 없어 제외 */
export function isScoreCollectable(channel: {
  firstObservedAt?: Date | null;
  collectStatus?: ChannelCollectStatus | null;
}): boolean {
  if (channel.collectStatus === 'invite_only') return false;
  return isPublicCollectable(channel);
}

export const HIDDEN_COLLECT_STATUSES = [
  'invalid',
  'gone',
  'merged',
  'invite_expired',
] as const;
