import {
  allowAdultInList,
  isPendingCategory,
} from '../channels/auto-expose.logic';
import {
  ILLEGAL_HIDE_REASON,
  shouldHideIllegalSuspicion,
} from '../channels/illegal-content.logic';
import { ChannelStatus } from '../channels/channel.entity';
import { isVisibleOnPublicLists } from '../channels/channel-language.logic';
import {
  HIDDEN_COLLECT_STATUSES,
  isPublicCollectable,
} from './collect-visibility';

const HIDDEN_COLLECT = new Set<string>(HIDDEN_COLLECT_STATUSES);

const COLLECT_STATUS_REASON: Record<string, string> = {
  invalid: '채널·그룹 아님',
  gone: '사라진 채널',
  merged: '합쳐진 채널',
  invite_expired: '초대 만료',
};

export const MEMBER_PAGE_REASON = {
  notApproved: '승인되지 않음',
  adminHidden: '관리자가 숨김',
  notCollected: '아직 수집되지 않음',
  notChannel: '채널·그룹 아님',
  gone: '사라진 채널',
  merged: '합쳐진 채널',
  inviteExpired: '초대 만료',
  collectStatus: '수집 상태',
  foreign: '외국어',
  pendingCategory: '분류대기',
  adult: '성인 카테고리',
  illegal: ILLEGAL_HIDE_REASON,
} as const;

export type MemberPageReasonKey =
  | ''
  | (typeof MEMBER_PAGE_REASON)[keyof typeof MEMBER_PAGE_REASON];

export type MemberPageVisibility = {
  visible: boolean;
  reason: string;
  reasonKey: MemberPageReasonKey;
};

/** 홈·피드·랭킹 기본 목록에 나오는지와, 안 나오면 이유 */
export function describeMemberPageVisibility(channel: {
  status?: string | null;
  isVisible?: boolean | null;
  firstObservedAt?: Date | string | null;
  collectStatus?: string | null;
  collectError?: string | null;
  language?: string | null;
  isPromoted?: boolean | null;
  autoRegistered?: boolean | null;
  submittedBy?: number | null;
  category?: string | null;
  title?: string | null;
  description?: string | null;
  illegalCleared?: boolean | null;
}): MemberPageVisibility {
  if (channel.status && channel.status !== ChannelStatus.ACTIVE) {
    return hidden(MEMBER_PAGE_REASON.notApproved);
  }
  if (channel.isVisible === false) {
    return hidden(MEMBER_PAGE_REASON.adminHidden);
  }

  const collectStatus = channel.collectStatus ?? null;
  if (
    collectStatus !== 'invite_only' &&
    (channel.firstObservedAt == null || channel.firstObservedAt === '')
  ) {
    const extra = (channel.collectError ?? '').trim();
    return hidden(
      MEMBER_PAGE_REASON.notCollected,
      extra ? `${MEMBER_PAGE_REASON.notCollected} (${extra})` : undefined,
    );
  }
  if (collectStatus && HIDDEN_COLLECT.has(collectStatus)) {
    const key =
      collectStatus === 'invalid'
        ? MEMBER_PAGE_REASON.notChannel
        : collectStatus === 'gone'
          ? MEMBER_PAGE_REASON.gone
          : collectStatus === 'merged'
            ? MEMBER_PAGE_REASON.merged
            : collectStatus === 'invite_expired'
              ? MEMBER_PAGE_REASON.inviteExpired
              : MEMBER_PAGE_REASON.collectStatus;
    return hidden(key, COLLECT_STATUS_REASON[collectStatus] ?? key);
  }
  if (
    !isPublicCollectable({
      firstObservedAt:
        channel.firstObservedAt instanceof Date ||
        channel.firstObservedAt == null
          ? channel.firstObservedAt
          : new Date(String(channel.firstObservedAt)),
      collectStatus: collectStatus as never,
      isVisible: channel.isVisible,
    })
  ) {
    return hidden(MEMBER_PAGE_REASON.collectStatus);
  }

  if (!isVisibleOnPublicLists(channel)) {
    return hidden(MEMBER_PAGE_REASON.foreign);
  }
  if (shouldHideIllegalSuspicion(channel)) {
    return hidden(MEMBER_PAGE_REASON.illegal);
  }
  if (isPendingCategory(channel.category)) {
    return hidden(MEMBER_PAGE_REASON.pendingCategory);
  }
  if (!allowAdultInList(channel.category)) {
    return hidden(MEMBER_PAGE_REASON.adult);
  }
  return { visible: true, reason: '', reasonKey: '' };
}

function hidden(
  reasonKey: Exclude<MemberPageReasonKey, ''>,
  reason?: string,
): MemberPageVisibility {
  return { visible: false, reason: reason ?? reasonKey, reasonKey };
}
