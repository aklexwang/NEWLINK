import {
  addKstDays,
  countObservedDays,
  growthFromSnapshots,
  isManipulationSuspected,
  median,
  percentile,
} from './channel-metrics.math';

describe('percentile', () => {
  it('빈 배열은 0이다', () => {
    expect(percentile(10, [])).toBe(0);
  });

  it('오름차순 배열에서 이하 비율을 반환한다', () => {
    const sorted = [1, 2, 3, 4, 5];
    expect(percentile(1, sorted)).toBeCloseTo(0.2);
    expect(percentile(3, sorted)).toBeCloseTo(0.6);
    expect(percentile(5, sorted)).toBe(1);
    expect(percentile(0, sorted)).toBe(0);
    expect(percentile(9, sorted)).toBe(1);
  });

  it('동점 값을 같은 백분위로 묶는다', () => {
    expect(percentile(2, [1, 2, 2, 2, 5])).toBeCloseTo(0.8);
  });
});

describe('median', () => {
  it('빈 배열은 null이다', () => {
    expect(median([])).toBeNull();
  });

  it('홀수 개면 가운데 값이다', () => {
    expect(median([9, 1, 5])).toBe(5);
  });

  it('짝수 개면 가운데 두 값의 평균이다', () => {
    expect(median([1, 2, 8, 10])).toBe(5);
  });
});

describe('isManipulationSuspected', () => {
  it('viewRate가 1을 넘으면 의심이다', () => {
    expect(
      isManipulationSuspected({
        viewRate: 1.01,
        snapshots: [],
        recentViews: [],
      }),
    ).toBe(true);
    expect(
      isManipulationSuspected({ viewRate: 1, snapshots: [], recentViews: [] }),
    ).toBe(false);
  });

  it('하루 구독자 20% 이상 증가 후 조회수 중앙값이 안 오르면 의심이다', () => {
    expect(
      isManipulationSuspected({
        viewRate: 0.2,
        snapshots: [
          { capturedOn: '2026-10-10', memberCount: 100, medianViews7d: 50 },
          { capturedOn: '2026-10-11', memberCount: 130, medianViews7d: 50 },
          { capturedOn: '2026-10-12', memberCount: 131, medianViews7d: 50 },
        ],
        recentViews: [],
      }),
    ).toBe(true);
  });

  it('스파이크 이후 medianViews7d가 오르면 의심이 아니다', () => {
    expect(
      isManipulationSuspected({
        viewRate: 0.2,
        snapshots: [
          { capturedOn: '2026-10-10', memberCount: 100, medianViews7d: 50 },
          { capturedOn: '2026-10-11', memberCount: 130, medianViews7d: 50 },
          { capturedOn: '2026-10-12', memberCount: 131, medianViews7d: 80 },
        ],
        recentViews: [],
      }),
    ).toBe(false);
  });

  it('하루가 아닌 간격의 증가는 이 규칙에 쓰지 않는다', () => {
    expect(
      isManipulationSuspected({
        viewRate: 0.2,
        snapshots: [
          { capturedOn: '2026-10-01', memberCount: 100, medianViews7d: 50 },
          { capturedOn: '2026-10-10', memberCount: 200, medianViews7d: 50 },
          { capturedOn: '2026-10-11', memberCount: 201, medianViews7d: 50 },
        ],
        recentViews: [],
      }),
    ).toBe(false);
  });

  it('최근 글 조회수 변동계수가 0.03 미만이면 의심이다', () => {
    expect(
      isManipulationSuspected({
        viewRate: 0.1,
        snapshots: [],
        recentViews: [100, 100, 100, 101, 100],
      }),
    ).toBe(true);
  });

  it('조회수 편차가 크면 의심이 아니다', () => {
    expect(
      isManipulationSuspected({
        viewRate: 0.1,
        snapshots: [],
        recentViews: [40, 90, 200, 70, 150],
      }),
    ).toBe(false);
  });

  it('조회수 있는 글이 5개 미만이면 CV 규칙을 건너뛴다', () => {
    expect(
      isManipulationSuspected({
        viewRate: 0.1,
        snapshots: [],
        recentViews: [100, 100, 100, 100],
      }),
    ).toBe(false);
  });
});

describe('KST 일수', () => {
  it('같은 날이면 observedDays는 1이다', () => {
    expect(
      countObservedDays(new Date('2026-10-19T01:00:00+09:00'), '2026-10-19'),
    ).toBe(1);
  });

  it('addKstDays가 날짜 문자열을 민다', () => {
    expect(addKstDays('2026-10-19', -1)).toBe('2026-10-18');
    expect(addKstDays('2026-10-19', -7)).toBe('2026-10-12');
  });
});

describe('growthFromSnapshots', () => {
  it('스냅샷이 2일 미만이면 null이다', () => {
    expect(growthFromSnapshots([], '2026-10-22', 1000, 7)).toBeNull();
    expect(
      growthFromSnapshots(
        [{ capturedOn: '2026-10-22', memberCount: 900 }],
        '2026-10-22',
        1000,
        7,
      ),
    ).toBeNull();
  });

  it('옮겨 온 인원 수만 있고 어제 스냅샷이 없으면 계산하지 않는다', () => {
    expect(
      growthFromSnapshots(
        [{ capturedOn: '2026-10-01', memberCount: 10 }],
        '2026-10-22',
        5000,
        1,
      ),
    ).toBeNull();
  });

  it('같은 채널 스냅샷이 2일 이상이면 해당 구간 성장률을 계산한다', () => {
    expect(
      growthFromSnapshots(
        [{ capturedOn: '2026-10-15', memberCount: 100 }],
        '2026-10-22',
        130,
        7,
      ),
    ).toBeCloseTo(0.3);
  });
});
