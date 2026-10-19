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
  | 'views_anomaly';

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
};

export function buildChannelBadges(input: {
  viewRate: number | null;
  firstObservedAt: Date | null;
  createdAt: Date;
  observedDays: number | null;
  categoryRank: number | null;
  categoryCount: number;
  manipulationSuspected: boolean;
  todayYmd: string;
}): ChannelBadge[] {
  const badges: ChannelBadge[] = [];

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
