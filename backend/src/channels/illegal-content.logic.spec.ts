import {
  hasIllegalDrugSuspicion,
  ILLEGAL_HIDE_REASON,
  shouldHideIllegalSuspicion,
} from './illegal-content.logic';

describe('illegal-content.logic', () => {
  it('마약·필로폰·작대기는 잡고 아이스크림·케이팝은 지나간다', () => {
    expect(hasIllegalDrugSuspicion('필로폰 거래', '')).toBe(true);
    expect(hasIllegalDrugSuspicion('작대기 문의', '작대기 팝니다')).toBe(true);
    expect(hasIllegalDrugSuspicion('마약 정보방', '')).toBe(true);
    expect(hasIllegalDrugSuspicion('아이스크림 맛집', '서울 카페')).toBe(false);
    expect(hasIllegalDrugSuspicion('케이팝 차트', '아이돌 소식')).toBe(false);
    expect(hasIllegalDrugSuspicion('손이 떨려요', '건강 상담')).toBe(false);
  });

  it('문제없음이면 숨기지 않는다', () => {
    expect(
      shouldHideIllegalSuspicion({
        title: '마약 관련',
        description: '',
        illegalCleared: false,
      }),
    ).toBe(true);
    expect(
      shouldHideIllegalSuspicion({
        title: '마약 관련',
        description: '',
        illegalCleared: true,
      }),
    ).toBe(false);
    expect(ILLEGAL_HIDE_REASON).toBe('불법 의심(관리자 확인)');
  });
});
