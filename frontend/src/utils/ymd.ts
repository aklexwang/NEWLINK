/** 'YYYY-MM-DD' 문자열 ↔ 연·월·일 (시간대 영향 없이 달력 날짜만 다룬다) */
export function parseYmd(value: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]) - 1, d: Number(match[3]) };
}

export function toYmd(y: number, m: number, d: number): string {
  const date = new Date(Date.UTC(y, m, d));
  return date.toISOString().slice(0, 10);
}

/** 한국 시간 기준 오늘 */
export function todayKstYmd(): string {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
}

export function addDays(ymd: string, days: number): string {
  const p = parseYmd(ymd)!;
  return toYmd(p.y, p.m, p.d + days);
}

export function addMonths(ymd: string, months: number): string {
  const p = parseYmd(ymd)!;
  const last = new Date(Date.UTC(p.y, p.m + months + 1, 0)).getUTCDate();
  return toYmd(p.y, p.m + months, Math.min(p.d, last));
}

export const WEEK = ['일', '월', '화', '수', '목', '금', '토'];

export function formatYmdKo(value: string): string {
  const p = parseYmd(value);
  if (!p) return '';
  const dow = new Date(Date.UTC(p.y, p.m, p.d)).getUTCDay();
  return `${p.y}년 ${p.m + 1}월 ${p.d}일 (${WEEK[dow]})`;
}
