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
import * as queueQuery from './collect-queue.query';
import { TME_COOLDOWN_MIN_MS, TmeGate } from './tme-gate';

type Loose = Record<string, any>;

function channel(overrides: Partial<Channel> = {}): Channel {
  return {
    id: 'c1',
    title: '기존 제목',
    titleLocked: false,
    description: '옛 소개',
    link: 'https://t.me/grp_kr',
    username: 'grp_kr',
    status: ChannelStatus.ACTIVE,
    linkType: LinkType.GROUP,
    firstObservedAt: new Date('2026-10-01T00:00:00+09:00'),
    collectStatus: 'ok',
    createdAt: new Date(),
    memberCount: 100,
    posts7d: 3,
    avatarApproved: false,
    collectFailCount: 0,
    ...overrides,
  } as Channel;
}

function build() {
  const service = Object.create(
    ChannelCollectorService.prototype,
  ) as ChannelCollectorService;
  const target = service as unknown as Loose;
  const gate = new TmeGate({ collectMax: 3 });
  target.gateOverride = gate;
  target.logger = { log: jest.fn(), warn: jest.fn() };
  target.recordEvent = jest.fn(async () => undefined);
  target.postRepository = { count: jest.fn().mockResolvedValue(0) };
  target.channelRepository = {
    save: jest.fn(async (row: Channel) => row),
    find: jest.fn(async () => []),
    findOneBy: jest.fn(),
  };
  target.configService = { get: jest.fn(() => 'test-token') };
  target.mtproto = { canCollect: jest.fn(() => false) };
  target.upsertTodayMemberCount = jest.fn(async () => undefined);
  return { service, target, gate };
}

const GROUP_HTML = `
<div class="tgme_page_title"><span>우리 그룹</span></div>
<div class="tgme_page_extra">1 234 members, 12 online</div>
<div class="tgme_page_description">첫 줄<br>둘째 줄</div>`;

function fakeResponse(status: number, body = '<html></html>', retryAfter?: string) {
  return {
    status,
    url: 'https://t.me/x',
    headers: new Headers(retryAfter ? { 'retry-after': retryAfter } : undefined),
    text: async () => body,
  } as unknown as Response;
}

describe('그룹 수집: 공개 페이지 우선, Bot 은 폴백', () => {
  it('공개 페이지가 읽히면 Bot 을 부르지 않고 제목·인원·소개를 채운다', async () => {
    const { target, service } = build();
    target.fetchHtml = jest.fn(async () => ({
      status: 200,
      html: GROUP_HTML,
      finalUrl: 'https://t.me/grp_kr',
    }));
    target.collectViaBot = jest.fn();
    const row = channel();

    const result = await target.collectGroup(row, 'grp_kr');

    expect(result).toEqual({ ok: true, mode: 'preview' });
    expect(target.collectViaBot).not.toHaveBeenCalled();
    expect(row.title).toBe('우리 그룹');
    expect(row.memberCount).toBe(1234);
    expect(row.description).toBe('첫 줄\n둘째 줄');
    expect(row.collectStatus).toBe('ok');
    expect(target.upsertTodayMemberCount).toHaveBeenCalledWith('c1', 1234);
    expect(service).toBeDefined();
  });

  it.each([
    ['429 한도', { status: 429, html: null, error: 'fetch:429' }],
    ['타임아웃', { status: 0, html: null, error: 'fetch:timeout' }],
    ['빈 응답', { status: 200, html: null }],
    ['서버 오류', { status: 503, html: '<html></html>' }],
    [
      '채널·그룹을 알 수 없는 페이지',
      { status: 200, html: '<div class="tgme_page_title">x</div>' },
    ],
  ])('%s 이면 Bot API 로 넘긴다', async (_label, page) => {
    const { target } = build();
    target.fetchHtml = jest.fn(async () => page);
    target.collectViaBot = jest.fn(async () => ({ ok: true, mode: 'bot' }));
    const row = channel();

    const result = await target.collectGroup(row, 'grp_kr');

    expect(result).toEqual({ ok: true, mode: 'bot' });
    expect(target.collectViaBot).toHaveBeenCalledTimes(1);
    expect(target.collectViaBot).toHaveBeenCalledWith(row, 'grp_kr');
  });

  it('공개 페이지가 없다고 하면(404) Bot 없이 사라짐 진행으로 처리한다', async () => {
    const { target } = build();
    target.fetchHtml = jest.fn(async () => ({ status: 404, html: null }));
    target.collectViaBot = jest.fn();
    const row = channel();

    const result = await target.collectGroup(row, 'grp_kr');

    expect(result).toEqual({ ok: false, reason: 'failed' });
    expect(target.collectViaBot).not.toHaveBeenCalled();
    expect(row.collectFailCount).toBe(1);
    expect(row.collectError).toBe('page:not_found');
  });

  it('collectOne 에서 공개 아이디 그룹은 공개 페이지로, 초대 링크 그룹은 기존 경로로 간다', async () => {
    const { target } = build();
    target.classifyAccount = jest.fn(async () => ({
      status: 'ok',
      exactMemberCount: null,
    }));
    target.collectGroup = jest.fn(async () => ({ ok: true, mode: 'preview' }));
    target.collectInvitePreview = jest.fn(async () => ({
      ok: true,
      mode: 'preview',
    }));
    const publicGroup = channel({ id: 'g1' });
    const inviteGroup = channel({
      id: 'g2',
      link: 'https://t.me/+AbCdEf123',
      username: null,
    });
    target.channelRepository.findOneBy = jest.fn(
      async ({ id }: { id: string }) => (id === 'g1' ? publicGroup : inviteGroup),
    );

    await target.collectOne(publicGroup);
    expect(target.collectGroup).toHaveBeenCalledTimes(1);
    expect(target.collectInvitePreview).not.toHaveBeenCalled();

    await target.collectOne(inviteGroup);
    expect(target.collectInvitePreview).toHaveBeenCalledTimes(1);
    expect(target.collectGroup).toHaveBeenCalledTimes(1);
  });

  it('Bot 429 는 건수를 세고, 한도 대기 중에는 Bot 을 다시 부르지 않는다', async () => {
    const { target, gate } = build();
    target.botGetChat = jest.fn(async () => ({
      ok: false,
      title: null,
      chatId: null,
      errorCode: 429,
      description: 'Too Many Requests: retry after 5',
    }));
    const row = channel();

    const first = await target.collectViaBot(row, 'grp_kr');
    expect(first).toEqual({ ok: false, reason: 'failed' });
    expect(gate.snapshot().today.bot429).toBe(1);
    // 채널 상태는 건드리지 않는다
    expect(target.channelRepository.save).not.toHaveBeenCalled();

    await target.collectViaBot(row, 'grp_kr');
    expect(target.botGetChat).toHaveBeenCalledTimes(1);
    expect(gate.snapshot().today.bot429).toBe(1);
    // Bot 429 는 t.me 쿨다운·동시 수에 영향을 주지 않는다
    expect(gate.snapshot().coolingRemainingMs).toBe(0);
    expect(gate.collectLimit()).toBe(2);
  });
});

describe('light 수집', () => {
  it('큐에서 light 대상만 뽑고, 채널만 오늘 대상으로 고른다', async () => {
    const { target } = build();
    const rows = [
      channel({ id: 'a', linkType: LinkType.CHANNEL, username: 'a_ch', link: 'https://t.me/a_ch' }),
      channel({ id: 'b', linkType: LinkType.CHANNEL, username: 'b_ch', link: 'https://t.me/b_ch' }),
      channel({ id: 'g', linkType: LinkType.GROUP, username: 'g_gr', link: 'https://t.me/g_gr' }),
    ];
    const pick = jest
      .spyOn(queueQuery, 'selectDueChannels')
      .mockResolvedValue(rows);
    const handled: string[] = [];
    target.collectOneSafe = jest.fn(async (row: Channel) => {
      handled.push(row.id);
      return { ok: true, mode: 'preview' };
    });

    const result = await target.collectLightAll();

    expect(pick).toHaveBeenCalledTimes(1);
    expect(pick.mock.calls[0][1]).toMatchObject({ light: true });
    // 큐가 건넨 목록 중 채널(그룹 제외)만 수집한다
    pick.mockRestore();
    expect(handled.sort()).toEqual(['a', 'b']);
    expect(result).toEqual({ ok: 2, fail: 0, remaining: 0 });
  });

  it('light 요청은 1회만 시도하고, 429 뒤 쿨다운 중에는 요청하지 않는다', async () => {
    const { target, gate } = build();
    const spy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(fakeResponse(429, 'slow', '7'));
    try {
      const first = await target.fetchHtml('https://t.me/s/a_ch', { light: true });
      expect(first.status).toBe(429);
      expect(first.error).toBe('fetch:429');
      expect(spy).toHaveBeenCalledTimes(1);
      const cooling = gate.snapshot().coolingRemainingMs;
      expect(cooling).toBeGreaterThan(TME_COOLDOWN_MIN_MS - 1_000);
      expect(cooling).toBeLessThanOrEqual(TME_COOLDOWN_MIN_MS);
      expect(gate.collectLimit()).toBe(1);

      const second = await target.fetchHtml('https://t.me/s/b_ch', { light: true });
      expect(second.status).toBe(429);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(gate.snapshot().active.collect).toBe(0);
    } finally {
      spy.mockRestore();
    }
  });

  it('light 에서 429 가 나도 채널을 failed 로 표시하지 않는다', async () => {
    const { target } = build();
    target.fetchPreviewPage = jest.fn(async () => ({
      status: 429,
      html: null,
      error: 'fetch:429',
    }));
    target.markFailed = jest.fn();
    target.markGoneProgress = jest.fn();
    const row = channel({ linkType: LinkType.CHANNEL });

    const result = await target.collectPublicPreview(row, 'grp_kr');

    expect(result).toEqual({ ok: false, reason: 'failed' });
    expect(target.markFailed).not.toHaveBeenCalled();
    expect(target.markGoneProgress).not.toHaveBeenCalled();
    expect(target.fetchPreviewPage).toHaveBeenCalledWith('grp_kr', undefined, {
      light: true,
    });
    expect(row.collectStatus).toBe('ok');
  });

  it('full 경로의 t.me 요청도 같은 게이트를 지난다', async () => {
    const { target, gate } = build();
    const acquire = jest.spyOn(gate, 'acquire');
    const release = jest.spyOn(gate, 'release');
    const spy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(fakeResponse(200, '<html>ok</html>'));
    try {
      const page = await target.fetchHtml('https://t.me/grp_kr');
      expect(page.status).toBe(200);
      expect(acquire).toHaveBeenCalledWith('collect', { maxWaitMs: 60_000 });
      expect(release).toHaveBeenCalledWith('collect');
      expect(gate.snapshot().active.collect).toBe(0);
    } finally {
      spy.mockRestore();
    }
  });
});
