import { telegramIdKey, telegramIdsEqual } from './telegram-id';

describe('telegramIdKey', () => {
  it('숫자·문자열·bigint 를 같은 키로 맞춘다', () => {
    expect(telegramIdKey(123)).toBe('123');
    expect(telegramIdKey('123')).toBe('123');
    expect(telegramIdKey(123n)).toBe('123');
    expect(telegramIdKey(' 123 ')).toBe('123');
  });

  it('빈 값은 빈 문자열이다', () => {
    expect(telegramIdKey(null)).toBe('');
    expect(telegramIdKey(undefined)).toBe('');
    expect(telegramIdKey('')).toBe('');
  });

  it('큰 정수도 문자열로 유지한다', () => {
    expect(telegramIdKey('9007199254740993')).toBe('9007199254740993');
  });
});

describe('telegramIdsEqual', () => {
  it('타입이 달라도 같은 아이디면 같다', () => {
    expect(telegramIdsEqual(42, '42')).toBe(true);
    expect(telegramIdsEqual(42n, 42)).toBe(true);
    expect(telegramIdsEqual('7', 8)).toBe(false);
    expect(telegramIdsEqual(null, 1)).toBe(false);
  });
});
