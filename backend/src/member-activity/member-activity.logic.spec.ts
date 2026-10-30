import {
  buildMemberProfile,
  kstHour,
  normalizeKeyword,
} from './member-activity.logic';

const ch = (id: string, category: string, link = `https://t.me/${id}`) => ({
  id,
  title: `방 ${id}`,
  category,
  link,
  linkType: 'channel',
});

describe('회원 성향 판정', () => {
  const channels = new Map([
    ['a', ch('a', '암호화폐')],
    ['b', ch('b', '암호화폐', 'https://t.me/+AbCdEf123')],
    ['c', ch('c', '경제')],
  ]);
  const at = (h: number) => new Date(Date.UTC(2026, 9, 30, (h + 15) % 24));

  it('이동·즐겨찾기 무게로 카테고리 비율과 라벨을 낸다', () => {
    const p = buildMemberProfile(
      [
        {
          kind: 'open',
          channelId: 'a',
          keyword: null,
          category: null,
          createdAt: at(1),
        },
        {
          kind: 'open',
          channelId: 'b',
          keyword: null,
          category: null,
          createdAt: at(2),
        },
        {
          kind: 'favorite',
          channelId: 'a',
          keyword: null,
          category: null,
          createdAt: at(2),
        },
        {
          kind: 'view',
          channelId: 'c',
          keyword: null,
          category: null,
          createdAt: at(14),
        },
        {
          kind: 'search',
          channelId: null,
          keyword: '비트코인',
          category: null,
          createdAt: at(1),
        },
        {
          kind: 'search',
          channelId: null,
          keyword: '비트코인',
          category: null,
          createdAt: at(3),
        },
      ],
      channels,
    );
    expect(p.categories[0]).toMatchObject({ name: '암호화폐', share: 91 });
    expect(p.labels[0]).toBe('암호화폐 집중형');
    expect(p.labels).toContain('심야 활동 많음');
    expect(p.keywords[0]).toEqual({ keyword: '비트코인', count: 2 });
    expect(p.topRooms[0].channelId).toBe('a');
    expect(p.privateShare).toBe(25);
  });

  it('기록이 없으면 안내 문구', () => {
    const p = buildMemberProfile([], channels);
    expect(p.total).toBe(0);
    expect(p.summary).toContain('없어요');
  });

  it('KST 시각과 키워드 정리', () => {
    expect(kstHour(new Date(Date.UTC(2026, 0, 1, 15)))).toBe(0);
    expect(normalizeKeyword('  코인   시그널 ')).toBe('코인 시그널');
    expect(normalizeKeyword('   ')).toBeNull();
  });
});
