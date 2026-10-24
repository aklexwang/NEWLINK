import {
  collectBudgetMinutes,
  collectBudgetMs,
  isCollectBudgetOver,
  orderChannelsForCollect,
  sliceRankingPage,
} from './collect-budget.logic';

describe('수집 시간 예산', () => {
  it('기본은 light 25분, full 95분이다', () => {
    expect(collectBudgetMinutes('light')).toBe(25);
    expect(collectBudgetMinutes('full')).toBe(95);
    expect(collectBudgetMs('light')).toBe(25 * 60_000);
    expect(collectBudgetMinutes('light', { COLLECT_LIGHT_BUDGET_MIN: '10' })).toBe(
      10,
    );
  });

  it('마감 시각이 지나면 예산을 다 쓴 것으로 본다', () => {
    expect(isCollectBudgetOver(undefined, 100)).toBe(false);
    expect(isCollectBudgetOver(50, 100)).toBe(true);
    expect(isCollectBudgetOver(150, 100)).toBe(false);
  });

  it('한 번도 수집 안 한 채널을 먼저, 그다음 오래된 순이다', () => {
    const ordered = orderChannelsForCollect([
      { id: 'c', lastCollectedAt: '2026-10-24T00:00:00.000Z' },
      { id: 'a', lastCollectedAt: null },
      { id: 'b', lastCollectedAt: '2026-10-20T00:00:00.000Z' },
    ]);
    expect(ordered.map((c) => c.id)).toEqual(['a', 'b', 'c']);
  });

  it('순위 페이지는 offset 부터 limit 개를 자른다', () => {
    const items = [1, 2, 3, 4, 5];
    expect(sliceRankingPage(items, 0, 2)).toEqual([1, 2]);
    expect(sliceRankingPage(items, 2, 2)).toEqual([3, 4]);
    expect(sliceRankingPage(items, 4, 50)).toEqual([5]);
  });
});
