export type WalletKind = 'ton' | 'usdt_trc20' | 'unknown';

/** 주소 모양으로 지갑 종류를 정합니다. 없으면 null. */
export function classifyWalletKind(
  address: string | null | undefined,
): WalletKind | null {
  const value = (address ?? '').trim();
  if (!value) return null;
  if (
    value.startsWith('EQ') ||
    value.startsWith('UQ') ||
    value.startsWith('kQ') ||
    value.startsWith('0:') ||
    value.startsWith('-1:')
  ) {
    return 'ton';
  }
  if (value.startsWith('T') && value.length === 34) return 'usdt_trc20';
  return 'unknown';
}
