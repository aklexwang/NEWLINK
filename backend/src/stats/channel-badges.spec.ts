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

describe('isMemberSurgeSuspected', () => {
  const { isMemberSurgeSuspected } = require('./channel-badges') as typeof import('./channel-badges');

  it('회원이 2배 넘게 늘고 조회율이 낮으면 의심 (IDNARA: 42,092 → 161,303, 조회 89)', () => {
    expect(
      isMemberSurgeSuspected({ memberCount: 161303, memberDelta7d: 119211, memberDelta30d: null, viewRate: 89 / 161303 }),
    ).toBe(true);
  });

  it('조회율이 2% 이상이면 실제 성장으로 보고 표시하지 않음', () => {
    expect(isMemberSurgeSuspected({ memberCount: 20000, memberDelta7d: 12000, memberDelta30d: null, viewRate: 0.15 })).toBe(false);
  });

  it('2배 미만 증가는 표시하지 않음', () => {
    expect(isMemberSurgeSuspected({ memberCount: 15000, memberDelta7d: 5000, memberDelta30d: null, viewRate: 0.001 })).toBe(false);
  });

  it('작은 방·작은 증가·기록 없음은 표시하지 않음', () => {
    expect(isMemberSurgeSuspected({ memberCount: 800, memberDelta7d: 600, memberDelta30d: null, viewRate: 0 })).toBe(false);
    expect(isMemberSurgeSuspected({ memberCount: 1500, memberDelta7d: 900, memberDelta30d: null, viewRate: 0 })).toBe(false);
    expect(isMemberSurgeSuspected({ memberCount: 50000, memberDelta7d: null, memberDelta30d: null, viewRate: 0 })).toBe(false);
  });

  it('30일 변화가 더 크면 30일 기준으로 판단', () => {
    expect(isMemberSurgeSuspected({ memberCount: 30000, memberDelta7d: 1000, memberDelta30d: 20000, viewRate: 0.005 })).toBe(true);
  });

  it('배지는 경고를 맨 앞에 둔다', () => {
    const { buildChannelBadges } = require('./channel-badges') as typeof import('./channel-badges');
    const b = buildChannelBadges({
      viewRate: 0.001, firstObservedAt: new Date('2026-10-27'), createdAt: new Date('2026-10-27'), observedDays: 13,
      categoryRank: null, categoryCount: 0, manipulationSuspected: true, memberSurgeSuspected: true, todayYmd: '2026-11-08',
    });
    expect(b[0].code).toBe('member_surge');
  });
});
