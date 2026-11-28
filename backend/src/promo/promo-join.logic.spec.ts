import {
  classifyJoinError,
  isJoinDue,
  PROMO_JOIN_GAP_MIN,
} from './promo-join.logic';

describe('isJoinDue', () => {
  const now = Date.UTC(2026, 10, 28, 5);
  it('respects the daily limit and the gap', () => {
    expect(
      isJoinDue({
        nowMs: now,
        lastJoinAtMs: null,
        joinsToday: 0,
        dailyLimit: 5,
        jitterMin: 0,
      }),
    ).toBe(true);
    expect(
      isJoinDue({
        nowMs: now,
        lastJoinAtMs: null,
        joinsToday: 5,
        dailyLimit: 5,
        jitterMin: 0,
      }),
    ).toBe(false);
    expect(
      isJoinDue({
        nowMs: now,
        lastJoinAtMs: now - (PROMO_JOIN_GAP_MIN - 1) * 60_000,
        joinsToday: 1,
        dailyLimit: 5,
        jitterMin: 0,
      }),
    ).toBe(false);
    expect(
      isJoinDue({
        nowMs: now,
        lastJoinAtMs: now - (PROMO_JOIN_GAP_MIN + 1) * 60_000,
        joinsToday: 1,
        dailyLimit: 5,
        jitterMin: 0,
      }),
    ).toBe(true);
  });
});

describe('classifyJoinError', () => {
  it('sorts telegram errors', () => {
    expect(
      classifyJoinError(
        new Error('A wait of 120 seconds is required (FLOOD_WAIT_120)'),
      ).kind,
    ).toBe('flood');
    expect(classifyJoinError(new Error('400: INVITE_REQUEST_SENT')).kind).toBe(
      'requested',
    );
    expect(classifyJoinError(new Error('400: CHANNELS_TOO_MUCH')).kind).toBe(
      'too_many',
    );
    expect(classifyJoinError(new Error('400: PEER_FLOOD')).kind).toBe(
      'limited',
    );
    expect(
      classifyJoinError(new Error('400: USERNAME_NOT_OCCUPIED')).kind,
    ).toBe('skip');
  });
});
