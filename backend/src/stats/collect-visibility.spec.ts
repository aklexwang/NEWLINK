import { isPublicCollectable } from './collect-visibility';

describe('isPublicCollectable', () => {
  const observed = new Date('2026-10-01T00:00:00+09:00');

  it('한 번도 수집 성공하지 못한 채널은 제외한다', () => {
    expect(
      isPublicCollectable({ firstObservedAt: null, collectStatus: 'ok' }),
    ).toBe(false);
    expect(
      isPublicCollectable({ firstObservedAt: null, collectStatus: 'failed' }),
    ).toBe(false);
  });

  it('invalid·gone 은 제외한다', () => {
    expect(
      isPublicCollectable({
        firstObservedAt: observed,
        collectStatus: 'invalid',
      }),
    ).toBe(false);
    expect(
      isPublicCollectable({
        firstObservedAt: observed,
        collectStatus: 'gone',
      }),
    ).toBe(false);
  });

  it('수집에 성공한 적 있는 채널·실패 중인 채널은 남긴다', () => {
    expect(
      isPublicCollectable({ firstObservedAt: observed, collectStatus: 'ok' }),
    ).toBe(true);
    expect(
      isPublicCollectable({
        firstObservedAt: observed,
        collectStatus: 'failed',
      }),
    ).toBe(true);
    expect(
      isPublicCollectable({
        firstObservedAt: observed,
        collectStatus: 'private',
      }),
    ).toBe(true);
    expect(
      isPublicCollectable({ firstObservedAt: observed, collectStatus: null }),
    ).toBe(true);
  });
});
