import { isTelegramRestricted } from './telegram-restricted.logic';

describe('isTelegramRestricted', () => {
  it('is false for normal chats', () => {
    expect(isTelegramRestricted({})).toBe(false);
    expect(isTelegramRestricted(null)).toBe(false);
  });
  it('is true for app-wide restrictions', () => {
    expect(
      isTelegramRestricted({
        restricted: true,
        restrictionReason: [
          { platform: 'android', reason: 'terms' },
          { platform: 'ios', reason: 'terms' },
        ],
      }),
    ).toBe(true);
    expect(
      isTelegramRestricted({
        restricted: true,
        restrictionReason: [{ platform: 'all', reason: 'porn' }],
      }),
    ).toBe(true);
    expect(isTelegramRestricted({ restricted: true })).toBe(true);
  });
  it('ignores restrictions for other platforms only', () => {
    expect(
      isTelegramRestricted({
        restricted: true,
        restrictionReason: [{ platform: 'web', reason: 'x' }],
      }),
    ).toBe(false);
  });
});
