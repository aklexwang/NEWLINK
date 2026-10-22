import { isPublicCollectable, isScoreCollectable } from './collect-visibility';

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

  it('invite_expired 는 공개 화면에서 제외한다', () => {
    expect(
      isPublicCollectable({
        firstObservedAt: observed,
        collectStatus: 'invite_expired',
      }),
    ).toBe(false);
  });

  it('invalid·gone·merged 는 제외한다', () => {
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
    expect(
      isPublicCollectable({
        firstObservedAt: observed,
        collectStatus: 'merged',
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

  it('초대 전용 방은 관측 기록이 없어도 공개 화면에 남긴다', () => {
    expect(
      isPublicCollectable({
        firstObservedAt: null,
        collectStatus: 'invite_only',
      }),
    ).toBe(true);
  });
});

describe('isScoreCollectable', () => {
  it('초대 전용 방은 점수 계산에서 뺀다', () => {
    expect(
      isScoreCollectable({
        firstObservedAt: new Date(),
        collectStatus: 'invite_only',
      }),
    ).toBe(false);
  });
});
