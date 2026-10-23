import {
  interruptOpenStatsRuns,
  isOpenStatsRun,
  toPublicStatsRun,
} from './stats-run.logic';

describe('수집 run 재시작', () => {
  it('끝나지 않은 run 은 interrupted 로 표시한다', () => {
    const now = new Date('2026-10-23T06:00:00.000Z');
    const open = {
      id: 'run-1',
      processed: 12,
      total: 100,
      finishedAt: null,
      endedReason: null,
    };
    const done = {
      id: 'run-0',
      processed: 50,
      total: 50,
      finishedAt: new Date('2026-10-22T00:00:00.000Z'),
      endedReason: 'completed' as const,
    };
    expect(isOpenStatsRun(open)).toBe(true);
    expect(isOpenStatsRun(done)).toBe(false);

    const interrupted = interruptOpenStatsRuns([open, done], now);
    expect(interrupted).toHaveLength(1);
    expect(interrupted[0]).toMatchObject({
      id: 'run-1',
      finishedAt: now,
      endedReason: 'interrupted',
      processed: 12,
    });
    expect(toPublicStatsRun(interrupted[0])).toEqual({
      id: 'run-1',
      status: 'interrupted',
      processed: 12,
      total: 100,
    });
  });
});
