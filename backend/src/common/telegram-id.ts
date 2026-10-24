/** Postgres bigint 는 문자열로 올 수 있어 비교·조회는 문자열로 통일합니다. */
export function telegramIdKey(value: unknown): string {
  if (value == null || value === '') return '';
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '';
    return String(Math.trunc(value));
  }
  const text = String(value).trim();
  if (!text || text === 'null' || text === 'undefined') return '';
  return text;
}

export function telegramIdsEqual(a: unknown, b: unknown): boolean {
  const left = telegramIdKey(a);
  const right = telegramIdKey(b);
  return left !== '' && left === right;
}
