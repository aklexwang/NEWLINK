export type WalletNetworkKind = 'ton' | 'unknown';

export interface WalletAddressInfo {
  kind: WalletNetworkKind;
  /** Short badge text, e.g. TON */
  badge: string;
  /** Human label for admins */
  label: string;
  /** Extra caution line */
  hint: string;
  valid: boolean;
}

const TON_FRIENDLY_RE = /^(EQ|UQ|kQ)[A-Za-z0-9_-]{46}$/;
const TON_RAW_RE = /^(0:|-1:)[a-fA-F0-9]{64}$/;

/** Detect which chain/coin family an address belongs to (for admin safety). */
export function identifyWalletAddress(address: string | null | undefined): WalletAddressInfo {
  const value = (address ?? '').trim();
  if (!value) {
    return {
      kind: 'unknown',
      badge: '없음',
      label: '주소 없음',
      hint: '등록된 지갑이 없습니다.',
      valid: false,
    };
  }

  if (TON_FRIENDLY_RE.test(value) || TON_RAW_RE.test(value)) {
    return {
      kind: 'ton',
      badge: 'TON',
      label: 'TON 네트워크 · Gram(구 Toncoin)',
      hint: '이더리움·트론·비트코인 주소가 아닙니다. TON/Gram만 보내세요.',
      valid: true,
    };
  }

  return {
    kind: 'unknown',
    badge: '미확인',
    label: '형식 미확인 주소',
    hint: 'TON(UQ/EQ) 형식이 아닙니다. 송금 전 반드시 확인하세요.',
    valid: false,
  };
}

export function isTonWalletAddress(address: string | null | undefined): boolean {
  return identifyWalletAddress(address).kind === 'ton';
}
