import {
  ChannelStatus,
  type ChannelCollectStatus,
} from '../channels/channel.entity';
import {
  allowAdultInList,
  isPendingCategory,
} from '../channels/auto-expose.logic';
import { isDefaultPublicLanguage } from '../channels/channel-language.logic';
import { shouldHideIllegalSuspicion } from '../channels/illegal-content.logic';
import { isPublicCollectable } from './collect-visibility';

export type WeeklyHeadlineChannel = {
  status?: string | null;
  firstObservedAt?: Date | null;
  collectStatus?: ChannelCollectStatus | null;
  isVisible?: boolean | null;
  language?: string | null;
  category?: string | null;
  title?: string | null;
  description?: string | null;
  illegalCleared?: boolean | null;
};

/** 홈 상위·랭킹과 같이 주간 소식에 올릴 채널인지 */
export function isWeeklyHeadlineChannel(
  channel: WeeklyHeadlineChannel,
): boolean {
  if (channel.status !== ChannelStatus.ACTIVE) return false;
  if (!isPublicCollectable(channel)) return false;
  if (!isDefaultPublicLanguage(channel.language)) return false;
  if (shouldHideIllegalSuspicion(channel)) return false;
  if (!allowAdultInList(channel.category)) return false;
  if (isPendingCategory(channel.category)) return false;
  return true;
}

export type RankUpLike = {
  channelId: string;
  occurredAt: Date | string;
  before: string | null;
  after: string | null;
};

/**
 * 같은 채널의 순위 상승을 1건으로 합칩니다.
 * before = 그 주 첫 순위, after = 그 주 마지막 순위.
 */
export function collapseWeeklyRankUps<T extends RankUpLike>(events: T[]): T[] {
  const byChannel = new Map<string, T[]>();
  for (const event of events) {
    const list = byChannel.get(event.channelId) ?? [];
    list.push(event);
    byChannel.set(event.channelId, list);
  }
  const collapsed: T[] = [];
  for (const list of byChannel.values()) {
    list.sort(
      (a, b) =>
        new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime(),
    );
    const first = list[0];
    const last = list[list.length - 1];
    collapsed.push({
      ...last,
      before: first.before,
      after: last.after,
    });
  }
  collapsed.sort(
    (a, b) =>
      new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
  );
  return collapsed;
}
