import {
  classifyAdminStatsRun,
  durationMs,
  floodWaitSeconds,
  formatDurationKo,
  parseAdminStatsRunMode,
  remainingOf,
} from './admin-stats.logic';

describe('수집 운영 기록 표시', () => {
  it('남은 수가 있으면 예산 도달로 본다', () => {
    expect(remainingOf(10, 30)).toBe(20);
    expect(
      classifyAdminStatsRun({
        finishedAt: '2026-10-24T03:00:00.000Z',
        endedReason: 'completed',
        processed: 10,
        total: 30,
      }),
    ).toBe('budget');
    expect(
      classifyAdminStatsRun({
        finishedAt: '2026-10-24T03:00:00.000Z',
        endedReason: 'completed',
        processed: 30,
        total: 30,
      }),
    ).toBe('completed');
  });

  it('끝나지 않으면 진행 중, interrupted 는 중단이다', () => {
    expect(
      classifyAdminStatsRun({
        finishedAt: null,
        endedReason: null,
        processed: 3,
        total: 10,
      }),
    ).toBe('running');
    expect(
      classifyAdminStatsRun({
        finishedAt: '2026-10-24T03:00:00.000Z',
        endedReason: 'interrupted',
        processed: 3,
        total: 10,
      }),
    ).toBe('interrupted');
  });

  it('걸린 시간과 FLOOD_WAIT 초를 계산한다', () => {
    expect(
      durationMs('2026-10-24T00:00:00.000Z', '2026-10-24T00:01:05.000Z'),
    ).toBe(65_000);
    expect(formatDurationKo(65_000)).toBe('1분 5초');
    expect(formatDurationKo(3_600_000)).toBe('1시간 0분');
    expect(
      floodWaitSeconds('2026-10-24T00:00:00.000Z', '2026-10-24T00:00:12.000Z'),
    ).toBe(12);
    expect(parseAdminStatsRunMode('light')).toBe('light');
    expect(parseAdminStatsRunMode('full')).toBeNull();
  });
});
