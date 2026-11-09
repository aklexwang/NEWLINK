import { countObservedDays, DATA_SHORT_DAYS } from './channel-metrics.math';

export const BADGE_VIEW_RATE_HIGH = 0.3;
export const BADGE_NEW_DAYS = 30;
export const BADGE_POPULAR_TOP_RATIO = 0.1;
export const RISING_MIN_MEMBERS = 100;

export type ChannelBadgeCode =
  | 'high_engagement'
  | 'new'
  | 'popular'
  | 'low_data'
  | 'views_anomaly'
  | 'member_surge';

export interface ChannelBadge {
  code: ChannelBadgeCode;
  label: string;
}

const LABELS: Record<ChannelBadgeCode, string> = {
  high_engagement: '높은 참여',
  new: '신규',
  popular: '인기',
  low_data: '데이터 부족',
  views_anomaly: '조회 이상 감지',
  member_surge: '급증 확인 필요',
};

/** 회원 급증 의심: 7일·30일 사이 회원이 2배 이상 늘었는데 조회율이 2% 미만(조회가 따라 늘지 않음) */
export const SURGE_MIN_MEMBERS = 1000;
export const SURGE_MIN_DELTA = 1000;
export const SURGE_RATIO = 2;
/** 활동·조회가 하나도 확인 안 되는 방은 1.5배 증가만으로도 의심 */
export const SURGE_FAST_RATIO = 1.5;
export const SURGE_MAX_VIEW_RATE = 0.02;

/**
 * 회원 급증 의심:
 * - (강) 7·30일에 회원 2배 이상 늘었는데 조회율이 2% 미만(조회가 안 따라옴), 또는
 * - (활동 0) 1.5배 이상 늘었는데 7일 글도 0, 조회도 없음 — 활동이 전혀 확인 안 됨
 *   (운영자가 미리보기를 꺼 글을 못 읽는 방도 여기 걸릴 수 있어 "확인 필요" 경고로 쓴다)
 */
export function isMemberSurgeSuspected(input: {
  memberCount: number | null;
  memberDelta7d: number | null;
  memberDelta30d: number | null;
  viewRate: number | null;
  posts7d?: number | null;
}): boolean {
  const count = input.memberCount ?? 0;
  const deltas = [input.memberDelta7d, input.memberDelta30d].filter((d): d is number => d != null);
  if (count < SURGE_MIN_MEMBERS || deltas.length === 0) return false;
  const delta = Math.max(...deltas);
  const before = count - delta;
  if (delta < SURGE_MIN_DELTA || before <= 0) return false;
  const ratio = count / before;
  const lowView = input.viewRate == null || input.viewRate < SURGE_MAX_VIEW_RATE;
  const noActivity = (input.posts7d ?? 0) === 0 && (input.viewRate == null || input.viewRate === 0);
  if (ratio >= SURGE_RATIO && lowView) return true;
  if (ratio >= SURGE_FAST_RATIO && noActivity) return true;
  return false;
}

export function buildChannelBadges(input: {
  viewRate: number | null;
  firstObservedAt: Date | null;
  createdAt: Date;
  observedDays: number | null;
  categoryRank: number | null;
  categoryCount: number;
  manipulationSuspected: boolean;
  memberSurgeSuspected?: boolean;
  todayYmd: string;
}): ChannelBadge[] {
  const badges: ChannelBadge[] = [];

  // 목록 카드는 앞의 3개만 보여 주므로 경고를 맨 앞에 둔다
  if (input.memberSurgeSuspected) {
    badges.push({ code: 'member_surge', label: LABELS.member_surge });
  }

  if (input.viewRate != null && input.viewRate >= BADGE_VIEW_RATE_HIGH) {
    badges.push({ code: 'high_engagement', label: LABELS.high_engagement });
  }

  const origin = input.firstObservedAt ?? input.createdAt;
  if (countObservedDays(origin, input.todayYmd) < BADGE_NEW_DAYS) {
    badges.push({ code: 'new', label: LABELS.new });
  }

  if (
    input.categoryRank != null &&
    input.categoryCount > 0 &&
    input.categoryRank <=
      Math.max(1, Math.ceil(input.categoryCount * BADGE_POPULAR_TOP_RATIO))
  ) {
    badges.push({ code: 'popular', label: LABELS.popular });
  }

  const observed = input.observedDays ?? 0;
  if (observed < DATA_SHORT_DAYS) {
    badges.push({ code: 'low_data', label: LABELS.low_data });
  }

  if (input.manipulationSuspected) {
    badges.push({ code: 'views_anomaly', label: LABELS.views_anomaly });
  }

  return badges;
}
