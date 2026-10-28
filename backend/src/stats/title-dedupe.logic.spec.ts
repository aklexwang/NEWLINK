import { dedupeByTitle, normalizeTitleKey } from './title-dedupe.logic';

describe('title-dedupe', () => {
  it('이모지·공백 차이는 같은 이름', () => {
    expect(normalizeTitleKey('🚨블랙리스트🚨 사기꾼박제')).toBe(
      normalizeTitleKey('블랙리스트 사기꾼박제'),
    );
  });
  it('먼저 나온(순위 높은) 것만 남김', () => {
    const list = [
      { id: 1, title: '구인구직방 NO.1' },
      { id: 2, title: '구인구직방 NO.1' },
      { id: 3, title: '블랙리스트' },
      { id: 4, title: '' },
      { id: 5, title: '' },
    ];
    expect(dedupeByTitle(list).map((x) => x.id)).toEqual([1, 3, 4, 5]);
  });
});
