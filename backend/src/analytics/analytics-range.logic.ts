import { BadRequestException } from '@nestjs/common';
import { addKstDays, formatKstYmd } from '../stats/channel-metrics.math';

export type AnalyticsRange = 'today' | '7d' | '30d';

export const ANALYTICS_RANGES: AnalyticsRange[] = ['today', '7d', '30d'];

export function parseAnalyticsRange(raw: string | undefined): AnalyticsRange {
  if (raw === undefined || raw === '') return 'today';
  if ((ANALYTICS_RANGES as string[]).includes(raw)) {
    return raw as AnalyticsRange;
  }
  throw new BadRequestException('range 는 today, 7d, 30d 중 하나여야 합니다.');
}

/** 한국시간 기준 포함 구간 [from, to] (YYYY-MM-DD). 오늘이 마지막 날. */
export function analyticsRangeDates(
  range: AnalyticsRange,
  now: Date = new Date(),
): { from: string; to: string } {
  const to = formatKstYmd(now);
  const days = range === 'today' ? 0 : range === '7d' ? 6 : 29;
  return { from: days === 0 ? to : addKstDays(to, -days), to };
}
