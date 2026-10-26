import {
  countTransitions,
  decideReclassify,
} from './category-reclassify.logic';

describe('decideReclassify', () => {
  it('AI 가 확실하면 바꾸자고 한다', () => {
    expect(
      decideReclassify({
        before: '성인',
        category: '홍보',
        confidence: 0.9,
        source: 'ai',
      }),
    ).toEqual({ after: '홍보', confidence: 0.9, changed: true });
  });

  it('신뢰도가 낮으면 정해진 카테고리를 분류대기로 내리지 않는다', () => {
    const d = decideReclassify({
      before: '뉴스',
      category: '경제',
      confidence: 0.3,
      source: 'ai',
    });
    expect(d.changed).toBe(false);
    expect(d.after).toBe('뉴스');
  });

  it('분류대기는 확실한 결과로 바뀐다', () => {
    const d = decideReclassify({
      before: '분류대기',
      category: '게임',
      confidence: 0.8,
      source: 'ai',
    });
    expect(d).toMatchObject({ after: '게임', changed: true });
  });

  it('키워드 결과는 확실할 때만 바꾼다', () => {
    expect(
      decideReclassify({
        before: '기타',
        category: '뉴스',
        confidence: 0.5,
        source: 'fallback',
      }).changed,
    ).toBe(false);
    expect(
      decideReclassify({
        before: '기타',
        category: '뉴스',
        confidence: 0.76,
        source: 'fallback',
      }).changed,
    ).toBe(true);
  });

  it('같으면 changed=false', () => {
    expect(
      decideReclassify({
        before: '홍보',
        category: '홍보',
        confidence: 0.9,
        source: 'ai',
      }).changed,
    ).toBe(false);
  });
});

describe('countTransitions', () => {
  it('전→후 묶음을 많은 순으로 센다', () => {
    expect(
      countTransitions([
        { beforeCategory: '성인', afterCategory: '홍보' },
        { beforeCategory: '성인', afterCategory: '홍보' },
        { beforeCategory: '기타', afterCategory: '뉴스' },
      ]),
    ).toEqual([
      { from: '성인', to: '홍보', count: 2 },
      { from: '기타', to: '뉴스', count: 1 },
    ]);
  });
});
