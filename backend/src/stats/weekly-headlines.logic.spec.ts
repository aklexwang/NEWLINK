import { ChannelStatus } from '../channels/channel.entity';
import {
  collapseWeeklyRankUps,
  isWeeklyHeadlineChannel,
} from './weekly-headlines.logic';

const observed = new Date('2026-10-01T00:00:00+09:00');

function ch(
  overrides: Partial<Parameters<typeof isWeeklyHeadlineChannel>[0]> = {},
) {
  return {
    status: ChannelStatus.ACTIVE,
    firstObservedAt: observed,
    collectStatus: 'ok' as const,
    isVisible: true,
    language: 'ko',
    category: '뉴스',
    ...overrides,
  };
}

describe('isWeeklyHeadlineChannel', () => {
  it('active·공개 수집·한국어·일반 카테고리는 남긴다', () => {
    expect(isWeeklyHeadlineChannel(ch())).toBe(true);
    expect(isWeeklyHeadlineChannel(ch({ language: 'unknown' }))).toBe(true);
  });

  it('성인 카테고리는 제외하고 카지노는 남긴다', () => {
    expect(isWeeklyHeadlineChannel(ch({ category: '성인' }))).toBe(false);
    expect(isWeeklyHeadlineChannel(ch({ category: '카지노' }))).toBe(true);
  });

  it('외국어·숨김·비활성·gone 계열은 제외한다', () => {
    expect(isWeeklyHeadlineChannel(ch({ language: 'foreign' }))).toBe(false);
    expect(isWeeklyHeadlineChannel(ch({ isVisible: false }))).toBe(false);
    expect(isWeeklyHeadlineChannel(ch({ status: 'pending' }))).toBe(false);
    expect(isWeeklyHeadlineChannel(ch({ collectStatus: 'invalid' }))).toBe(
      false,
    );
    expect(isWeeklyHeadlineChannel(ch({ collectStatus: 'gone' }))).toBe(false);
    expect(isWeeklyHeadlineChannel(ch({ collectStatus: 'merged' }))).toBe(
      false,
    );
    expect(
      isWeeklyHeadlineChannel(ch({ collectStatus: 'invite_expired' })),
    ).toBe(false);
  });
});

describe('collapseWeeklyRankUps', () => {
  it('같은 채널이 여러 번 올라도 1건이며 처음·마지막 순위를 쓴다', () => {
    const collapsed = collapseWeeklyRankUps([
      {
        id: 'e2',
        channelId: 'a',
        occurredAt: '2026-10-22T00:00:00.000Z',
        before: '20',
        after: '8',
      },
      {
        id: 'e1',
        channelId: 'a',
        occurredAt: '2026-10-20T00:00:00.000Z',
        before: '40',
        after: '20',
      },
      {
        id: 'e3',
        channelId: 'b',
        occurredAt: '2026-10-21T00:00:00.000Z',
        before: '15',
        after: '10',
      },
    ]);
    expect(collapsed).toHaveLength(2);
    const a = collapsed.find((row) => row.channelId === 'a');
    expect(a).toMatchObject({
      id: 'e2',
      before: '40',
      after: '8',
    });
    expect(collapsed.filter((row) => row.channelId === 'a')).toHaveLength(1);
  });
});
