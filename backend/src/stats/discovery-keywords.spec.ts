import {
  DISCOVERY_KEYWORD_GROUPS,
  discoveryKeywordV2InsertRows,
  flattenDiscoveryKeywordSeed,
  flattenDiscoveryKeywords,
  pickKeywordsForSearch,
  rotateDiscoveryKeywords,
  shouldSeedDiscoveryKeywords,
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

  it('테이블이 비어 있을 때만 시드한다', () => {
    expect(shouldSeedDiscoveryKeywords(0)).toBe(true);
    expect(shouldSeedDiscoveryKeywords(1)).toBe(false);
    const seed = flattenDiscoveryKeywordSeed();
    expect(seed.map((row) => row.word)).toEqual(flattenDiscoveryKeywords());
    expect(seed[0].category).toBe('분류대기');
  });

  it('검색은 오래된 last_searched_at 과 sort 순으로 고른다', () => {
    const picked = pickKeywordsForSearch(
      [
        { word: 'b', sort: 0, lastSearchedAt: new Date('2026-10-01') },
        { word: 'a', sort: 1, lastSearchedAt: null },
        { word: 'c', sort: 2, lastSearchedAt: new Date('2026-09-01') },
      ],
      2,
    );
    expect(picked.map((row) => row.word)).toEqual(['a', 'c']);
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

describe('2차 키워드', () => {
  it('이미 있는 단어는 빼고 sort 를 이어 붙인다', () => {
    const rows = discoveryKeywordV2InsertRows(['정치', '리플'], 200);
    const words = rows.map((r) => r.word);
    expect(words).not.toContain('정치');
    expect(words).not.toContain('리플');
    expect(words).toContain('미국주식');
    expect(rows[0].sort).toBe(200);
    expect(new Set(words).size).toBe(words.length);
  });

  it('1차 키워드와 겹치지 않는다', () => {
    const first = new Set(flattenDiscoveryKeywords());
    const v2 = discoveryKeywordV2InsertRows([], 0).map((r) => r.word);
    expect(v2.filter((w) => first.has(w))).toEqual([]);
  });
});
