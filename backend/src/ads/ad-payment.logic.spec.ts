import {
  daysLeft,
  parsePaidOn,
  parseUsdt,
  shouldNotifyExpiry,
} from './ad-payment.logic';

const kst = (s: string) => new Date(`${s}+09:00`);

describe('ad-payment.logic', () => {
  it('USDT 금액', () => {
    expect(parseUsdt('1,500')).toBe(1500);
    expect(parseUsdt('99.5')).toBe(99.5);
    expect(parseUsdt('')).toBeNull();
    expect(parseUsdt('abc')).toBeUndefined();
    expect(parseUsdt('1.234')).toBeUndefined();
  });

  it('받은 날', () => {
    expect(parsePaidOn('2026-10-26')).toBe('2026-10-26');
    expect(parsePaidOn('')).toBeNull();
    expect(parsePaidOn('10/26')).toBeUndefined();
  });

  it('마감까지 남은 날: 종료일 10/31(= 11/1 00:00 KST)', () => {
    const endsAt = kst('2026-11-01T00:00:00');
    expect(daysLeft(endsAt, kst('2026-10-28T09:00:00'))).toBe(3);
    expect(daysLeft(endsAt, kst('2026-10-31T23:59:00'))).toBe(0);
    expect(daysLeft(endsAt, kst('2026-11-01T00:00:01'))).toBe(-1);
    expect(daysLeft(null)).toBeNull();
  });

  it('3일 전부터 마지막 날까지만 알림', () => {
    expect(shouldNotifyExpiry(4)).toBe(false);
    expect(shouldNotifyExpiry(3)).toBe(true);
    expect(shouldNotifyExpiry(0)).toBe(true);
    expect(shouldNotifyExpiry(-1)).toBe(false);
    expect(shouldNotifyExpiry(null)).toBe(false);
  });
});
