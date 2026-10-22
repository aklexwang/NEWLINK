import {
  compareDuplicateKeepPriority,
  pickKeepChannel,
  type DuplicateKeepCandidate,
} from './merge-duplicate-channels.logic';

function ch(
  partial: Partial<DuplicateKeepCandidate> & Pick<DuplicateKeepCandidate, 'id'>,
): DuplicateKeepCandidate {
  return {
    title: '채널',
    isVerified: false,
    isPromoted: false,
    favoriteCount: 0,
    recommendCount: 0,
    postCount: 0,
    createdAt: new Date('2026-01-01T00:00:00+09:00'),
    ...partial,
  };
}

describe('pickKeepChannel', () => {
  it('운영자 인증된 채널을 남긴다', () => {
    const keep = ch({
      id: 'b',
      isVerified: true,
      createdAt: new Date('2026-06-01T00:00:00+09:00'),
    });
    const other = ch({
      id: 'a',
      isPromoted: true,
      favoriteCount: 99,
      postCount: 99,
      createdAt: new Date('2025-01-01T00:00:00+09:00'),
    });
    expect(pickKeepChannel([other, keep]).id).toBe('b');
  });

  it('인증이 같으면 광고 중인 채널을 남긴다', () => {
    const keep = ch({ id: 'p', isPromoted: true, recommendCount: 1 });
    const other = ch({ id: 'q', favoriteCount: 50, postCount: 50 });
    expect(pickKeepChannel([other, keep]).id).toBe('p');
  });

  it('즐겨찾기·추천 수가 많은 채널을 남긴다', () => {
    const keep = ch({ id: 'e', favoriteCount: 2, recommendCount: 3 });
    const other = ch({ id: 'f', favoriteCount: 4, recommendCount: 0 });
    expect(pickKeepChannel([other, keep]).id).toBe('e');
  });

  it('참여가 같으면 게시글이 많은 채널을 남긴다', () => {
    const keep = ch({ id: 'n', postCount: 8, recommendCount: 1 });
    const other = ch({ id: 'm', postCount: 2, recommendCount: 1 });
    expect(pickKeepChannel([other, keep]).id).toBe('n');
  });

  it('앞선 조건이 같으면 먼저 등록된 채널을 남긴다', () => {
    const keep = ch({
      id: 'old',
      createdAt: new Date('2025-03-01T00:00:00+09:00'),
    });
    const other = ch({
      id: 'new',
      createdAt: new Date('2026-03-01T00:00:00+09:00'),
    });
    expect(pickKeepChannel([other, keep]).id).toBe('old');
  });

  it('동률이면 id 가 앞선 쪽을 남긴다', () => {
    const a = ch({ id: 'aaa' });
    const b = ch({ id: 'bbb' });
    expect(pickKeepChannel([b, a]).id).toBe('aaa');
    expect(compareDuplicateKeepPriority(a, b)).toBeLessThan(0);
  });
});
