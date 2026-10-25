// 회원 화면의 회원 수·증감 표시 규칙. 화면 어디서든 이 함수만 쓴다.
// Node 테스트로도 돌릴 수 있게 다른 파일을 가져오지 않는다.

/** 증감을 보여 주는 기간 */
export type GrowthPeriod = '24시간' | '7일' | '30일';

const MINUS = '\u2212';

/** 1234567 → "1,234,567". 축약(K/M) 없이 정확한 값. 값이 없으면 빈 문자열 */
export function formatNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '';
  const rounded = Math.round(value);
  const sign = rounded < 0 ? '-' : '';
  return sign + String(Math.abs(rounded)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** "2,500명". 값이 없으면 null */
export function formatMemberNumber(value: number | null | undefined): string | null {
  const text = formatNumber(value);
  return text ? `${text}명` : null;
}

/** "회원 2,500명". 채널·그룹 모두 "회원". 값이 없으면 "회원 수 미집계" */
export function formatMembers(value: number | null | undefined): string {
  const text = formatMemberNumber(value);
  return text ? `회원 ${text}` : '회원 수 미집계';
}

/**
 * 서버가 준 증가율(현재 값 ÷ 기준일 값 − 1)로 회원 증감 수를 되돌린다.
 * 기준일 값 = 현재 ÷ (1 + 증가율). 값이 없거나 계산할 수 없으면 null.
 */
export function memberDeltaFromGrowth(
  memberCount: number | null | undefined,
  growth: number | null | undefined,
): number | null {
  if (memberCount == null || growth == null) return null;
  if (!Number.isFinite(memberCount) || !Number.isFinite(growth)) return null;
  if (growth <= -1) return null;
  const baseline = memberCount / (1 + growth);
  const delta = Math.round(memberCount - baseline);
  return delta === 0 ? 0 : delta;
}

/** 서버의 정확한 증감 수가 있으면 그것을, 없으면 증가율에서 되돌린 값을 쓴다 */
export function resolveMemberDelta(
  exactDelta: number | null | undefined,
  memberCount: number | null | undefined,
  growth: number | null | undefined,
): number | null {
  if (exactDelta != null && Number.isFinite(exactDelta)) return Math.round(exactDelta);
  return memberDeltaFromGrowth(memberCount, growth);
}

/** "+120명" / "−30명" / "변화 없음". 증감 값이 없으면 null */
export function formatSignedMembers(delta: number | null | undefined): string | null {
  if (delta == null || !Number.isFinite(delta)) return null;
  const rounded = Math.round(delta);
  if (rounded === 0) return '변화 없음';
  const abs = formatNumber(Math.abs(rounded));
  return rounded > 0 ? `+${abs}명` : `${MINUS}${abs}명`;
}

/** "7일 +120명" / "7일 −30명" / "7일 변화 없음". 값이 없으면 null (표시를 숨긴다) */
export function formatDeltaLine(
  period: GrowthPeriod,
  delta: number | null | undefined,
): string | null {
  const signed = formatSignedMembers(delta);
  return signed ? `${period} ${signed}` : null;
}

/** 증가율과 현재 회원 수로 바로 "7일 +120명" 문구를 만든다 */
export function formatGrowthLine(
  period: GrowthPeriod,
  memberCount: number | null | undefined,
  growth: number | null | undefined,
): string | null {
  return formatDeltaLine(period, memberDeltaFromGrowth(memberCount, growth));
}

export type DeltaTone = 'up' | 'down' | 'flat';

export function deltaTone(delta: number | null | undefined): DeltaTone {
  if (delta == null || !Number.isFinite(delta) || Math.round(delta) === 0) return 'flat';
  return delta > 0 ? 'up' : 'down';
}

/** 서버가 보내는 문구(랭킹 안내 등)에 남은 옛 표현을 화면 표현으로 바꾼다 */
export function normalizeMemberWording(text: string): string {
  return text.replace(/구독자/g, '회원 수');
}
