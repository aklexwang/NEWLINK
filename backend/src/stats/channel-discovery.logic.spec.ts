import {
  aggregateMentionedUsernames,
  usernamesFromPost,
} from './channel-discovery.logic';

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

  it('한 채널만 반복 언급하면 제외한다', () => {
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
    expect(result).toEqual([]);
  });
});
