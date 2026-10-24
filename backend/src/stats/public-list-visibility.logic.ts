import {
  allowAdultInList,
  isPendingCategory,
} from '../channels/auto-expose.logic';
import { ChannelStatus } from '../channels/channel.entity';
import { isVisibleOnPublicLists } from '../channels/channel-language.logic';
import { HIDDEN_COLLECT_STATUSES, isPublicCollectable } from './collect-visibility';

const HIDDEN_COLLECT = new Set<string>(HIDDEN_COLLECT_STATUSES);

const COLLECT_STATUS_REASON: Record<string, string> = {
  invalid: '채널·그룹 아님',
  gone: '사라진 채널',
  merged: '합쳐진 채널',
  invite_expired: '초대 만료',
};

export type MemberPageVisibility = {
  visible: boolean;
  reason: string;
};

/** 홈·피드·랭킹 기본 목록에 나오는지와, 안 나오면 이유 */
export function describeMemberPageVisibility(channel: {
  status?: string | null;
  isVisible?: boolean | null;
  firstObservedAt?: Date | string | null;
  collectStatus?: string | null;
  collectError?: string | null;
  language?: string | null;
  isPromoted?: boolean;
  autoRegistered?: boolean | null;
  submittedBy?: number | null;
  category?: string | null;
}): MemberPageVisibility {
  if (channel.status && channel.status !== ChannelStatus.ACTIVE) {
    return { visible: false, reason: '승인되지 않음' };
  }
  if (channel.isVisible === false) {
    return { visible: false, reason: '관리자가 숨김' };
  }

  const collectStatus = channel.collectStatus ?? null;
  if (
    collectStatus !== 'invite_only' &&
    (channel.firstObservedAt == null || channel.firstObservedAt === '')
  ) {
    const extra = (channel.collectError ?? '').trim();
    return {
      visible: false,
      reason: extra ? `아직 수집되지 않음 (${extra})` : '아직 수집되지 않음',
    };
  }
  if (collectStatus && HIDDEN_COLLECT.has(collectStatus)) {
    return {
      visible: false,
      reason: COLLECT_STATUS_REASON[collectStatus] ?? collectStatus,
    };
  }
  if (
    !isPublicCollectable({
      firstObservedAt:
        channel.firstObservedAt instanceof Date ||
        channel.firstObservedAt == null
          ? (channel.firstObservedAt as Date | null)
          : new Date(String(channel.firstObservedAt)),
      collectStatus: collectStatus as never,
      isVisible: channel.isVisible,
    })
  ) {
    return { visible: false, reason: '수집 상태' };
  }

  if (!isVisibleOnPublicLists(channel)) {
    return { visible: false, reason: '외국어' };
  }
  if (isPendingCategory(channel.category)) {
    return { visible: false, reason: '분류대기' };
  }
  if (!allowAdultInList(channel.category)) {
    return { visible: false, reason: '성인 카테고리' };
  }
  return { visible: true, reason: '' };
}
