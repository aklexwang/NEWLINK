import {
  dedupeChannelsByLink,
  extractInviteHash,
  linkIdentityKey,
} from './channel-link.logic';
import {
  duplicateSearchTerm,
  pickDuplicate,
  type DuplicateRow,
} from './link-duplicate.logic';

function row(overrides: Partial<DuplicateRow> & { id: string }): DuplicateRow {
  return {
    link: 'https://t.me/news_kr',
    status: 'active',
    collectStatus: 'ok',
    createdAt: new Date('2026-10-01T00:00:00Z'),
    ...overrides,
  };
}

describe('linkIdentityKey', () => {
  it('공개 링크는 username 으로 비교하고 대소문자·형태 차이를 무시한다', () => {
    const key = linkIdentityKey('https://t.me/News_KR');
    expect(linkIdentityKey('t.me/news_kr/')).toBe(key);
    expect(linkIdentityKey('@NEWS_kr')).toBe(key);
    expect(linkIdentityKey('https://t.me/s/news_kr')).toBe(key);
  });

  it('초대 링크는 해시 대소문자를 그대로 비교한다', () => {
    expect(extractInviteHash('https://t.me/+AbCdEf')).toBe('AbCdEf');
    expect(extractInviteHash('https://t.me/joinchat/AbCdEf')).toBe('AbCdEf');
    expect(linkIdentityKey('https://t.me/+AbCdEf')).toBe(
      linkIdentityKey('https://t.me/joinchat/AbCdEf'),
    );
    expect(linkIdentityKey('https://t.me/+AbCdEf')).not.toBe(
      linkIdentityKey('https://t.me/+abcdef'),
    );
  });

  it('검색어는 소문자 username 또는 해시다', () => {
    expect(duplicateSearchTerm('https://t.me/News_KR')).toBe('news_kr');
    expect(duplicateSearchTerm('https://t.me/+AbCdEf')).toBe('abcdef');
  });
});

describe('pickDuplicate', () => {
  it('ACTIVE 가 있으면 PENDING·REJECTED 보다 먼저 돌려준다', () => {
    const match = pickDuplicate(
      [
        row({ id: 'r', status: 'rejected' }),
        row({ id: 'p', status: 'pending' }),
        row({ id: 'a', status: 'active' }),
      ],
      'https://t.me/NEWS_KR',
    );
    expect(match?.kind).toBe('active');
    expect(match?.channel.id).toBe('a');
  });

  it('PENDING 이 REJECTED 보다 우선이다', () => {
    const match = pickDuplicate(
      [
        row({ id: 'r', status: 'rejected' }),
        row({ id: 'p', status: 'pending' }),
      ],
      'https://t.me/news_kr',
    );
    expect(match?.kind).toBe('pending');
  });

  it('REJECTED 만 있으면 rejected 로 알려 준다', () => {
    const match = pickDuplicate(
      [row({ id: 'r', status: 'rejected' })],
      'https://t.me/news_kr',
    );
    expect(match?.kind).toBe('rejected');
    expect(match?.channel.id).toBe('r');
  });

  it('합쳐진(merged) 행과 자기 자신은 비교하지 않는다', () => {
    const rows = [
      row({ id: 'm', status: 'active', collectStatus: 'merged' }),
      row({ id: 'self', status: 'active' }),
    ];
    expect(pickDuplicate(rows, 'https://t.me/news_kr', 'self')).toBeNull();
    expect(pickDuplicate(rows, 'https://t.me/news_kr')?.channel.id).toBe(
      'self',
    );
  });

  it('초대 링크는 해시 대소문자가 다르면 다른 방이다', () => {
    const rows = [row({ id: 'i', link: 'https://t.me/+AbCdEf' })];
    expect(pickDuplicate(rows, 'https://t.me/+AbCdEf')?.channel.id).toBe('i');
    expect(pickDuplicate(rows, 'https://t.me/+abcdef')).toBeNull();
    expect(
      pickDuplicate(rows, 'https://t.me/joinchat/AbCdEf')?.channel.id,
    ).toBe('i');
  });

  it('초대 링크로 등록된 방이 나중에 username 을 얻었으면 공개 링크도 중복이다', () => {
    const rows = [
      row({ id: 'i', link: 'https://t.me/+AbCdEf', username: 'news_kr' }),
    ];
    expect(pickDuplicate(rows, 'https://t.me/News_KR')?.channel.id).toBe('i');
  });

  it('같은 상태면 먼저 만들어진 행을 돌려준다', () => {
    const match = pickDuplicate(
      [
        row({ id: 'late', createdAt: new Date('2026-10-05T00:00:00Z') }),
        row({ id: 'early', createdAt: new Date('2026-10-02T00:00:00Z') }),
      ],
      'https://t.me/news_kr',
    );
    expect(match?.channel.id).toBe('early');
  });

  it('다른 링크는 중복이 아니다', () => {
    expect(
      pickDuplicate([row({ id: 'a' })], 'https://t.me/other_channel'),
    ).toBeNull();
  });
});

describe('dedupeChannelsByLink (가장 좋은 행)', () => {
  const base = { memberCount: 10, recommendCount: 0 };

  it('ACTIVE 행이 승인 전 행보다 대표가 된다', () => {
    const winners = dedupeChannelsByLink([
      {
        ...base,
        link: 'https://t.me/Same_One',
        status: 'pending',
        memberCount: 999,
      },
      { ...base, link: 'https://t.me/same_one/', status: 'active' },
    ]);
    expect(winners).toHaveLength(1);
    expect(winners[0].status).toBe('active');
  });

  it('prefer 가 true 인 행을 먼저 대표로 삼는다', () => {
    const winners = dedupeChannelsByLink(
      [
        {
          ...base,
          link: 'https://t.me/same_one',
          memberCount: 500,
          tag: 'hidden',
        },
        { ...base, link: 'https://t.me/Same_One', tag: 'visible' },
      ],
      { prefer: (c) => c.tag === 'visible' },
    );
    expect(winners.map((c) => c.tag)).toEqual(['visible']);
  });

  it('초대 링크 해시 대소문자만 다르면 둘 다 남는다', () => {
    const winners = dedupeChannelsByLink([
      { ...base, link: 'https://t.me/+AbCdEf' },
      { ...base, link: 'https://t.me/+abcdef' },
    ]);
    expect(winners).toHaveLength(2);
  });
});
