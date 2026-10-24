import {
  COLLECT_DAILY_MIN_MEMBERS,
  isCollectDueToday,
  isNewChannelDailyWindow,
  kstWeekdayIndex,
  NEW_CHANNEL_DAILY_DAYS,
  resolveCollectTier,
  weeklyCollectBucket,
} from './collect-tier.logic';

describe('collect_tier', () => {
  it('최근 7일 글이 있거나 인원 1000명 이상이면 daily 이다', () => {
    expect(COLLECT_DAILY_MIN_MEMBERS).toBe(1_000);
    expect(resolveCollectTier({ memberCount: 999, posts7d: 0 })).toBe('weekly');
    expect(resolveCollectTier({ memberCount: 1000, posts7d: 0 })).toBe('daily');
    expect(resolveCollectTier({ memberCount: 10, posts7d: 1 })).toBe('daily');
  });

  it('weekly 는 채널 id 로 요일을 나눈다', () => {
    const a = weeklyCollectBucket('aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa');
    const b = weeklyCollectBucket('bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb');
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(7);
    expect(b).toBeGreaterThanOrEqual(0);
    expect(b).toBeLessThan(7);
    expect(
      isCollectDueToday({
        id: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
        memberCount: 10,
        posts7d: 0,
        weekday: a,
      }),
    ).toBe(true);
    expect(
      isCollectDueToday({
        id: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
        memberCount: 10,
        posts7d: 0,
        weekday: (a + 1) % 7,
      }),
    ).toBe(false);
    expect(
      isCollectDueToday({
        id: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
        memberCount: 2000,
        posts7d: 0,
        weekday: (a + 1) % 7,
      }),
    ).toBe(true);
  });

  it('등록 후 7일은 인원과 상관없이 daily 이다', () => {
    expect(NEW_CHANNEL_DAILY_DAYS).toBe(7);
    const createdAt = new Date('2026-10-24T00:00:00+09:00');
    const now = new Date('2026-10-30T00:00:00+09:00');
    expect(isNewChannelDailyWindow(createdAt, now)).toBe(true);
    expect(
      resolveCollectTier({
        memberCount: 10,
        posts7d: 0,
        createdAt,
        now,
      }),
    ).toBe('daily');
    expect(
      isCollectDueToday({
        id: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
        memberCount: 10,
        posts7d: 0,
        createdAt,
        now,
        weekday: 0,
      }),
    ).toBe(true);
    const after = new Date('2026-10-31T00:00:00+09:00');
    expect(isNewChannelDailyWindow(createdAt, after)).toBe(false);
    expect(
      resolveCollectTier({
        memberCount: 10,
        posts7d: 0,
        createdAt,
        now: after,
      }),
    ).toBe('weekly');
  });

  it('KST 요일은 0~6 이다', () => {
    const day = kstWeekdayIndex(new Date('2026-10-23T12:00:00+09:00'));
    expect(day).toBe(5);
  });
});
