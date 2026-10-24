import type { AdminPayoutMethod } from '../api/admin';

export function formatPayoutAmount(currency: string, amount: number): string {
  const code = currency.toUpperCase();
  const n = Number(amount);
  if (!Number.isFinite(n)) return '0';
  if (code === 'STARS') return String(Math.trunc(n));
  const rounded = Math.round(n * 10000) / 10000;
  return rounded.toFixed(4).replace(/\.?0+$/, '');
}

export function walletKindLabel(kind: string | null | undefined): string {
  if (kind === 'ton') return 'TON';
  if (kind === 'usdt_trc20') return 'USDT TRC-20';
  return '미등록';
}

export function payoutWalletMismatch(
  walletKind: string | null | undefined,
  method: Pick<AdminPayoutMethod, 'currency' | 'destinationKind' | 'network'>,
): string | null {
  if (method.destinationKind === 'telegram_account') return null;
  const code = method.currency.toUpperCase();
  const network = (method.network ?? '').toLowerCase();
  if (code === 'TON' && walletKind && walletKind !== 'ton') {
    return '회원 지갑이 TON이 아닙니다.';
  }
  if ((code === 'USDT' || network === 'trc20') && walletKind && walletKind !== 'usdt_trc20') {
    return '회원 지갑이 USDT TRC-20이 아닙니다.';
  }
  if ((code === 'TON' || code === 'USDT') && !walletKind) {
    return '회원 지갑이 없거나 종류를 알 수 없습니다.';
  }
  return null;
}

export function payoutStatusLabel(status: string): string {
  if (status === 'sending') return '확인 필요';
  if (status === 'paid') return '지급 완료';
  if (status === 'failed') return '실패';
  if (status === 'void') return '취소';
  return status;
}
