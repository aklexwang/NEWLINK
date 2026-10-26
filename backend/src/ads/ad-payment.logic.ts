import { BadRequestException } from '@nestjs/common';

/** 광고비(USDT)·받은 날·마감 알림 계산 */

/** "150", "150.5", "1,000" → 숫자. 비우면 null. 이상한 값은 undefined(오류) */
export function parseUsdt(raw: unknown): number | null | undefined {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'string' && typeof raw !== 'number') return undefined;
  const text = String(raw).replace(/,/g, '').trim();
  if (!text) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return undefined;
  const n = Number(text);
  return Number.isFinite(n) && n <= 10_000_000 ? n : undefined;
}

/** 'YYYY-MM-DD' 만. 비우면 null, 이상하면 undefined */
export function parsePaidOn(raw: unknown): string | null | undefined {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'string') return undefined;
  const text = raw.trim();
  if (!text) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return undefined;
  return Number.isFinite(new Date(`${text}T00:00:00+09:00`).getTime())
    ? text
    : undefined;
}

export function kstYmd(date: Date): string {
  return new Date(date.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
}

/**
 * 마감까지 남은 날. 종료 시각(endsAt)은 '마지막 날 다음 날 00:00' 이라
 * 마지막 노출일 = endsAt - 1ms. 오늘이 마지막 날이면 0, 이미 끝났으면 음수, 끝없으면 null.
 */
export function daysLeft(endsAt: Date | null, now = new Date()): number | null {
  if (!endsAt) return null;
  const last = kstYmd(new Date(endsAt.getTime() - 1));
  const today = kstYmd(now);
  return Math.round(
    (Date.parse(`${last}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) /
      86_400_000,
  );
}

/** 마감 알림 보낼 때인지: 마지막 날 3일 전부터 마지막 날까지 */
export const AD_EXPIRY_NOTICE_DAYS = 3;
export function shouldNotifyExpiry(left: number | null): boolean {
  return left !== null && left >= 0 && left <= AD_EXPIRY_NOTICE_DAYS;
}

export function expiryLabel(left: number): string {
  return left === 0 ? '오늘 마감' : `마감 ${left}일 전`;
}

/** 입력에 광고비·받은 날이 있으면 검사해서 넣는다 */
export function applyPayment(
  row: { paidUsdt?: number | null; paidOn?: string | null },
  input: { paidUsdt?: unknown; paidOn?: unknown },
): void {
  if (input.paidUsdt !== undefined) {
    const usdt = parseUsdt(input.paidUsdt);
    if (usdt === undefined)
      throw new BadRequestException(
        '받은 USDT 는 숫자로 넣어 주세요. 예: 150 또는 99.5',
      );
    row.paidUsdt = usdt;
  }
  if (input.paidOn !== undefined) {
    const on = parsePaidOn(input.paidOn);
    if (on === undefined)
      throw new BadRequestException('받은 날짜를 달력에서 골라 주세요.');
    row.paidOn = on;
  }
}
