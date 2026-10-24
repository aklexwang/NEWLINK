import {
  assertDiscoveryUsernames,
  discoveryQueueSkip,
  discoveryResultLabel,
  parseDiscoveryQueueFilter,
} from './admin-discovery.logic';

describe('발견 대기열 필터', () => {
  it('알 수 없는 값은 대기로 둔다', () => {
    expect(parseDiscoveryQueueFilter(undefined)).toBe('queued');
    expect(parseDiscoveryQueueFilter('not_korean')).toBe('not_korean');
    expect(parseDiscoveryQueueFilter('nope')).toBe('queued');
  });

  it('결과 문구를 한국어로 붙인다', () => {
    expect(discoveryResultLabel('queued')).toBe('대기');
    expect(discoveryResultLabel('invite_or_private')).toBe('초대·비공개');
    expect(discoveryResultLabel('discarded')).toBe('버림');
  });

  it('페이지는 50개씩이다', () => {
    expect(discoveryQueueSkip(2)).toEqual({ page: 2, skip: 50, take: 50 });
  });

  it('아이디는 최대 100개다', () => {
    expect(assertDiscoveryUsernames(['@A', 'a', 'b'])).toEqual(['a', 'b']);
    expect(() =>
      assertDiscoveryUsernames(Array.from({ length: 101 }, (_, i) => `u${i}`)),
    ).toThrow(/최대 100개/);
  });
});
