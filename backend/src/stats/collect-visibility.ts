import type { ChannelCollectStatus } from '../channels/channel.entity';

const HIDDEN_COLLECT: ReadonlySet<string> = new Set(['invalid', 'gone']);

/** 홈·피드·랭킹·점수·눈덩이에 올릴 수 있는 채널인지 */
export function isPublicCollectable(channel: {
  firstObservedAt?: Date | null;
  collectStatus?: ChannelCollectStatus | null;
}): boolean {
  if (channel.firstObservedAt == null) return false;
  const status = channel.collectStatus ?? null;
  if (status && HIDDEN_COLLECT.has(status)) return false;
  return true;
}

export const HIDDEN_COLLECT_STATUSES = ['invalid', 'gone'] as const;
