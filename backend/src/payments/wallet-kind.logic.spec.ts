import { classifyWalletKind } from './wallet-kind.logic';

describe('classifyWalletKind', () => {
  it('EQ·UQ·kQ·0:·-1: 는 ton 이다', () => {
    expect(classifyWalletKind('EQabcdefghijklmnopqrstuvwxyz0123456789-_ABCDEF')).toBe(
      'ton',
    );
    expect(classifyWalletKind('UQabcdefghijklmnopqrstuvwxyz0123456789-_ABCDEF')).toBe(
      'ton',
    );
    expect(classifyWalletKind('kQabcdefghijklmnopqrstuvwxyz0123456789-_ABCDEF')).toBe(
      'ton',
    );
    expect(
      classifyWalletKind(
        '0:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      ),
    ).toBe('ton');
    expect(
      classifyWalletKind(
        '-1:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      ),
    ).toBe('ton');
  });

  it('T 로 시작하고 34자면 usdt_trc20 이다', () => {
    expect(classifyWalletKind('T' + 'A'.repeat(33))).toBe('usdt_trc20');
  });

  it('그 외는 unknown, 빈 값은 null 이다', () => {
    expect(classifyWalletKind('bc1qnotton')).toBe('unknown');
    expect(classifyWalletKind('')).toBeNull();
    expect(classifyWalletKind(null)).toBeNull();
  });
});
