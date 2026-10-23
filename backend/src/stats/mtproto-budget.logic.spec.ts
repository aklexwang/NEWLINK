import { DISCOVERY_MAX_PER_DAY } from './channel-discovery.logic';
import {
  canRunAnotherKeywordSearch,
  KEYWORD_SEARCH_DEFAULT_DAILY_LIMIT,
  nextKeywordSearchDelayMs,
  remainingMtprotoRequests,
  splitRemainingAfterCollect,
} from './mtproto-budget.logic';

describe('키워드 검색 상한', () => {
  it('하루 기본 상한은 10이다', () => {
    expect(KEYWORD_SEARCH_DEFAULT_DAILY_LIMIT).toBe(10);
    expect(canRunAnotherKeywordSearch(9, 10)).toBe(true);
    expect(canRunAnotherKeywordSearch(10, 10)).toBe(false);
  });

  it('키워드 사이 간격은 첫 요청 0, 이후 10초이다', () => {
    expect(nextKeywordSearchDelayMs(0)).toBe(0);
    expect(nextKeywordSearchDelayMs(1)).toBe(10_000);
  });
});

describe('splitRemainingAfterCollect', () => {
  it('하루 예산 500에서 수집 180을 쓰면 눈덩이 110회·키워드 100회로 나눈다', () => {
    expect(remainingMtprotoRequests(180, 500)).toBe(320);
    const split = splitRemainingAfterCollect({
      remaining: 320,
      discoveryInspectCap: DISCOVERY_MAX_PER_DAY,
      keywordSearchCap: 100,
    });
    expect(split.discoveryInspects).toBe(110);
    expect(split.discoveryRequests).toBe(220);
    expect(split.keywordSearches).toBe(100);
    expect(split.keywordRequests).toBe(100);
    expect(split.leftover).toBe(0);
  });

  it('수집이 예산을 다 쓰면 발견·검색은 0이다', () => {
    const split = splitRemainingAfterCollect({
      remaining: 0,
      discoveryInspectCap: 200,
      keywordSearchCap: 100,
    });
    expect(split.discoveryInspects).toBe(0);
    expect(split.keywordSearches).toBe(0);
  });

  it('기본 상한 10이면 수집 이후 남은 예산에서 검색 10을 남긴다', () => {
    const split = splitRemainingAfterCollect({
      remaining: 320,
      discoveryInspectCap: DISCOVERY_MAX_PER_DAY,
    });
    expect(split.keywordSearches).toBe(10);
    expect(split.discoveryInspects).toBe(155);
    expect(split.discoveryRequests).toBe(310);
  });

  it('수집이 없으면 눈덩이 200회·키워드 100회로 남긴다', () => {
    const split = splitRemainingAfterCollect({
      remaining: 500,
      discoveryInspectCap: 200,
      keywordSearchCap: 100,
    });
    expect(split.discoveryInspects).toBe(200);
    expect(split.discoveryRequests).toBe(400);
    expect(split.keywordSearches).toBe(100);
  });
});
