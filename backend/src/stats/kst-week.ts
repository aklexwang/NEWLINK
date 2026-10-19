import { addKstDays, formatKstYmd } from './channel-metrics.math';

export function parseIsoWeek(
  week: string,
): { year: number; week: number } | null {
  const match = week.trim().match(/^(\d{4})-W(\d{2})$/i);
  if (!match) return null;
  const year = Number(match[1]);
  const weekNum = Number(match[2]);
  if (!Number.isFinite(year) || weekNum < 1 || weekNum > 53) return null;
  return { year, week: weekNum };
}

/** KST 달력 날짜의 ISO 주차 */
export function isoWeekFromYmd(ymd: string): { year: number; week: number } {
  const date = new Date(`${ymd}T12:00:00+09:00`);
  const isoDow = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
  const thursday = new Date(date);
  thursday.setUTCDate(date.getUTCDate() + 4 - isoDow);
  const year = thursday.getUTCFullYear();
  const jan4 = new Date(`${year}-01-04T12:00:00+09:00`);
  const jan4Dow = jan4.getUTCDay() === 0 ? 7 : jan4.getUTCDay();
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - (jan4Dow - 1));
  const week =
    Math.round((date.getTime() - week1Monday.getTime()) / 86_400_000 / 7) + 1;
  return { year, week };
}

export function isoWeekRangeKst(
  year: number,
  week: number,
): { startYmd: string; endYmd: string } {
  const jan4 = new Date(`${year}-01-04T12:00:00+09:00`);
  const jan4Dow = jan4.getUTCDay() === 0 ? 7 : jan4.getUTCDay();
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - (jan4Dow - 1));
  const monday = new Date(week1Monday);
  monday.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
  const startYmd = formatKstYmd(monday);
  return { startYmd, endYmd: addKstDays(startYmd, 6) };
}

export function formatIsoWeek(year: number, week: number): string {
  return `${year}-W${String(week).padStart(2, '0')}`;
}

export function previousIsoWeek(todayYmd: string): {
  year: number;
  week: number;
  label: string;
} {
  const ymd = addKstDays(todayYmd, -7);
  const parts = isoWeekFromYmd(ymd);
  return { ...parts, label: formatIsoWeek(parts.year, parts.week) };
}
