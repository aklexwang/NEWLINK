import {
  ADMIN_COLLECT_BULK_MAX,
  assertBulkCollectSize,
  canAdminCollectNow,
  isRecentOpenStatsRun,
  remainingCollectCooldownSec,
  shouldBlockAdminCollect,
  STATS_JOB_BUSY_MESSAGE,
  STATS_RUN_RECENT_MS,
} from './admin-collect.logic';

describe('admin-collect.logic', () => {
  it('60초 안에는 같은 채널을 다시 수집하지 않는다', () => {
    expect(canAdminCollectNow(undefined, 1000)).toBe(true);
    expect(canAdminCollectNow(1000, 1000 + 59_000)).toBe(false);
    expect(canAdminCollectNow(1000, 1000 + 60_000)).toBe(true);
    expect(remainingCollectCooldownSec(1000, 1000 + 10_000)).toBe(50);
  });

  it('일괄 수집은 최대 20개다', () => {
    expect(assertBulkCollectSize(['a', 'a', 'b'])).toEqual(['a', 'b']);
    expect(() =>
      assertBulkCollectSize(
        Array.from({ length: ADMIN_COLLECT_BULK_MAX + 1 }, (_, i) => String(i)),
      ),
    ).toThrow(/최대 20개/);
  });

  it('정기 수집 충돌 안내 문구가 정해져 있다', () => {
    expect(STATS_JOB_BUSY_MESSAGE).toBe(
      '정기 수집 중입니다. 끝난 뒤 다시 눌러 주세요',
    );
  });

  it('열린 stats_runs 는 시작 후 2시간 안만 실행 중으로 본다', () => {
    const now = Date.parse('2026-10-24T15:00:00+09:00');
    expect(
      isRecentOpenStatsRun(
        { finishedAt: null, startedAt: new Date(now - 60 * 60 * 1000) },
        now,
      ),
    ).toBe(true);
    expect(
      isRecentOpenStatsRun(
        {
          finishedAt: null,
          startedAt: new Date(now - STATS_RUN_RECENT_MS - 1),
        },
        now,
      ),
    ).toBe(false);
    expect(
      isRecentOpenStatsRun(
        { finishedAt: new Date(now), startedAt: new Date(now - 1000) },
        now,
      ),
    ).toBe(false);
    expect(shouldBlockAdminCollect(true, [], now)).toBe(true);
    expect(
      shouldBlockAdminCollect(
        false,
        [{ finishedAt: null, startedAt: new Date(now - 3 * 60 * 60 * 1000) }],
        now,
      ),
    ).toBe(false);
    expect(
      shouldBlockAdminCollect(
        false,
        [{ finishedAt: null, startedAt: new Date(now - 10 * 60 * 1000) }],
        now,
      ),
    ).toBe(true);
  });
});
