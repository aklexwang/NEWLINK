import {
  dedupeChannelsByLink,
  type DuplicateCandidate,
} from '../channels/channel-link.logic';
import { ADULT_CATEGORY } from '../channels/auto-expose.logic';
import { ChannelStatus } from '../channels/channel.entity';
import { isMemberVisible } from './member-visible.logic';
import {
  describeMemberPageVisibility,
  MEMBER_PAGE_REASON,
} from './public-list-visibility.logic';

export type MemberPageRow = Parameters<typeof describeMemberPageVisibility>[0] &
  Partial<DuplicateCandidate>;

/** 대시보드 숨김 이유 표시 순서. 판별 순서(describeMemberPageVisibility)와 같다 */
export const MEMBER_PAGE_REASON_ORDER: readonly string[] = [
  MEMBER_PAGE_REASON.notApproved,
  MEMBER_PAGE_REASON.adminHidden,
  MEMBER_PAGE_REASON.notCollected,
  MEMBER_PAGE_REASON.notChannel,
  MEMBER_PAGE_REASON.gone,
  MEMBER_PAGE_REASON.merged,
  MEMBER_PAGE_REASON.inviteExpired,
  MEMBER_PAGE_REASON.foreign,
  MEMBER_PAGE_REASON.illegal,
  MEMBER_PAGE_REASON.pendingCategory,
  MEMBER_PAGE_REASON.adult,
];

function isActiveRow(row: { status?: string | null }): boolean {
  return !row.status || row.status === ChannelStatus.ACTIVE;
}

type LinkedRow = MemberPageRow & { link: string };

export type MemberVisibilitySummary = {
  /** 행(채널) 기준 노출 수. describeMemberPageVisibility 로 한 건씩 판정 */
  visible: number;
  hidden: number;
  /** 이유별 숨김 수. 0건인 이유도 줄을 남긴다 */
  hiddenReasons: Record<string, number>;
  /** 노출 조건을 통과했지만 같은 링크의 대표가 따로 있어 회원 화면에서 빠지는 수 */
  duplicateExcess: number;
  /** 회원 화면 "전체" 숫자와 같은 값 = visible - duplicateExcess */
  listTotal: number;
};

/**
 * 대시보드 노출·숨김 집계. 회원 화면과 같은 판별 함수(describeMemberPageVisibility)만 쓴다.
 * 회원 "전체"는 같은 링크를 1개로 합치므로, 그 차이를 duplicateExcess 로 따로 보여준다.
 */
export function summarizeMemberVisibility(
  rows: MemberPageRow[],
): MemberVisibilitySummary {
  const hiddenReasons: Record<string, number> = {};
  for (const reason of MEMBER_PAGE_REASON_ORDER) hiddenReasons[reason] = 0;

  const visibleRows = new Set<MemberPageRow>();
  let visible = 0;
  let hidden = 0;
  for (const row of rows) {
    const vis = describeMemberPageVisibility(row);
    if (vis.visible) {
      visible += 1;
      visibleRows.add(row);
    } else {
      hidden += 1;
      hiddenReasons[vis.reasonKey] = (hiddenReasons[vis.reasonKey] ?? 0) + 1;
    }
  }

  const linked = rows.filter(
    (row): row is LinkedRow => isActiveRow(row) && Boolean(row.link),
  );
  // 회원 화면과 같이 노출 가능한 행을 먼저 대표로 고른다
  const winners = new Set<MemberPageRow>(
    dedupeChannelsByLink(linked, { prefer: (row) => visibleRows.has(row) }),
  );
  let duplicateExcess = 0;
  for (const row of linked) {
    if (!winners.has(row) && visibleRows.has(row)) duplicateExcess += 1;
  }

  return {
    visible,
    hidden,
    hiddenReasons,
    duplicateExcess,
    listTotal: visible - duplicateExcess,
  };
}

/**
 * 회원 화면 카테고리별 개수(all 포함). 승인된 채널만, 같은 링크는 대표 1개.
 * all 은 회원 목록에 실제로 나오는 채널 수이고, 성인 카테고리 칩 숫자만 별도로 센다.
 */
export function buildMemberRankingCounts<
  T extends MemberPageRow & { link: string },
>(rows: T[]): Record<string, number> {
  const winners = dedupeChannelsByLink(rows.filter(isActiveRow), {
    prefer: (row) => isMemberVisible(row, ADULT_CATEGORY),
  });
  const counts: Record<string, number> = { all: 0 };
  for (const channel of winners) {
    const vis = describeMemberPageVisibility(channel);
    const category = channel.category ?? '';
    if (vis.visible) {
      counts.all += 1;
      counts[category] = (counts[category] ?? 0) + 1;
    } else if (vis.reasonKey === MEMBER_PAGE_REASON.adult) {
      counts[category] = (counts[category] ?? 0) + 1;
    }
  }
  return counts;
}
