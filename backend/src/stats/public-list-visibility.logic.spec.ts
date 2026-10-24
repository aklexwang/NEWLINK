import { describeMemberPageVisibility } from './public-list-visibility.logic';

describe('describeMemberPageVisibility', () => {
  const observed = new Date('2026-10-01T00:00:00+09:00');

  it('승인되지 않았으면 숨긴다', () => {
    expect(
      describeMemberPageVisibility({
        status: 'pending',
        isVisible: true,
        firstObservedAt: observed,
        category: '뉴스',
        language: 'ko',
      }),
    ).toEqual({
      visible: false,
      reason: '승인되지 않음',
      reasonKey: '승인되지 않음',
    });
  });

  it('한 번도 수집하지 않았으면 숨긴다', () => {
    expect(
      describeMemberPageVisibility({
        status: 'active',
        isVisible: true,
        firstObservedAt: null,
        collectStatus: null,
        category: '암호화폐',
        language: 'unknown',
        autoRegistered: false,
        submittedBy: null,
      }),
    ).toEqual({
      visible: false,
      reason: '아직 수집되지 않음',
      reasonKey: '아직 수집되지 않음',
    });
  });

  it('수집 실패 이유가 있으면 같이 적는다', () => {
    expect(
      describeMemberPageVisibility({
        status: 'active',
        isVisible: true,
        firstObservedAt: null,
        collectError: 'preview:no_posts',
        category: '뉴스',
        language: 'ko',
      }).reason,
    ).toBe('아직 수집되지 않음 (preview:no_posts)');
  });

  it('어드민이 직접 넣은 미확인 언어는 수집만 되면 보여 준다', () => {
    expect(
      describeMemberPageVisibility({
        status: 'active',
        isVisible: true,
        firstObservedAt: observed,
        collectStatus: 'ok',
        category: '암호화폐',
        language: 'unknown',
        autoRegistered: false,
        submittedBy: null,
      }),
    ).toEqual({ visible: true, reason: '', reasonKey: '' });
  });

  it('외국어 자동 등록은 숨긴다', () => {
    expect(
      describeMemberPageVisibility({
        status: 'active',
        isVisible: true,
        firstObservedAt: observed,
        collectStatus: 'ok',
        category: '뉴스',
        language: 'foreign',
        autoRegistered: true,
        submittedBy: null,
      }),
    ).toEqual({ visible: false, reason: '외국어', reasonKey: '외국어' });
  });

  it('분류대기는 숨긴다', () => {
    expect(
      describeMemberPageVisibility({
        status: 'active',
        isVisible: true,
        firstObservedAt: observed,
        collectStatus: 'ok',
        category: '분류대기',
        language: 'ko',
      }),
    ).toEqual({
      visible: false,
      reason: '분류대기',
      reasonKey: '분류대기',
    });
  });
});
