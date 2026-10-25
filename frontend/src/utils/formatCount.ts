import { formatNumber } from './memberDisplay';

/** 조회수·메시지 수 같은 일반 숫자. K/M 로 줄이지 않고 천 단위 쉼표로 정확히 보여 준다 */
export function formatCount(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return formatNumber(value);
}

export function formatPercent(ratio: number | null | undefined, digits = 1): string {
  if (ratio == null || !Number.isFinite(ratio)) return '—';
  return `${(ratio * 100).toFixed(digits)}%`;
}

export function formatRelativeKo(iso: string | null | undefined): string {
  if (!iso) return '게시 시각 없음';
  const at = new Date(iso).getTime();
  if (Number.isNaN(at)) return '게시 시각 없음';
  const diff = Date.now() - at;
  if (diff < 60_000) return '방금 전';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}분 전`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}시간 전`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}일 전`;
  return new Date(iso).toLocaleDateString('ko-KR');
}
