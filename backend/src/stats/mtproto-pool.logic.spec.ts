import {
  accountStateId,
  allAccountsBlocked,
  earliestFloodRecovery,
  isAccountAvailable,
  parseSessionList,
  pickAccountIndexForRole,
  pickNextAccount,
  pickNextAccountExcluding,
  pickPinnedAccount,
  isJoinRequestMethod,
  scaledDailyLimit,
} from './mtproto-pool.logic';

describe('역할 분담 (요청 전용 계정)', () => {
  const now = new Date('2026-11-12T00:00:00Z');
  const free = { floodWaitUntil: null };
  const blocked = { floodWaitUntil: new Date('2026-11-12T01:00:00Z') };

  it('isJoinRequestMethod: ImportChatInvite 만 true', () => {
    expect(isJoinRequestMethod('messages.ImportChatInvite')).toBe(true);
    expect(isJoinRequestMethod('messages.CheckChatInvite')).toBe(false);
    expect(isJoinRequestMethod('contacts.ResolveUsername')).toBe(false);
  });

  it('pickNextAccountExcluding: 전용 계정은 건너뛴다', () => {
    // 0,1,2 모두 free, 2를 제외
    expect(pickNextAccountExcluding([free, free, free], 0, 2, now)).toBe(0);
    expect(pickNextAccountExcluding([free, free, free], 2, 2, now)).toBe(0);
    // 0,1 막힘, 2만 free인데 2 제외 → null
    expect(pickNextAccountExcluding([blocked, blocked, free], 0, 2, now)).toBeNull();
  });

  it('요청은 전용 계정(index2)으로만 간다', () => {
    const accounts = [free, free, free];
    expect(pickAccountIndexForRole({ accounts, pointer: 0, isRequest: true, requestIndex: 2, now })).toBe(2);
    expect(pickAccountIndexForRole({ accounts, pointer: 1, isRequest: true, requestIndex: 2, now })).toBe(2);
  });

  it('읽기는 전용 계정(index2)을 빼고 돈다', () => {
    const accounts = [free, free, free];
    expect(pickAccountIndexForRole({ accounts, pointer: 0, isRequest: false, requestIndex: 2, now })).toBe(0);
    expect(pickAccountIndexForRole({ accounts, pointer: 1, isRequest: false, requestIndex: 2, now })).toBe(1);
    // pointer가 전용 자리를 가리켜도 건너뜀
    expect(pickAccountIndexForRole({ accounts, pointer: 2, isRequest: false, requestIndex: 2, now })).toBe(0);
  });

  it('전용 계정 미지정이면 그냥 라운드로빈', () => {
    const accounts = [free, free];
    expect(pickAccountIndexForRole({ accounts, pointer: 0, isRequest: true, requestIndex: null, now })).toBe(0);
    expect(pickAccountIndexForRole({ accounts, pointer: 1, isRequest: false, requestIndex: null, now })).toBe(1);
  });

  it('전용 계정이 막히면 요청도 다른 계정으로 폴백', () => {
    const accounts = [free, free, blocked]; // 전용(2) 막힘
    expect(pickAccountIndexForRole({ accounts, pointer: 0, isRequest: true, requestIndex: 2, now })).toBe(0);
  });

  it('읽기 계정이 다 막히면 전용 계정이라도 써서 안 멈춘다', () => {
    const accounts = [blocked, blocked, free]; // 읽기(0,1) 막힘, 전용(2) 살아있음
    expect(pickAccountIndexForRole({ accounts, pointer: 0, isRequest: false, requestIndex: 2, now })).toBe(2);
  });
});

describe('pickPinnedAccount (비공개 방은 멤버 계정으로 고정)', () => {
  const now = new Date('2026-11-12T00:00:00Z');
  const free = { floodWaitUntil: null };
  const blocked = { floodWaitUntil: new Date('2026-11-12T01:00:00Z') };

  it('핀한 계정이 쓸 수 있으면 그 index', () => {
    expect(pickPinnedAccount([free, free, free], 2, now)).toBe(2);
    expect(pickPinnedAccount([free, free, free], 0, now)).toBe(0);
  });

  it('핀한 계정이 막혔으면 null(다른 계정으로 읽으면 안 됨 → 건너뜀)', () => {
    expect(pickPinnedAccount([free, free, blocked], 2, now)).toBeNull();
  });

  it('핀 index 가 null/범위밖이면 null(라운드로빈 폴백)', () => {
    expect(pickPinnedAccount([free, free], null, now)).toBeNull();
    expect(pickPinnedAccount([free, free], 5, now)).toBeNull();
    expect(pickPinnedAccount([free, free], -1, now)).toBeNull();
  });
});

describe('scaledDailyLimit (C: 계정 수만큼 한도 상향)', () => {
  it('미설정이면 base × 계정 수', () => {
    expect(scaledDailyLimit(null, 50, 1)).toBe(50);
    expect(scaledDailyLimit(null, 50, 2)).toBe(100);
    expect(scaledDailyLimit(0, 50, 3)).toBe(150);
  });
  it('계정 0개여도 최소 1배', () => {
    expect(scaledDailyLimit(null, 50, 0)).toBe(50);
  });
  it('env 로 명시한 값은 전체 한도로 존중(곱하지 않음)', () => {
    expect(scaledDailyLimit(200, 50, 3)).toBe(200);
  });
});

describe('parseSessionList', () => {
  it('단일 계정: TELEGRAM_SESSION 하나', () => {
    expect(parseSessionList({ TELEGRAM_SESSION: 's1' })).toEqual(['s1']);
  });

  it('없으면 빈 목록', () => {
    expect(parseSessionList({})).toEqual([]);
    expect(parseSessionList({ TELEGRAM_SESSION: '  ' })).toEqual([]);
  });

  it('_2.._N 을 넣은 순서대로 이어 붙인다', () => {
    expect(
      parseSessionList({
        TELEGRAM_SESSION: 'a',
        TELEGRAM_SESSION_2: 'b',
        TELEGRAM_SESSION_3: 'c',
      }),
    ).toEqual(['a', 'b', 'c']);
  });

  it('중간이 비어도 있는 것만 모은다', () => {
    expect(
      parseSessionList({
        TELEGRAM_SESSION: 'a',
        TELEGRAM_SESSION_3: 'c',
      }),
    ).toEqual(['a', 'c']);
  });

  it('TELEGRAM_SESSIONS 는 줄바꿈·콤마·세미콜론으로 나눈다', () => {
    expect(
      parseSessionList({ TELEGRAM_SESSIONS: 'a\nb, c; d' }),
    ).toEqual(['a', 'b', 'c', 'd']);
  });

  it('중복은 한 번만', () => {
    expect(
      parseSessionList({
        TELEGRAM_SESSION: 'a',
        TELEGRAM_SESSION_2: 'a',
        TELEGRAM_SESSIONS: 'a,b',
      }),
    ).toEqual(['a', 'b']);
  });

  it('앞뒤 공백 제거', () => {
    expect(parseSessionList({ TELEGRAM_SESSION: '  x  ' })).toEqual(['x']);
  });
});

describe('accountStateId', () => {
  it('첫 계정은 기존 행 id=1 을 그대로 쓴다', () => {
    expect(accountStateId(0)).toBe(1);
    expect(accountStateId(1)).toBe(2);
    expect(accountStateId(4)).toBe(5);
  });
});

describe('isAccountAvailable', () => {
  const now = new Date('2026-11-10T00:00:00Z');
  it('FloodWait 없으면 쓸 수 있다', () => {
    expect(isAccountAvailable({ floodWaitUntil: null }, now)).toBe(true);
  });
  it('FloodWait 미래면 못 쓴다', () => {
    expect(
      isAccountAvailable(
        { floodWaitUntil: new Date('2026-11-10T00:10:00Z') },
        now,
      ),
    ).toBe(false);
  });
  it('FloodWait 이 이미 지났으면 쓸 수 있다', () => {
    expect(
      isAccountAvailable(
        { floodWaitUntil: new Date('2026-11-09T23:50:00Z') },
        now,
      ),
    ).toBe(true);
  });
  it('인증 중단 계정은 못 쓴다', () => {
    expect(
      isAccountAvailable({ floodWaitUntil: null, authStopped: true }, now),
    ).toBe(false);
  });
});

describe('pickNextAccount (라운드로빈)', () => {
  const now = new Date('2026-11-10T00:00:00Z');
  const free = { floodWaitUntil: null };
  const blocked = { floodWaitUntil: new Date('2026-11-10T01:00:00Z') };

  it('빈 풀은 null', () => {
    expect(pickNextAccount([], 0, now)).toBeNull();
  });

  it('단일 계정: 쓸 수 있으면 0, 막히면 null', () => {
    expect(pickNextAccount([free], 0, now)).toBe(0);
    expect(pickNextAccount([blocked], 0, now)).toBeNull();
  });

  it('pointer 다음 자리부터 돈다', () => {
    const accounts = [free, free, free];
    expect(pickNextAccount(accounts, 0, now)).toBe(0);
    expect(pickNextAccount(accounts, 1, now)).toBe(1);
    expect(pickNextAccount(accounts, 2, now)).toBe(2);
    expect(pickNextAccount(accounts, 3, now)).toBe(0);
  });

  it('막힌 계정은 건너뛰고 다음 쓸 수 있는 계정', () => {
    // 0 막힘, 1 free, 2 막힘
    const accounts = [blocked, free, blocked];
    expect(pickNextAccount(accounts, 0, now)).toBe(1);
    expect(pickNextAccount(accounts, 2, now)).toBe(1);
  });

  it('전부 막히면 null', () => {
    expect(pickNextAccount([blocked, blocked], 0, now)).toBeNull();
  });
});

describe('allAccountsBlocked', () => {
  const now = new Date('2026-11-10T00:00:00Z');
  const free = { floodWaitUntil: null };
  const blocked = { floodWaitUntil: new Date('2026-11-10T01:00:00Z') };

  it('빈 풀은 막힘으로 본다', () => {
    expect(allAccountsBlocked([], now)).toBe(true);
  });
  it('하나라도 쓸 수 있으면 false', () => {
    expect(allAccountsBlocked([blocked, free], now)).toBe(false);
  });
  it('전부 막히면 true', () => {
    expect(allAccountsBlocked([blocked, blocked], now)).toBe(true);
  });
});

describe('earliestFloodRecovery', () => {
  const now = new Date('2026-11-10T00:00:00Z');
  const free = { floodWaitUntil: null };

  it('쓸 수 있는 계정이 있으면 null', () => {
    expect(
      earliestFloodRecovery(
        [free, { floodWaitUntil: new Date('2026-11-10T01:00:00Z') }],
        now,
      ),
    ).toBeNull();
  });

  it('전부 막혔을 때 가장 이른 해제 시각', () => {
    const a = { floodWaitUntil: new Date('2026-11-10T02:00:00Z') };
    const b = { floodWaitUntil: new Date('2026-11-10T00:30:00Z') };
    expect(earliestFloodRecovery([a, b], now)).toEqual(
      new Date('2026-11-10T00:30:00Z'),
    );
  });

  it('인증 중단 계정은 해제 후보에서 빼고, 모두 인증 중단이면 null', () => {
    expect(
      earliestFloodRecovery(
        [{ floodWaitUntil: null, authStopped: true }],
        now,
      ),
    ).toBeNull();
  });
});
