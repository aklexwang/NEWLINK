import {
  DISCOVERY_KEYWORD_GROUPS,
  flattenDiscoveryKeywords,
  rotateDiscoveryKeywords,
} from './discovery-keywords';

describe('discovery-keywords', () => {
  it('카테고리 23개와 각 3~5개 대표 키워드가 있다', () => {
    expect(DISCOVERY_KEYWORD_GROUPS).toHaveLength(23);
    for (const group of DISCOVERY_KEYWORD_GROUPS) {
      expect(group.keywords.length).toBeGreaterThanOrEqual(3);
      expect(group.keywords.length).toBeLessThanOrEqual(5);
    }
    const names = DISCOVERY_KEYWORD_GROUPS.map((g) => g.category);
    expect(names).toEqual([
      '분류대기',
      '뉴스',
      '경제',
      '암호화폐',
      '쇼핑',
      '교육',
      '기술',
      '엔터테인먼트',
      '음악',
      '게임',
      '스포츠',
      '커뮤니티',
      '여행',
      '맛집',
      '건강',
      '부동산',
      '구인구직',
      '성인',
      '카지노',
      '기타',
      '증권',
      '해킹',
      '웹툰',
    ]);
  });

  it('펼친 목록은 카테고리 이름을 포함하고 중복이 없다', () => {
    const flat = flattenDiscoveryKeywords();
    expect(new Set(flat).size).toBe(flat.length);
    for (const group of DISCOVERY_KEYWORD_GROUPS) {
      expect(flat).toContain(group.category);
    }
    expect(flat).toContain('주식');
    expect(flat).toContain('코인');
    expect(flat).toContain('개발');
  });

  it('하루 상한보다 많으면 시작 위치를 밀어 뒤쪽 카테고리도 검색한다', () => {
    const all = flattenDiscoveryKeywords();
    const day1 = rotateDiscoveryKeywords(all, 0, 100);
    const day2 = rotateDiscoveryKeywords(all, 100, 100);
    expect(day1).toHaveLength(100);
    expect(day1[0]).toBe(all[0]);
    expect(day2[0]).toBe(all[100]);
    expect(day2).toContain('웹툰');
  });
});
