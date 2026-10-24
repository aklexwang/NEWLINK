import { DISCOVERY_MAX_PER_DAY } from './channel-discovery.logic';
import {
  discoveryUncappedWorstMs,
  fullPipelineBudgetedWorstMinutes,
  keywordSearchNeedsTimeBudget,
  keywordSearchUncappedWorstMs,
  msToMinutes,
  verifyRecheckUncappedWorstMs,
} from './full-pipeline-budget.logic';

describe('full 파이프라인 최악 시간', () => {
  it('발견 1000개·간격 1초·페이지 2초면 약 50분이다', () => {
    expect(DISCOVERY_MAX_PER_DAY).toBe(1000);
    expect(msToMinutes(discoveryUncappedWorstMs())).toBe(50);
  });

  it('키워드 검색 기본 10회·간격 10초는 5분 이하라 예산을 안 건다', () => {
    expect(msToMinutes(keywordSearchUncappedWorstMs())).toBe(2);
    expect(keywordSearchNeedsTimeBudget()).toBe(false);
  });

  it('인증 재확인은 채널 수 상한이 없다', () => {
    expect(msToMinutes(verifyRecheckUncappedWorstMs(1618))).toBe(80.9);
    expect(msToMinutes(verifyRecheckUncappedWorstMs(100))).toBe(5);
  });

  it('예산 적용 후 full 최악은 100분 이하다', () => {
    expect(fullPipelineBudgetedWorstMinutes()).toBe(97);
    expect(fullPipelineBudgetedWorstMinutes()).toBeLessThanOrEqual(100);
  });
});
