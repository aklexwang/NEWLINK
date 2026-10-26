import { searchRelevance } from './search-relevance.logic';
import { expandSearchKeywords, matchesWholeTerm } from './search-synonyms';

describe('searchRelevance', () => {
  it('제목 시작 > 제목 포함 > 아이디 > 소개 > 그 밖', () => {
    expect(searchRelevance({ title: '뉴토끼 알리미' }, '뉴토')).toBe(100);
    expect(searchRelevance({ title: '최신 뉴토끼' }, '뉴토')).toBe(80);
    expect(
      searchRelevance({ title: 'x', username: 'newtoki24' }, 'newtoki'),
    ).toBe(60);
    expect(
      searchRelevance({ title: 'x', description: '뉴토끼 주소' }, '뉴토'),
    ).toBe(30);
    expect(searchRelevance({ title: '잉여인간' }, '뉴')).toBe(10);
  });
});

describe('동의어는 다 친 단어에만', () => {
  it('"뉴" 는 뉴스 묶음으로 넓히지 않는다', () => {
    expect(expandSearchKeywords('뉴')).toEqual(['뉴']);
  });
  it('"뉴스" 는 넓힌다', () => {
    expect(expandSearchKeywords('뉴스')).toContain('news');
  });
  it('"코인시세" 는 코인 묶음', () => {
    expect(expandSearchKeywords('코인시세')).toContain('암호화폐');
  });
  it('"bitcoin" 안의 "it" 으로 기술 묶음이 오지 않는다', () => {
    expect(expandSearchKeywords('bitcoin')).not.toContain('tech');
    expect(matchesWholeTerm('it news', 'it')).toBe(true);
  });
});
