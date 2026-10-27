/** 하루(KST) 숫자 저장 형식: 저장된 날짜가 오늘일 때만 되살린다 */
export interface StoredDaily<T> {
  date: string;
  values: T;
}

export const DAILY_KEY_PREFIX = 'daily:';

export function dailyKey(name: string): string {
  return `${DAILY_KEY_PREFIX}${name}`;
}

export function encodeDaily<T>(date: string, values: T): string {
  return JSON.stringify({ date, values });
}

/** 오늘 날짜의 값이면 values, 아니면(날짜 다름·깨진 값) null */
export function decodeDailyForToday<T>(
  raw: string | null | undefined,
  today: string,
): T | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredDaily<T>>;
    if (!parsed || parsed.date !== today || parsed.values == null) return null;
    if (typeof parsed.values !== 'object') return null;
    return parsed.values;
  } catch {
    return null;
  }
}

/** 음수·NaN 을 걸러 0 이상 정수로 */
export function safeCount(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}
