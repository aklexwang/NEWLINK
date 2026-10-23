import {
  aggregateMentionedUsernames,
  DISCOVERY_MAX_PER_DAY,
  mergeDiscoveryQueue,
  passesSnowballDiscovery,
  shouldQueueSnowballCandidate,
  isDiscoverySourceChannel,
  usernamesFromPost,
} from './channel-discovery.logic';

describe('눈덩이 소스', () => {
  it('그룹 메시지는 쓰지 않고 채널만 씁니다', () => {
    expect(isDiscoverySourceChannel('channel')).toBe(true);
    expect(isDiscoverySourceChannel('group')).toBe(false);
  });
});

describe('usernamesFromPost', () => {
  it('본문 언급과 전달 출처를 합친다', () => {
    expect(
      usernamesFromPost({
        sourceChannelId: 'a',
        sourceUsername: 'news_kr',
        forwardedFrom: 'https://t.me/source_ch/9',
        mentionedUsernames: 'alpha,beta',
      }),
    ).toEqual(['alpha', 'beta', 'source_ch']);
  });

  it('자기 자신과 봇은 뺀다', () => {
    expect(
      usernamesFromPost({
        sourceChannelId: 'a',
        sourceUsername: 'news_kr',
        forwardedFrom: 'https://t.me/news_kr/1',
        mentionedUsernames: 'news_kr,helper_bot,goodchan',
      }),
    ).toEqual(['goodchan']);
  });
});

describe('aggregateMentionedUsernames', () => {
  it('하루 검사 상한은 200이다', () => {
    expect(DISCOVERY_MAX_PER_DAY).toBe(200);
  });

  it('서로 다른 채널 2곳 이상에서만 집계한다', () => {
    const rows = [
      {
        sourceChannelId: 'c1',
        sourceUsername: 'one',
        forwardedFrom: null,
        mentionedUsernames: 'adchan,adchan',
      },
      {
        sourceChannelId: 'c1',
        sourceUsername: 'one',
        forwardedFrom: 'https://t.me/adchan/3',
        mentionedUsernames: null,
      },
      {
        sourceChannelId: 'c2',
        sourceUsername: 'two',
        forwardedFrom: null,
        mentionedUsernames: 'adchan,other',
      },
      {
        sourceChannelId: 'c3',
        sourceUsername: 'three',
        forwardedFrom: 'https://t.me/other/1',
        mentionedUsernames: null,
      },
    ];
    const result = aggregateMentionedUsernames(rows);
    expect(result.map((r) => r.username).sort()).toEqual(['adchan', 'other']);
    const ad = result.find((r) => r.username === 'adchan');
    expect(ad?.mentionCount).toBe(2);
    expect(ad?.sourceChannelIds.sort()).toEqual(['c1', 'c2']);
    const other = result.find((r) => r.username === 'other');
    expect(other?.mentionCount).toBe(2);
  });

  it('한 채널만 반복 언급해도 집계에는 남긴다', () => {
    const result = aggregateMentionedUsernames([
      {
        sourceChannelId: 'only',
        sourceUsername: 'spam',
        forwardedFrom: null,
        mentionedUsernames: 'promo',
      },
      {
        sourceChannelId: 'only',
        sourceUsername: 'spam',
        forwardedFrom: 'https://t.me/promo/8',
        mentionedUsernames: 'promo',
      },
    ]);
    expect(result).toEqual([
      { username: 'promo', sourceChannelIds: ['only'], mentionCount: 1 },
    ]);
  });
});

describe('shouldQueueSnowballCandidate', () => {
  it('MTProto 가 꺼져 있으면 2곳 이상만 큐에 넣는다', () => {
    expect(shouldQueueSnowballCandidate(1, false)).toBe(false);
    expect(shouldQueueSnowballCandidate(2, false)).toBe(true);
  });

  it('MTProto 가 켜져 있으면 1곳 언급도 큐에 넣는다', () => {
    expect(shouldQueueSnowballCandidate(1, true)).toBe(true);
  });
});

describe('passesSnowballDiscovery', () => {
  it('2곳 언급이면 인원 100명 이상이면 통과한다', () => {
    expect(
      passesSnowballDiscovery({
        mentionCount: 2,
        memberCount: 120,
        membersFromMtproto: false,
      }),
    ).toBe(true);
  });

  it('1곳 언급은 t.me 인원으로는 통과하지 않는다', () => {
    expect(
      passesSnowballDiscovery({
        mentionCount: 1,
        memberCount: 5000,
        membersFromMtproto: false,
      }),
    ).toBe(false);
  });

  it('1곳 언급은 MTProto 인원 1,000명 이상이면 통과한다', () => {
    expect(
      passesSnowballDiscovery({
        mentionCount: 1,
        memberCount: 1000,
        membersFromMtproto: true,
      }),
    ).toBe(true);
    expect(
      passesSnowballDiscovery({
        mentionCount: 1,
        memberCount: 999,
        membersFromMtproto: true,
      }),
    ).toBe(false);
  });
});

describe('mergeDiscoveryQueue', () => {
  it('키워드 대기열을 언급 후보 뒤에 넣고 중복 username 은 한 번만 둔다', () => {
    const queue = mergeDiscoveryQueue(
      [
        {
          username: 'dup',
          sourceChannelIds: ['a', 'b'],
          mentionCount: 2,
        },
      ],
      ['dup', 'from_search'],
      new Set(),
      new Set(),
      true,
    );
    expect(queue.map((item) => item.username)).toEqual(['dup', 'from_search']);
    expect(queue[0].source).toBe('mention');
    expect(queue[1].source).toBe('keyword');
  });

  it('MTProto 가 꺼져 있으면 키워드 대기열은 검사하지 않는다', () => {
    const queue = mergeDiscoveryQueue(
      [
        {
          username: 'adchan',
          sourceChannelIds: ['a', 'b'],
          mentionCount: 2,
        },
      ],
      ['from_search'],
      new Set(),
      new Set(),
      false,
    );
    expect(queue.map((item) => item.username)).toEqual(['adchan']);
  });
});
