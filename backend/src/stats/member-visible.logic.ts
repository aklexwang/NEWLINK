/**
 * 회원 화면 노출 규칙 한 곳. 회원 검색·사이트맵·주간 헤드라인·상세 페이지가 모두 이 함수를 쓴다.
 * 판정은 describeMemberPageVisibility(불법 의심·외국어·분류대기·성인 등 포함) 하나뿐이다.
 */
import { ADULT_CATEGORY } from '../channels/auto-expose.logic';
import {
  dedupeChannelsByLink,
  shouldReplaceDuplicate,
  type DuplicateCandidate,
} from '../channels/channel-link.logic';
import {
  describeMemberPageVisibility,
  MEMBER_PAGE_REASON,
} from './public-list-visibility.logic';

export type MemberVisibleInput = Parameters<
  typeof describeMemberPageVisibility
>[0];

/**
 * 회원에게 보이는 채널인지.
 * 성인 카테고리를 직접 고른 목록·검색에서만 성인 채널을 허용한다.
 */
export function isMemberVisible(
  channel: MemberVisibleInput,
  selectedCategory?: string | null,
): boolean {
  const vis = describeMemberPageVisibility(channel);
  if (vis.visible) return true;
  return (
    selectedCategory === ADULT_CATEGORY &&
    vis.reasonKey === MEMBER_PAGE_REASON.adult
  );
}

/**
 * 같은 대상의 여러 행 중 대표 1개. 노출 가능한 행을 먼저, 그다음 shouldReplaceDuplicate 순서.
 * 상세 페이지(username)처럼 노출 불가 행만 있어도 하나는 돌려준다.
 */
export function pickBestMemberRow<
  T extends MemberVisibleInput & DuplicateCandidate,
>(rows: T[]): T | null {
  let best: T | null = null;
  for (const row of rows) {
    if (!best) {
      best = row;
      continue;
    }
    const rowVisible = isMemberVisible(row);
    const bestVisible = isMemberVisible(best);
    if (rowVisible !== bestVisible) {
      if (rowVisible) best = row;
      continue;
    }
    if (shouldReplaceDuplicate(best, row)) best = row;
  }
  return best;
}

/**
 * 같은 링크는 "가장 좋은 행" 1개만 고르되, 노출 가능한 행을 먼저 대표로 삼은 뒤
 * 노출 가능한 것만 남긴다.
 */
export function selectMemberVisibleRows<
  T extends MemberVisibleInput & DuplicateCandidate,
>(rows: T[], selectedCategory?: string | null): T[] {
  const visible = (row: T) => isMemberVisible(row, selectedCategory);
  return dedupeChannelsByLink(rows, { prefer: visible }).filter(visible);
}
