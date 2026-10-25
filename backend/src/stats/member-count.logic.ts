/**
 * 회원 수는 정확한 값을 우선한다.
 * - t.me/<username> 공개 페이지·MTProto·봇 API 는 정확한 숫자(예: 40 892)를 준다.
 * - t.me/s 미리보기는 "40.8K", "9.24M" 처럼 3자리 유효숫자로 반올림한 값만 준다.
 *   그래서 미리보기 값은 "정확한 값 ± 반올림 오차" 로만 취급한다.
 */

/**
 * 미리보기의 축약 표기 하나가 가질 수 있는 반올림 오차(절댓값). 정확한 숫자면 0.
 * 마지막 자리의 절반이다. "40.8K" → 50, "298K" → 500, "9.24M" → 5,000.
 */
export function abbreviatedCountTolerance(
  raw: string | null | undefined,
): number {
  if (raw == null) return 0;
  const text = String(raw).trim().replace(/,/g, '').replace(/\s/g, '');
  const match = text.match(/^(\d+)(?:\.(\d+))?([KMBkmb])$/);
  if (!match) return 0;
  const decimals = (match[2] ?? '').length;
  const suffix = match[3].toUpperCase();
  const unit = suffix === 'K' ? 1_000 : suffix === 'M' ? 1_000_000 : 1_000_000_000;
  return (unit / 10 ** decimals) / 2;
}

/**
 * 저장할 회원 수를 정한다.
 * - 관측값이 없으면 저장된 값을 그대로 둔다.
 * - 정확한 관측(tolerance 0)이면 항상 그 값으로 갱신한다.
 * - 축약 관측이면, 저장된 값이 반올림 오차 안에 있을 때는 저장된 값을 지킨다(정확한 값을 근사값으로 덮지 않음).
 *   오차를 벗어나면 실제로 변했다는 뜻이므로 축약값으로 갱신한다.
 */
export function resolveMemberCount(input: {
  stored: number | null | undefined;
  observed: number | null | undefined;
  /** 관측값의 반올림 오차. 정확한 값이면 0 */
  tolerance?: number;
}): number | null {
  const stored = input.stored ?? null;
  const observed = input.observed ?? null;
  if (observed == null) return stored;
  const tolerance = input.tolerance ?? 0;
  if (tolerance > 0 && stored != null && Math.abs(stored - observed) <= tolerance) {
    return stored;
  }
  return observed;
}
