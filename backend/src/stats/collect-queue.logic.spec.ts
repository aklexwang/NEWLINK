import {
  nextFullWindowAt,
  COLLECT_BAND_INTERVAL_MS,
  FAIL_BACKOFF_MAX_MS,
  failureBackoffMultiplier,
  isCollectDue,
  nextCollectAtAfterFailure,
  nextCollectAtAfterInvalid,
  nextCollectAtAfterInviteExpired,
  nextCollectAtAfterSuccess,
  resolveCollectBand,
  summarizeCollectQueue,
} from './collect-queue.logic';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = new Date('2026-10-26T00:00:00Z');
const OLD = new Date(NOW.getTime() - 30 * DAY);

describe('수집 구간(목표 간격) 분류', () => {
  it('구간별 목표 간격은 12h · 24h · 48h · 72h 이다', () => {
    expect(COLLECT_BAND_INTERVAL_MS).toEqual({
      hot: 12 * HOUR,
      normal: 24 * HOUR,
      quiet: 48 * HOUR,
      dormant: 72 * HOUR,
    });
  });

  it('핫: 신규 7일 · 회원 1만 이상 · 7일 게시 28 이상', () => {
    const base = { memberCount: 50, posts7d: 0, createdAt: OLD };
    expect(
      resolveCollectBand(
        { ...base, createdAt: new Date(NOW.getTime() - 6 * DAY) },
        NOW,
      ),
    ).toBe('hot');
    expect(
      resolveCollectBand(
        { ...base, createdAt: new Date(NOW.getTime() - 7 * DAY) },
        NOW,
      ),
    ).toBe('dormant');
    expect(resolveCollectBand({ ...base, memberCount: 10_000 }, NOW)).toBe(
      'hot',
    );
    expect(resolveCollectBand({ ...base, memberCount: 9_999 }, NOW)).toBe(
      'normal',
    );
    expect(resolveCollectBand({ ...base, posts7d: 28 }, NOW)).toBe('hot');
    expect(resolveCollectBand({ ...base, posts7d: 27 }, NOW)).toBe('normal');
  });

  it('보통: 7일 게시 7~27 · 회원 1천 이상 · 그룹', () => {
    const base = { memberCount: 50, posts7d: 0, createdAt: OLD };
    expect(resolveCollectBand({ ...base, posts7d: 7 }, NOW)).toBe('normal');
    expect(resolveCollectBand({ ...base, posts7d: 6 }, NOW)).toBe('quiet');
    expect(resolveCollectBand({ ...base, memberCount: 1_000 }, NOW)).toBe(
      'normal',
    );
    expect(resolveCollectBand({ ...base, memberCount: 999 }, NOW)).toBe(
      'dormant',
    );
    // 그룹은 게시가 0이고 작아도 보통
    expect(resolveCollectBand({ ...base, linkType: 'group' }, NOW)).toBe(
      'normal',
    );
    expect(resolveCollectBand({ ...base, linkType: 'channel' }, NOW)).toBe(
      'dormant',
    );
  });

  it('조용: 게시 1~6 / 휴면: 게시 0 이고 1천 미만', () => {
    const base = { memberCount: 500, createdAt: OLD };
    expect(resolveCollectBand({ ...base, posts7d: 1 }, NOW)).toBe('quiet');
    expect(resolveCollectBand({ ...base, posts7d: 6 }, NOW)).toBe('quiet');
    expect(resolveCollectBand({ ...base, posts7d: 0 }, NOW)).toBe('dormant');
    // 값이 비어 있으면 0 으로 본다
    expect(resolveCollectBand({ createdAt: OLD }, NOW)).toBe('dormant');
  });

  it('구간이 겹치면 위(핫)가 이긴다', () => {
    expect(
      resolveCollectBand(
        { memberCount: 20_000, posts7d: 0, linkType: 'group', createdAt: OLD },
        NOW,
      ),
    ).toBe('hot');
  });
});

describe('다음 수집 시각 · 실패 백오프', () => {
  const hotChannel = { memberCount: 50_000, posts7d: 3, createdAt: OLD };
  const dormantChannel = { memberCount: 10, posts7d: 0, createdAt: OLD };

  it('성공하면 지금 + 목표 간격', () => {
    expect(nextCollectAtAfterSuccess(hotChannel, NOW).getTime()).toBe(
      NOW.getTime() + 12 * HOUR,
    );
    expect(nextCollectAtAfterSuccess(dormantChannel, NOW).getTime()).toBe(
      NOW.getTime() + 72 * HOUR,
    );
  });

  it('실패 횟수에 따라 1배 · 2배 · 4배', () => {
    expect([0, 1, 2, 3, 4, 10].map(failureBackoffMultiplier)).toEqual([
      1, 1, 2, 4, 4, 4,
    ]);
    expect(failureBackoffMultiplier(null)).toBe(1);
    expect(failureBackoffMultiplier(undefined)).toBe(1);

    const waits = [1, 2, 3].map(
      (fails) =>
        nextCollectAtAfterFailure(hotChannel, fails, NOW).getTime() -
        NOW.getTime(),
    );
    expect(waits).toEqual([12 * HOUR, 24 * HOUR, 48 * HOUR]);
  });

  it('실패 간격은 최대 7일', () => {
    const wait =
      nextCollectAtAfterFailure(dormantChannel, 5, NOW).getTime() -
      NOW.getTime();
    // 72h x 4 = 12일 → 7일로 잘린다
    expect(wait).toBe(FAIL_BACKOFF_MAX_MS);
    expect(FAIL_BACKOFF_MAX_MS).toBe(7 * DAY);
    const quiet = nextCollectAtAfterFailure(
      { memberCount: 10, posts7d: 2, createdAt: OLD },
      3,
      NOW,
    );
    expect(quiet.getTime() - NOW.getTime()).toBe(7 * DAY);
  });

  it('만료된 초대 링크 7일, invalid 7일 규칙', () => {
    expect(nextCollectAtAfterInviteExpired(NOW).getTime()).toBe(
      NOW.getTime() + 7 * DAY,
    );
    expect(nextCollectAtAfterInvalid(NOW).getTime()).toBe(
      NOW.getTime() + 7 * DAY,
    );
  });

  it('NULL 이거나 지났으면 바로 대상', () => {
    expect(isCollectDue(null, NOW)).toBe(true);
    expect(isCollectDue(undefined, NOW)).toBe(true);
    expect(isCollectDue(new Date(NOW.getTime() - 1), NOW)).toBe(true);
    expect(isCollectDue(NOW, NOW)).toBe(true);
    expect(isCollectDue(new Date(NOW.getTime() + 1), NOW)).toBe(false);
  });
});

describe('수집 운영 요약', () => {
  it('구간별 채널 수 · 밀린 수 · 다음 24시간 예상 수집 수', () => {
    const rows = [
      // 핫 12h: 밀림 → 지금 1번 + 12시간 뒤 1번 = 2
      { memberCount: 50_000, posts7d: 0, createdAt: OLD, nextCollectAt: null },
      // 핫 12h: 6시간 뒤 예정 → 6h, 18h = 2
      {
        memberCount: 50_000,
        posts7d: 0,
        createdAt: OLD,
        nextCollectAt: new Date(NOW.getTime() + 6 * HOUR),
      },
      // 보통 24h: 3시간 전에 지났다 → 지금 1번 (다음은 24시간 뒤라 범위 밖)
      {
        memberCount: 2_000,
        posts7d: 0,
        createdAt: OLD,
        nextCollectAt: new Date(NOW.getTime() - 3 * HOUR),
      },
      // 조용 48h: 10시간 뒤 → 1
      {
        memberCount: 10,
        posts7d: 3,
        createdAt: OLD,
        nextCollectAt: new Date(NOW.getTime() + 10 * HOUR),
      },
      // 휴면 72h: 30시간 뒤 → 범위 밖 0
      {
        memberCount: 10,
        posts7d: 0,
        createdAt: OLD,
        nextCollectAt: new Date(NOW.getTime() + 30 * HOUR),
      },
      // 병합된 채널은 수집하지 않으니 센 적 없다
      {
        memberCount: 99_999,
        posts7d: 0,
        createdAt: OLD,
        collectStatus: 'merged',
      },
    ];
    const summary = summarizeCollectQueue(rows, NOW);

    expect(summary.total).toBe(5);
    expect(summary.bands.hot).toEqual({ count: 2, overdue: 1, expected24h: 4 });
    expect(summary.bands.normal).toEqual({
      count: 1,
      overdue: 1,
      expected24h: 1,
    });
    expect(summary.bands.quiet).toEqual({
      count: 1,
      overdue: 0,
      expected24h: 1,
    });
    expect(summary.bands.dormant).toEqual({
      count: 1,
      overdue: 0,
      expected24h: 0,
    });
    expect(summary.overdue).toBe(2);
    expect(summary.expected24h).toBe(6);
  });

  it('실패 중인 채널은 늘어난 간격으로 예상한다', () => {
    const summary = summarizeCollectQueue(
      [
        {
          memberCount: 50_000,
          posts7d: 0,
          createdAt: OLD,
          nextCollectAt: null,
          collectStatus: 'failed',
          collectFailCount: 3,
        },
      ],
      NOW,
    );
    // 12h x 4 = 48h 간격 → 지금 1번만
    expect(summary.expected24h).toBe(1);
  });

  it('7일 안에 확인한 만료 초대 링크는 NULL 이어도 밀린 것으로 세지 않는다', () => {
    const summary = summarizeCollectQueue(
      [
        {
          memberCount: 10,
          posts7d: 0,
          createdAt: OLD,
          nextCollectAt: null,
          collectStatus: 'invite_expired',
          lastCollectedAt: new Date(NOW.getTime() - 2 * DAY),
        },
      ],
      NOW,
    );
    expect(summary.overdue).toBe(0);
    expect(summary.expected24h).toBe(0);
  });
});

describe('light 가 못 읽은 채널은 다음 새벽 full 로 미룬다', () => {
  it('KST 03:00 전이면 오늘 03:00 KST', () => {
    // 2026-10-26 01:30 KST = 2026-10-25 16:30Z
    const at = nextFullWindowAt(new Date('2026-10-25T16:30:00Z'));
    expect(at.toISOString()).toBe('2026-10-25T18:00:00.000Z');
  });
  it('KST 03:00 이 지났으면 내일 03:00 KST', () => {
    // 2026-10-26 09:00 KST = 2026-10-26 00:00Z
    const at = nextFullWindowAt(new Date('2026-10-26T00:00:00Z'));
    expect(at.toISOString()).toBe('2026-10-26T18:00:00.000Z');
  });
  it('정확히 03:00 KST 면 다음 날', () => {
    const at = nextFullWindowAt(new Date('2026-10-25T18:00:00Z'));
    expect(at.toISOString()).toBe('2026-10-26T18:00:00.000Z');
  });
  it('밤 23:50 KST 면 다음 날 03:00 KST', () => {
    const at = nextFullWindowAt(new Date('2026-10-25T14:50:00Z'));
    expect(at.toISOString()).toBe('2026-10-25T18:00:00.000Z');
  });
});
