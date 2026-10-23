import { LIGHT_PIPELINE_STEPS } from './stats-collect.logic';
import {
  canReuseStoredAccess,
  canSpendResolve,
  floodWaitUntilFromSeconds,
  isFloodWaitBlocking,
  isStoredAccessInvalid,
  mtprotoCallGapMs,
  RESOLVE_DAILY_LIMIT_DEFAULT,
  serializeAccessHash,
} from './mtproto-access.logic';

describe('저장된 access_hash', () => {
  it('채널 id 와 access_hash 가 있으면 Resolve 를 건너뛴다', () => {
    expect(
      canReuseStoredAccess({
        telegramChatId: 123456,
        telegramAccessHash: '9876543210',
      }),
    ).toBe(true);
    expect(
      canReuseStoredAccess({
        telegramChatId: 123456,
        telegramAccessHash: null,
      }),
    ).toBe(false);
    expect(
      canReuseStoredAccess({
        telegramChatId: null,
        telegramAccessHash: '9876543210',
      }),
    ).toBe(false);
    expect(serializeAccessHash(9876543210n)).toBe('9876543210');
    expect(isStoredAccessInvalid('CHANNEL_INVALID')).toBe(true);
  });
});

describe('ResolveUsername 하루 상한', () => {
  it('기본 50회를 넘으면 더 쓰지 않는다', () => {
    expect(RESOLVE_DAILY_LIMIT_DEFAULT).toBe(50);
    expect(canSpendResolve(49, 50)).toBe(true);
    expect(canSpendResolve(50, 50)).toBe(false);
  });
});

describe('FLOOD_WAIT 유지', () => {
  it('끝나기 전에는 MTProto 를 건너뛴다', () => {
    const started = new Date('2026-10-23T06:00:00.000Z');
    const until = floodWaitUntilFromSeconds(started, 12411);
    expect(
      isFloodWaitBlocking(until, new Date('2026-10-23T08:00:00.000Z')),
    ).toBe(true);
    expect(
      isFloodWaitBlocking(until, new Date('2026-10-24T10:00:00.000Z')),
    ).toBe(false);
  });
});

describe('요청 간격', () => {
  it('Resolve 와 Search 사이는 10초, 그 외는 1.5초다', () => {
    const now = 100_000;
    expect(
      mtprotoCallGapMs({
        method: 'channels.GetFullChannel',
        lastCallAt: now - 1_500,
        lastResolveOrSearchAt: now - 1_500,
        now,
      }),
    ).toBe(0);
    expect(
      mtprotoCallGapMs({
        method: 'contacts.ResolveUsername',
        lastCallAt: now - 1_500,
        lastResolveOrSearchAt: now - 1_500,
        now,
      }),
    ).toBe(8_500);
    expect(
      mtprotoCallGapMs({
        method: 'contacts.Search',
        lastCallAt: now - 10_000,
        lastResolveOrSearchAt: now - 10_000,
        now,
      }),
    ).toBe(0);
  });
});

describe('light 모드', () => {
  it('MTProto 단계를 쓰지 않는다', () => {
    expect(LIGHT_PIPELINE_STEPS).toEqual([
      'previewCollect',
      'clearPublicCache',
    ]);
    expect(LIGHT_PIPELINE_STEPS).not.toContain('collect');
  });
});
