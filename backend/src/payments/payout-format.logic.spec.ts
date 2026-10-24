import {
  addPaidAmount,
  emptyUserPayoutTotals,
  formatPayoutAmount,
  normalizePayoutAmount,
  payoutWalletMismatch,
} from './payout-format.logic';

describe('normalizePayoutAmount', () => {
  it('TON·USDT는 소수 4자리로 맞춘다', () => {
    expect(normalizePayoutAmount('TON', 1.23456)).toBe(1.2346);
    expect(normalizePayoutAmount('USDT', 2)).toBe(2);
  });

  it('Stars는 정수만 받는다', () => {
    expect(normalizePayoutAmount('STARS', 50)).toBe(50);
    expect(() => normalizePayoutAmount('STARS', 1.5)).toThrow(/정수/);
  });
});

describe('formatPayoutAmount', () => {
  it('최대 4자리와 Stars 정수를 지킨다', () => {
    expect(formatPayoutAmount('TON', 1.2)).toBe('1.2');
    expect(formatPayoutAmount('USDT', 1.23456)).toBe('1.2346');
    expect(formatPayoutAmount('STARS', 50.9)).toBe('50');
  });
});

describe('회원 합계는 paid 만', () => {
  it('수단별로 더한다', () => {
    let totals = emptyUserPayoutTotals();
    totals = addPaidAmount(totals, 'TON', 1.5);
    totals = addPaidAmount(totals, 'USDT', 2);
    totals = addPaidAmount(totals, 'STARS', 50);
    expect(totals).toEqual({
      payoutCount: 3,
      payoutTon: 1.5,
      payoutUsdt: 2,
      payoutStars: 50,
    });
  });
});

describe('payoutWalletMismatch', () => {
  it('지갑 종류와 수단이 다르면 경고한다', () => {
    expect(
      payoutWalletMismatch('usdt_trc20', {
        currency: 'TON',
        destinationKind: 'wallet_address',
      }),
    ).toMatch(/TON/);
    expect(
      payoutWalletMismatch('ton', {
        currency: 'USDT',
        destinationKind: 'wallet_address',
        network: 'trc20',
      }),
    ).toMatch(/TRC-20/);
    expect(
      payoutWalletMismatch('ton', {
        currency: 'STARS',
        destinationKind: 'telegram_account',
      }),
    ).toBeNull();
  });
});
