import type { ChannelCollectStatus } from '../channels/channel.entity';

const HIDDEN_COLLECT: ReadonlySet<string> = new Set([
  'invalid',
  'gone',
  'merged',
  'invite_expired',
]);

function isCollectOk(channel: {
  firstObservedAt?: Date | null;
  collectStatus?: ChannelCollectStatus | null;
}): boolean {
  if (channel.collectStatus === 'invite_only') return true;
  if (channel.firstObservedAt == null) return false;
  const status = channel.collectStatus ?? null;
  if (status && HIDDEN_COLLECT.has(status)) return false;
  return true;
}

/** 홈·피드·랭킹·검색에 올릴 수 있는 채널인지 */
export function isPublicCollectable(channel: {
  firstObservedAt?: Date | null;
  collectStatus?: ChannelCollectStatus | null;
  isVisible?: boolean | null;
}): boolean {
  if (channel.isVisible === false) return false;
  return isCollectOk(channel);
}

/** 점수 계산 대상. 비활성이어도 수집·점수는 이어간다 */
export function isScoreCollectable(channel: {
  firstObservedAt?: Date | null;
  collectStatus?: ChannelCollectStatus | null;
}): boolean {
  if (channel.collectStatus === 'invite_only') return false;
  return isCollectOk(channel);
}

export const HIDDEN_COLLECT_STATUSES = [
  'invalid',
  'gone',
  'merged',
  'invite_expired',
] as const;
