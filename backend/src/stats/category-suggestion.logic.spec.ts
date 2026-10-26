import {
  nextSuggestedCategory,
  suggestionAlertKey,
  suggestionsToAlert,
} from './category-suggestion.logic';

describe('category-suggestion.logic', () => {
  it('5개 이상 모인 후보만 알린다', () => {
    expect(
      suggestionsToAlert([
        { name: '웹소설', count: 4 },
        { name: '코인선물', count: 12 },
        { name: '자동차', count: 5 },
      ]),
    ).toEqual([
      { name: '코인선물', count: 12 },
      { name: '자동차', count: 5 },
    ]);
  });

  it('알림 key 는 띄어쓰기를 무시한다', () => {
    expect(suggestionAlertKey('코인 선물')).toBe(
      suggestionAlertKey('코인선물'),
    );
  });

  it('AI 결과일 때만 후보를 바꾼다', () => {
    expect(nextSuggestedCategory({ source: 'ai', newCategory: '웹소설' })).toBe(
      '웹소설',
    );
    expect(nextSuggestedCategory({ source: 'ai' })).toBeNull();
    expect(
      nextSuggestedCategory({ source: 'fallback', newCategory: 'x' }),
    ).toBeUndefined();
  });
});
