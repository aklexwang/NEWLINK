/** Postgres uuid 컬럼이 받는 RFC 4122 형식. */
export const UUID_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuidId(value: string | null | undefined): boolean {
  return typeof value === 'string' && UUID_ID_RE.test(value);
}
