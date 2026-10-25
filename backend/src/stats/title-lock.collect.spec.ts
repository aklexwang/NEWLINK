// 수집 서비스가 ESM 패키지를 끌고 오므로 Jest 에서 읽히지 않는 것만 자리로 대신한다.
jest.mock('jose', () => ({
  createRemoteJWKSet: jest.fn(),
  jwtVerify: jest.fn(),
}));
jest.mock('@nestjs/schedule', () => ({
  ScheduleModule: { forRoot: () => ({ module: class ScheduleRootMock {} }) },
  Cron: () => () => undefined,
}));

import { Channel, ChannelStatus, LinkType } from '../channels/channel.entity';
import { ChannelCollectorService } from './channel-collector.service';
import { MtprotoCollectorService } from './mtproto-collector.service';

function channel(overrides: Partial<Channel> = {}): Channel {
  return {
    id: 'c1',
    title: '어드민이 정한 제목',
    titleLocked: true,
    description: '옛 소개',
    link: 'https://t.me/news_kr',
    username: 'news_kr',
    status: ChannelStatus.ACTIVE,
    linkType: LinkType.CHANNEL,
    firstObservedAt: new Date('2026-10-01T00:00:00+09:00'),
    collectStatus: 'ok',
    createdAt: new Date('2026-09-01T00:00:00+09:00'),
    memberCount: 100,
    posts7d: 0,
    avatarApproved: false,
    ...overrides,
  } as Channel;
}

describe('제목 고정과 수집 (HTML 수집 경로)', () => {
  function build() {
    const service = Object.create(
      ChannelCollectorService.prototype,
    ) as ChannelCollectorService;
    const events: Array<{ type: string; before: unknown; after: unknown }> = [];
    const target = service as unknown as Record<string, unknown>;
    target.recordEvent = jest.fn(
      async (_id: string, type: string, before: unknown, after: unknown) => {
        events.push({ type, before, after });
      },
    );
    target.postRepository = { count: jest.fn().mockResolvedValue(0) };
    target.channelRepository = {
      save: jest.fn(async (row: Channel) => row),
    };
    const apply = (row: Channel, info: Record<string, unknown>) =>
      (
        service as unknown as {
          applySuccessfulCollect: (c: Channel, i: unknown) => Promise<void>;
        }
      ).applySuccessfulCollect(row, info);
    return { apply, events };
  }

  it('제목이 고정이면 수집이 제목을 덮어쓰지 않고 소개글은 갱신한다', async () => {
    const { apply, events } = build();
    const row = channel({ titleLocked: true });
    await apply(row, {
      title: '텔레그램 제목',
      memberCount: 500,
      username: 'news_kr',
      description: '새 소개글',
    });
    expect(row.title).toBe('어드민이 정한 제목');
    expect(row.description).toBe('새 소개글');
    expect(row.memberCount).toBe(500);
    expect(events.some((e) => e.type === 'title_changed')).toBe(false);
  });

  it('고정을 풀면 다음 수집에서 텔레그램 제목으로 바뀌고 이벤트가 남는다', async () => {
    const { apply, events } = build();
    const row = channel({ titleLocked: false });
    await apply(row, {
      title: '텔레그램 제목',
      memberCount: 500,
      username: 'news_kr',
    });
    expect(row.title).toBe('텔레그램 제목');
    expect(events).toContainEqual({
      type: 'title_changed',
      before: '어드민이 정한 제목',
      after: '텔레그램 제목',
    });
  });
});

describe('제목 고정과 수집 (MTProto 경로)', () => {
  function build() {
    const service = Object.create(
      MtprotoCollectorService.prototype,
    ) as MtprotoCollectorService;
    const events: Array<{ type: string }> = [];
    const target = service as unknown as Record<string, unknown>;
    target.postRepository = {
      delete: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
      upsert: jest.fn(),
    };
    target.eventRepository = {
      save: jest.fn(async (row: { type: string }) => {
        events.push(row);
      }),
    };
    target.channelRepository = {
      save: jest.fn(async (row: Channel) => row),
    };
    target.snapshotRepository = { upsert: jest.fn() };
    const persist = (row: Channel, title: string) =>
      (
        service as unknown as {
          persist: (c: Channel, d: unknown) => Promise<void>;
        }
      ).persist(row, {
        username: 'news_kr',
        title,
        description: '새 소개글',
        memberCount: 700,
        createdOn: null,
        telegramChatId: null,
        inputChannel: { channelId: 1, accessHash: null },
        linkType: LinkType.CHANNEL,
        posts: [],
        activity: { activity24h: 0, activity7d: 0 },
      });
    return { persist, events };
  }

  it('제목이 고정이면 제목은 그대로, 소개글·인원은 갱신한다', async () => {
    const { persist, events } = build();
    const row = channel({ titleLocked: true });
    await persist(row, '텔레그램 제목');
    expect(row.title).toBe('어드민이 정한 제목');
    expect(row.description).toBe('새 소개글');
    expect(row.memberCount).toBe(700);
    expect(events.some((e) => e.type === 'title_changed')).toBe(false);
  });

  it('고정이 아니면 제목이 바뀐다', async () => {
    const { persist, events } = build();
    const row = channel({ titleLocked: false });
    await persist(row, '텔레그램 제목');
    expect(row.title).toBe('텔레그램 제목');
    expect(events.some((e) => e.type === 'title_changed')).toBe(true);
  });
});
