/**
 * 알 수 없는 값을 글자로. String(value) 와 같지만 평범한 객체는 "[object Object]" 대신 '' 를 돌려준다.
 * gramjs 의 BigInteger 처럼 자기 toString 이 있는 객체는 그 값을 쓴다.
 */
export function asText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (
    typeof value === 'number' ||
    typeof value === 'bigint' ||
    typeof value === 'boolean'
  ) {
    return String(value);
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    const own = (value as { toString?: unknown }).toString;
    if (typeof own === 'function' && own !== Object.prototype.toString) {
      return (own as () => string).call(value);
    }
  }
  return '';
}
