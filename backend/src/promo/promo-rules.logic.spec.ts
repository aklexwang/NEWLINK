import {
  classifyPromoError,
  defaultTargetSettings,
  detectPromoRule,
  isPromoActiveHour,
  isTargetEligible,
  kstDayStart,
  pickNextTarget,
  PROMO_ROOM_DAILY_CAP,
  PROMO_ROOM_MIN_GAP_MIN,
} from './promo-rules.logic';

describe('detectPromoRule (방 소개글 규칙 읽기)', () => {
  it('하루 횟수', () => {
    expect(
      detectPromoRule('자유홍보방입니다. 1일 2회 홍보 가능').dailyLimit,
    ).toBe(2);
    expect(detectPromoRule('하루 3번까지 홍보').dailyLimit).toBe(3);
    expect(
      detectPromoRule('제휴 외 1일 1회 홍보 횟수기재 필수').dailyLimit,
    ).toBe(1);
  });
  it('간격', () => {
    expect(detectPromoRule('홍보는 3시간마다 1회').minGapMinutes).toBe(180);
    expect(detectPromoRule('6시간 간격으로 올려주세요').minGapMinutes).toBe(
      360,
    );
    expect(detectPromoRule('30분 마다 가능').minGapMinutes).toBe(30);
  });
  it('홍보 금지', () => {
    expect(detectPromoRule('타방 홍보 금지, 도배 금지').forbidden).toBe(true);
    expect(detectPromoRule('광고 금지입니다').forbidden).toBe(true);
    expect(detectPromoRule('홍보❌ 소통만').forbidden).toBe(true);
    // 홍보 자체가 아닌 금지는 금지 아님
    expect(
      detectPromoRule('자유홍보방 · 도배 금지 · 마약 금지').forbidden,
    ).toBe(false);
  });
  it('빈 소개글', () => {
    expect(detectPromoRule('')).toEqual({
      dailyLimit: null,
      minGapMinutes: null,
      forbidden: false,
      matched: null,
    });
  });
});

describe('defaultTargetSettings (우리 안전 한도)', () => {
  it('규칙 없으면 하루 1회, 최소 간격', () => {
    expect(defaultTargetSettings(detectPromoRule(''))).toEqual({
      dailyLimit: 1,
      minGapMinutes: 12 * 60,
    });
  });
  it('방이 하루 10번 허용해도 우리 한도까지', () => {
    const s = defaultTargetSettings({
      dailyLimit: 10,
      minGapMinutes: 30,
      forbidden: false,
      matched: null,
    });
    expect(s.dailyLimit).toBe(PROMO_ROOM_DAILY_CAP);
    expect(s.minGapMinutes).toBeGreaterThanOrEqual(PROMO_ROOM_MIN_GAP_MIN);
  });
  it('방 간격이 더 길면 방 규칙을 따름', () => {
    expect(
      defaultTargetSettings({
        dailyLimit: 2,
        minGapMinutes: 600,
        forbidden: false,
        matched: null,
      }).minGapMinutes,
    ).toBe(600);
  });
});

describe('보낼 방 고르기', () => {
  const now = Date.UTC(2026, 10, 21, 5, 0, 0);
  const base = {
    enabled: true,
    status: 'ok',
    dailyLimit: 2,
    minGapMinutes: 180,
    lastPostedAt: null,
    nextAllowedAt: null,
  };
  it('꺼진 방·막힌 방·오늘 다 쓴 방·간격 안 지난 방은 제외', () => {
    expect(isTargetEligible({ ...base, id: 'a', enabled: false }, 0, now)).toBe(
      false,
    );
    expect(
      isTargetEligible({ ...base, id: 'a', status: 'room_blocked' }, 0, now),
    ).toBe(false);
    expect(isTargetEligible({ ...base, id: 'a' }, 2, now)).toBe(false);
    expect(
      isTargetEligible(
        { ...base, id: 'a', lastPostedAt: new Date(now - 60 * 60_000) },
        1,
        now,
      ),
    ).toBe(false);
    expect(
      isTargetEligible(
        { ...base, id: 'a', lastPostedAt: new Date(now - 200 * 60_000) },
        1,
        now,
      ),
    ).toBe(true);
    expect(
      isTargetEligible(
        { ...base, id: 'a', nextAllowedAt: new Date(now + 60_000) },
        0,
        now,
      ),
    ).toBe(false);
  });
  it('방이 짧은 간격을 적어도 최소 간격은 지킴', () => {
    expect(
      isTargetEligible(
        {
          ...base,
          id: 'a',
          minGapMinutes: 10,
          lastPostedAt: new Date(now - 60 * 60_000),
        },
        1,
        now,
      ),
    ).toBe(false);
  });
  it('한 번도 안 보낸 방 → 가장 오래 전에 보낸 방 순', () => {
    const t = [
      { ...base, id: 'old', lastPostedAt: new Date(now - 900 * 60_000) },
      { ...base, id: 'never' },
      { ...base, id: 'older', lastPostedAt: new Date(now - 2000 * 60_000) },
    ];
    expect(pickNextTarget(t, new Map(), now)?.id).toBe('never');
    expect(
      pickNextTarget(
        t.filter((x) => x.id !== 'never'),
        new Map(),
        now,
      )?.id,
    ).toBe('older');
    expect(pickNextTarget([], new Map(), now)).toBeNull();
  });
});

describe('시간', () => {
  it('활동 시간 KST 10~23시', () => {
    expect(isPromoActiveHour(Date.UTC(2026, 10, 21, 0, 30))).toBe(false); // 09:30 KST
    expect(isPromoActiveHour(Date.UTC(2026, 10, 21, 1, 0))).toBe(true); // 10:00
    expect(isPromoActiveHour(Date.UTC(2026, 10, 21, 14, 0))).toBe(false); // 23:00
  });
  it('KST 오늘 0시', () => {
    expect(kstDayStart(Date.UTC(2026, 10, 21, 16, 0)).toISOString()).toBe(
      '2026-11-21T15:00:00.000Z',
    );
  });
});

describe('classifyPromoError', () => {
  it('분류', () => {
    expect(
      classifyPromoError(
        new Error(
          'A wait of 120 seconds is required (caused by messages.SendMedia)',
        ),
      ),
    ).toMatchObject({ kind: 'flood', seconds: 120 });
    expect(classifyPromoError('FLOOD_WAIT_300')).toMatchObject({
      kind: 'flood',
      seconds: 300,
    });
    expect(classifyPromoError('SLOWMODE_WAIT_60')).toMatchObject({
      kind: 'slowmode',
      seconds: 60,
    });
    expect(classifyPromoError('400: PEER_FLOOD').kind).toBe('account_limited');
    expect(classifyPromoError('403: CHAT_WRITE_FORBIDDEN').kind).toBe(
      'room_blocked',
    );
    expect(classifyPromoError('USER_BANNED_IN_CHANNEL').kind).toBe(
      'room_blocked',
    );
    expect(classifyPromoError('CHAT_SEND_PHOTOS_FORBIDDEN').kind).toBe(
      'no_media',
    );
    expect(classifyPromoError('AUTH_KEY_UNREGISTERED').kind).toBe('auth');
    expect(classifyPromoError('something').kind).toBe('other');
  });
});
