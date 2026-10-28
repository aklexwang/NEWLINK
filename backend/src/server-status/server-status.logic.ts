/** 서버 상황 계산 (순수 함수) */

export const MB = 1024 * 1024;
export const WARN_PERCENT = 80;
export const DANGER_PERCENT = 90;

export type Level = 'ok' | 'warn' | 'danger';

export function percent(used: number, limit: number): number {
  if (!(limit > 0)) return 0;
  return Math.round((used / limit) * 1000) / 10;
}

export function levelOf(pct: number): Level {
  if (pct >= DANGER_PERCENT) return 'danger';
  if (pct >= WARN_PERCENT) return 'warn';
  return 'ok';
}

export function parseLimitMb(
  raw: string | undefined,
  fallback: number,
): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** 하루 기록: [{d:'2026-10-28', mb: 176.4}] 최근 30개 */
export type SizePoint = { d: string; mb: number };

export function pushSizePoint(
  history: SizePoint[],
  point: SizePoint,
  keep = 30,
): SizePoint[] {
  const rest = history.filter((p) => p.d !== point.d);
  return [...rest, point].sort((a, b) => a.d.localeCompare(b.d)).slice(-keep);
}

/** 최근 기록으로 하루 평균 증가량(MB). 이틀 미만이면 null */
export function dailyGrowthMb(history: SizePoint[]): number | null {
  if (history.length < 2) return null;
  const first = history[0];
  const last = history[history.length - 1];
  const days = (Date.parse(last.d) - Date.parse(first.d)) / 86_400_000;
  if (!(days > 0)) return null;
  return Math.round(((last.mb - first.mb) / days) * 10) / 10;
}

/** 지금 속도로 한도까지 남은 날 (늘지 않으면 null) */
export function daysUntilFull(
  usedMb: number,
  limitMb: number,
  growthMb: number | null,
): number | null {
  if (growthMb == null || growthMb <= 0) return null;
  return Math.max(0, Math.floor((limitMb - usedMb) / growthMb));
}

/** app_settings 의 value(500자) 안에 들어가게 줄인다 */
export function encodeHistory(history: SizePoint[]): string {
  let list = history;
  let text = JSON.stringify(list);
  while (text.length > 500 && list.length > 1) {
    list = list.slice(1);
    text = JSON.stringify(list);
  }
  return text;
}

export function decodeHistory(raw: string | null | undefined): SizePoint[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p): p is SizePoint =>
        typeof p === 'object' &&
        p != null &&
        typeof (p as SizePoint).d === 'string' &&
        typeof (p as SizePoint).mb === 'number',
    );
  } catch {
    return [];
  }
}
