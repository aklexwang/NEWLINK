import {
  isContactsSearchUser,
  publicUsernamesFromContactsSearch,
  shouldKeepKeywordSearchHit,
} from './mtproto-search.logic';

describe('publicUsernamesFromContactsSearch', () => {
  it('사용자 계정 결과는 버리고 공개 채널·그룹만 남긴다', () => {
    const hits = publicUsernamesFromContactsSearch({
      users: [
        { className: 'User', username: 'alice', firstName: 'Alice' },
        { className: 'PeerUser', username: 'bob' },
      ],
      chats: [
        { className: 'User', username: 'should_drop', title: '사람' },
        {
          className: 'Channel',
          username: 'news_kr',
          title: '뉴스방',
          broadcast: true,
        },
        {
          className: 'Channel',
          username: 'talk_kr',
          title: '수다',
          megagroup: true,
        },
        { className: 'Channel', title: '비공개' },
        { className: 'Chat', username: 'basic_group', title: '기본그룹' },
      ],
    });
    expect(hits.map((h) => h.username)).toEqual(['news_kr', 'talk_kr']);
    expect(hits[0].linkType).toBe('channel');
    expect(hits[1].linkType).toBe('group');
  });

  it('User 클래스면 검색 사용자로 본다', () => {
    expect(isContactsSearchUser({ className: 'User' })).toBe(true);
    expect(isContactsSearchUser({ className: 'Channel' })).toBe(false);
  });

  it('인원 100명 미만과 외국어 제목은 추가 요청 없이 버린다', () => {
    const hits = publicUsernamesFromContactsSearch({
      chats: [
        {
          className: 'Channel',
          username: 'tiny_kr',
          title: '작은방',
          participantsCount: 20,
        },
        {
          className: 'Channel',
          username: 'moscow_news',
          title: 'Новости Москвы сегодня',
          participantsCount: 5000,
        },
        {
          className: 'Channel',
          username: 'ok_kr',
          title: '한국뉴스',
          participantsCount: 150,
        },
      ],
    });
    expect(hits.map((h) => h.username)).toEqual(['ok_kr']);
    expect(hits[0].memberCount).toBe(150);
  });
});

describe('shouldKeepKeywordSearchHit', () => {
  it('한글 제목은 남기고 인원만 본다', () => {
    expect(
      shouldKeepKeywordSearchHit({ title: '주식정보', memberCount: 100 }),
    ).toBe(true);
    expect(
      shouldKeepKeywordSearchHit({ title: '주식정보', memberCount: 99 }),
    ).toBe(false);
  });

  it('한글이 없고 키릴 문자가 뚜렷하면 버린다', () => {
    expect(
      shouldKeepKeywordSearchHit({
        title: 'Новости Москвы сегодня',
        memberCount: 2000,
      }),
    ).toBe(false);
  });

  it('영문만 있으면 이 단계에서는 남긴다', () => {
    expect(
      shouldKeepKeywordSearchHit({ title: 'Crypto News', memberCount: 200 }),
    ).toBe(true);
  });
});
