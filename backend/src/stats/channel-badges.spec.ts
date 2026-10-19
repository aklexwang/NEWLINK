import { buildChannelBadges } from './channel-badges';

describe('buildChannelBadges', () => {
  const today = '2026-10-19';

  it('참여·신규·인기·데이터 부족·조회 이상을 붙인다', () => {
    const badges = buildChannelBadges({
      viewRate: 0.3,
      firstObservedAt: new Date('2026-10-10T00:00:00+09:00'),
      createdAt: new Date('2026-10-10T00:00:00+09:00'),
      observedDays: 3,
      categoryRank: 1,
      categoryCount: 20,
      manipulationSuspected: true,
      todayYmd: today,
    });
    expect(badges.map((b) => b.code)).toEqual([
      'high_engagement',
      'new',
      'popular',
      'low_data',
      'views_anomaly',
    ]);
    expect(badges.find((b) => b.code === 'views_anomaly')?.label).toBe(
      '조회 이상 감지',
    );
  });

  it('조건이 없으면 배지가 없다', () => {
    expect(
      buildChannelBadges({
        viewRate: 0.1,
        firstObservedAt: new Date('2025-01-01T00:00:00+09:00'),
        createdAt: new Date('2025-01-01T00:00:00+09:00'),
        observedDays: 40,
        categoryRank: 10,
        categoryCount: 20,
        manipulationSuspected: false,
        todayYmd: today,
      }),
    ).toEqual([]);
  });
});
