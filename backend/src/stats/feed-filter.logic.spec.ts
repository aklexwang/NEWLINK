import {
  countAdHits,
  defaultFeedFilter,
  isAdPost,
  normalizeFeedFilter,
} from './feed-filter.logic';

describe('feed-filter.logic', () => {
  const s = defaultFeedFilter();
  it('광고 글: 광고 단어 2개 이상', () => {
    const royal =
      '♠️로얄홀덤 현재 1번방 만포진행중 대기 2명 VIP 5포 진행시 폭탄이벤트 하이 핸드 잭팟 이벤트 바인 문의 @royal24cs';
    expect(countAdHits(royal, s.adWords)).toBeGreaterThanOrEqual(3);
    expect(isAdPost(royal, s)).toBe(true);
    expect(
      isAdPost('카톡 안쓰는 전번 전부다 삽니다 15000원 전번당 @dasam1', s),
    ).toBe(true);
  });
  it('정보 글은 통과', () => {
    expect(
      isAdPost(
        '코스피 엊그제 말씀드린 MDD선에서 최악으로 가지는 않는 듯합니다. 이벤트 일정 정리',
        s,
      ),
    ).toBe(false);
    expect(isAdPost(null, s)).toBe(false);
  });
  it('설정 정리', () => {
    const n = normalizeFeedFilter({
      adWords: [' 바인 ', '바인', ''],
      minHits: 9,
    });
    expect(n.adWords).toEqual(['바인']);
    expect(n.minHits).toBe(2);
    expect(n.excludeCategories).toContain('홍보');
  });
});
