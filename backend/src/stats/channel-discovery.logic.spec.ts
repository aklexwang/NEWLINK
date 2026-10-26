import {
  aggregateMentionedUsernames,
  DISCOVERY_DELAY_MS,
  DISCOVERY_MAX_PER_DAY,
  DISCOVERY_QUEUED_MAX_PER_DAY_DEFAULT,
  mergeDiscoveryQueue,
  parseQueuedDailyMax,
  passesSnowballDiscovery,
  persistDiscoverySource,
  shouldQueueSnowballCandidate,
  splitDiscoveryDeadlines,
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
  it('하루 검사 상한은 1000이다', () => {
    expect(DISCOVERY_MAX_PER_DAY).toBe(1000);
    expect(DISCOVERY_DELAY_MS).toBe(1000);
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
  it('공개 페이지 확인이라 1곳 언급도 큐에 넣는다', () => {
    expect(shouldQueueSnowballCandidate(1)).toBe(true);
    expect(shouldQueueSnowballCandidate(2)).toBe(true);
  });
});

describe('passesSnowballDiscovery', () => {
  it('2곳 언급이면 인원 100명 이상이면 통과한다', () => {
    expect(
      passesSnowballDiscovery({
        mentionCount: 2,
        memberCount: 120,
      }),
    ).toBe(true);
  });

  it('1곳 언급도 공개 페이지 인원 100명이면 통과한다', () => {
    expect(
      passesSnowballDiscovery({
        mentionCount: 1,
        memberCount: 100,
      }),
    ).toBe(true);
    expect(
      passesSnowballDiscovery({
        mentionCount: 1,
        memberCount: 99,
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
      [
        { username: 'dup', source: 'keyword' },
        { username: 'from_search', source: 'keyword' },
      ],
      new Set(),
      new Set(),
    );
    expect(queue.map((item) => item.username)).toEqual(['dup', 'from_search']);
    expect(queue[0].source).toBe('mention');
    expect(queue[1].source).toBe('keyword');
  });

  it('키워드 대기열도 공개 페이지로 확인한다', () => {
    const queue = mergeDiscoveryQueue(
      [
        {
          username: 'adchan',
          sourceChannelIds: ['a', 'b'],
          mentionCount: 2,
        },
      ],
      [{ username: 'from_search', source: 'keyword' }],
      new Set(),
      new Set(),
    );
    expect(queue.map((item) => item.username)).toEqual([
      'adchan',
      'from_search',
    ]);
  });

  it('source 가 비어 있는 queued 는 other 로 둔다', () => {
    const queue = mergeDiscoveryQueue(
      [],
      [{ username: 'bulk_chan', source: null }],
      new Set(),
      new Set(),
    );
    expect(queue[0].source).toBe('other');
    expect(persistDiscoverySource(queue[0].source)).toBe('other');
    expect(persistDiscoverySource('keyword')).toBe('keyword');
    expect(persistDiscoverySource('linked')).toBe('linked');
    expect(persistDiscoverySource('mention')).toBe('snowball');
  });
});

describe('대기열 검사 한도·예산', () => {
  it('queued 하루 한도 기본은 300이다', () => {
    expect(DISCOVERY_QUEUED_MAX_PER_DAY_DEFAULT).toBe(300);
    expect(parseQueuedDailyMax(undefined)).toBe(300);
    expect(parseQueuedDailyMax('120')).toBe(120);
  });

  it('15분 중 queued 에 최소 5분을 남긴다', () => {
    const now = 1_000_000;
    const deadline = now + 15 * 60 * 1000;
    const split = splitDiscoveryDeadlines(deadline, now);
    expect(split.queuedDeadlineMs).toBe(deadline);
    expect(split.mentionDeadlineMs).toBe(deadline - 5 * 60 * 1000);
  });
});
