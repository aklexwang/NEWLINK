export type UserPayoutTotals = {
  payoutCount: number;
  payoutTon: number;
  payoutUsdt: number;
  payoutStars: number;
};

export function emptyUserPayoutTotals(): UserPayoutTotals {
  return {
    payoutCount: 0,
    payoutTon: 0,
    payoutUsdt: 0,
    payoutStars: 0,
  };
}

/** TON·USDT는 소수 4자리, Stars는 정수. */
export function normalizePayoutAmount(currency: string, raw: number): number {
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('지급 수량을 확인해 주세요.');
  }
  const code = currency.toUpperCase();
  if (code === 'STARS') {
    if (!Number.isInteger(amount)) {
      throw new Error('Stars 는 정수만 기록합니다.');
    }
    return amount;
  }
  return Math.round(amount * 10000) / 10000;
}

export function formatPayoutAmount(currency: string, amount: number): string {
  const code = currency.toUpperCase();
  const n = Number(amount);
  if (!Number.isFinite(n)) return '0';
  if (code === 'STARS') return String(Math.trunc(n));
  const rounded = Math.round(n * 10000) / 10000;
  return rounded.toFixed(4).replace(/\.?0+$/, '');
}

export function addPaidAmount(
  totals: UserPayoutTotals,
  currency: string,
  amount: number,
): UserPayoutTotals {
  const next = { ...totals };
  const code = currency.toUpperCase();
  const value = Number(amount) || 0;
  if (value <= 0) return next;
  next.payoutCount += 1;
  if (code === 'TON') next.payoutTon += value;
  else if (code === 'USDT') next.payoutUsdt += value;
  else if (code === 'STARS') next.payoutStars += value;
  return next;
}

export function payoutWalletMismatch(
  walletKind: string | null | undefined,
  method: {
    currency: string;
    destinationKind: string;
    network?: string | null;
  },
): string | null {
  if (method.destinationKind === 'telegram_account') return null;
  const code = method.currency.toUpperCase();
  const network = (method.network ?? '').toLowerCase();
  if (code === 'TON' && walletKind && walletKind !== 'ton') {
    return '회원 지갑이 TON이 아닙니다.';
  }
  if (
    (code === 'USDT' || network === 'trc20') &&
    walletKind &&
    walletKind !== 'usdt_trc20'
  ) {
    return '회원 지갑이 USDT TRC-20이 아닙니다.';
  }
  if ((code === 'TON' || code === 'USDT') && !walletKind) {
    return '회원 지갑이 없거나 종류를 알 수 없습니다.';
  }
  return null;
}
