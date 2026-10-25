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

type Loose = Record<string, any>;

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function channel(overrides: Partial<Channel> = {}): Channel {
  return {
    id: 'c1',
    title: '기존 제목',
    titleLocked: false,
    description: '옛 소개',
    link: 'https://t.me/a_ch',
    username: 'a_ch',
    status: ChannelStatus.ACTIVE,
    linkType: LinkType.CHANNEL,
    firstObservedAt: new Date('2026-09-01T00:00:00+09:00'),
    collectStatus: 'ok',
    createdAt: new Date(Date.now() - 60 * DAY),
    memberCount: 500,
    posts7d: 0,
    avatarApproved: false,
    collectFailCount: 0,
    collectGoneCount: 0,
    nextCollectAt: null,
    ...overrides,
  } as Channel;
}

function build(posts7d = 0) {
  const service = Object.create(
    ChannelCollectorService.prototype,
  ) as ChannelCollectorService;
  const target = service as unknown as Loose;
  target.logger = { log: jest.fn(), warn: jest.fn() };
  target.recordEvent = jest.fn(async () => undefined);
  target.postRepository = { count: jest.fn().mockResolvedValue(posts7d) };
  target.channelRepository = {
    save: jest.fn(async (row: Channel) => row),
    findOneBy: jest.fn(),
  };
  target.upsertTodayMemberCount = jest.fn(async () => undefined);
  target.upsertPosts = jest.fn(async () => undefined);
  return target;
}

/** 저장된 다음 수집 시각이 지금부터 몇 시간 뒤인지 */
function hoursAhead(row: Channel, before: number): number {
  return Math.round(((row.nextCollectAt as Date).getTime() - before) / HOUR);
}

describe('수집 성공 후 next_collect_at', () => {
  it('휴면 채널은 72시간 뒤, 핫 채널은 12시간 뒤', async () => {
    const target = build(0);
    const dormant = channel({ memberCount: 10 });
    let before = Date.now();
    await target.applySuccessfulCollect(dormant, {
      title: '휴면',
      memberCount: 10,
    });
    expect(hoursAhead(dormant, before)).toBe(72);

    const hot = channel({ memberCount: 50_000 });
    before = Date.now();
    await target.applySuccessfulCollect(hot, {
      title: '핫',
      memberCount: 50_000,
    });
    expect(hoursAhead(hot, before)).toBe(12);
  });

  it('이번에 센 7일 게시 수로 구간을 정한다 (게시 3개 → 조용 48시간)', async () => {
    const target = build(3);
    const row = channel({ memberCount: 100 });
    const before = Date.now();
    await target.applySuccessfulCollect(row, { title: '조용', memberCount: 100 });
    expect(row.posts7d).toBe(3);
    expect(hoursAhead(row, before)).toBe(48);
  });

  it('성공하면 실패·gone 횟수를 0으로 되돌린다', async () => {
    const target = build(0);
    const row = channel({
      collectStatus: 'failed',
      collectFailCount: 3,
      collectGoneCount: 2,
    });
    await target.applySuccessfulCollect(row, { title: 'x', memberCount: 100 });
    expect(row.collectStatus).toBe('ok');
    expect(row.collectFailCount).toBe(0);
    expect(row.collectGoneCount).toBe(0);
  });
});

describe('수집 실패 백오프', () => {
  it('실패할 때마다 collect_fail_count 가 늘고 간격은 1배 → 2배 → 4배', async () => {
    const target = build();
    // 핫 채널(목표 12시간)로 간격 변화를 본다
    const row = channel({ memberCount: 50_000 });
    const waits: number[] = [];
    for (let i = 0; i < 3; i += 1) {
      const before = Date.now();
      await target.markFailed(row, 'failed', 'fetch:timeout');
      waits.push(hoursAhead(row, before));
    }
    expect(row.collectFailCount).toBe(3);
    expect(waits).toEqual([12, 24, 48]);
    expect(row.collectStatus).toBe('failed');
  });

  it('실패 간격은 최대 7일', async () => {
    const target = build();
    const row = channel({ memberCount: 10, collectFailCount: 5 });
    const before = Date.now();
    await target.markFailed(row, 'private', 'preview:private');
    expect(hoursAhead(row, before)).toBe(7 * 24);
    expect(row.collectStatus).toBe('private');
  });

  it('일반 실패는 gone 횟수를 늘리지 않는다 (gone 3회 규칙 유지)', async () => {
    const target = build();
    const row = channel({ collectGoneCount: 0 });
    for (let i = 0; i < 5; i += 1) {
      await target.markFailed(row, 'failed', 'fetch:timeout');
    }
    expect(row.collectFailCount).toBe(5);
    expect(row.collectGoneCount).toBe(0);
    expect(row.collectStatus).toBe('failed');
  });

  it('not_found 가 3번 이어져야 gone 이 되고, 그 뒤 간격은 4배로 뜸해진다', async () => {
    const target = build();
    const row = channel({ memberCount: 50_000 });

    await target.markGoneProgress(row, 'preview:not_found');
    await target.markFailed(row, 'failed', 'fetch:timeout'); // 사이에 낀 일반 실패
    await target.markGoneProgress(row, 'preview:not_found');
    expect(row.collectStatus).toBe('failed');
    expect(row.collectGoneCount).toBe(2);

    const before = Date.now();
    const result = await target.markGoneProgress(row, 'preview:not_found');
    expect(result).toEqual({ ok: false, reason: 'gone' });
    expect(row.collectStatus).toBe('gone');
    expect(row.collectGoneCount).toBe(3);
    // 실패 4번째 → 12h x 4
    expect(hoursAhead(row, before)).toBe(48);
  });

  it('기존 행(collect_gone_count 가 비어 있음)도 안전하다', async () => {
    const target = build();
    const row = channel({ collectGoneCount: undefined as unknown as number });
    await target.markGoneProgress(row, 'preview:not_found');
    expect(row.collectGoneCount).toBe(1);
  });

  it('만료된 초대 링크와 invalid 는 7일 뒤에 다시 본다', async () => {
    const target = build();
    const invite = channel({ linkType: LinkType.GROUP });
    let before = Date.now();
    await target.markInviteExpired(invite);
    expect(invite.collectStatus).toBe('invite_expired');
    expect(hoursAhead(invite, before)).toBe(7 * 24);

    const invalid = channel();
    before = Date.now();
    await target.markInvalid(invalid, 'page:user');
    expect(invalid.collectStatus).toBe('invalid');
    expect(hoursAhead(invalid, before)).toBe(7 * 24);
  });

  it('429 한도는 실패로 세지 않고 다음 수집 시각도 바꾸지 않는다', async () => {
    const target = build();
    target.fetchPreviewPage = jest.fn(async () => ({
      status: 429,
      html: null,
      error: 'fetch:429',
    }));
    const row = channel({ collectFailCount: 1 });
    const result = await target.collectPublicPreview(row, 'a_ch');
    expect(result).toEqual({ ok: false, reason: 'failed' });
    expect(row.collectFailCount).toBe(1);
    expect(row.nextCollectAt).toBeNull();
    expect(target.channelRepository.save).not.toHaveBeenCalled();
  });
});

const PREVIEW_HTML = (counter: string) => `
<div class="tgme_channel_info">
  <div class="tgme_channel_info_header_title"><span>샘플 채널</span></div>
  <div class="tgme_channel_info_counter"><span class="counter_value">${counter}</span> <span class="counter_type">subscribers</span></div>
</div>
<div class="tgme_widget_message" data-post="a_ch/10"><time datetime="2026-10-25T00:00:00+00:00"></time></div>`;

describe('정확한 회원 수 우선 (light)', () => {
  async function runLight(stored: number | null, counter: string) {
    const target = build();
    target.fetchPreviewPage = jest.fn(async () => ({
      status: 200,
      html: PREVIEW_HTML(counter),
    }));
    const row = channel({ memberCount: stored });
    const result = await target.collectPublicPreview(row, 'a_ch');
    expect(result).toEqual({ ok: true, mode: 'preview' });
    return { row, target };
  }

  it('축약값이 오차 안이면 저장된 정확한 값을 덮어쓰지 않는다', async () => {
    const { row, target } = await runLight(40_892, '40.9K');
    expect(row.memberCount).toBe(40_892);
    // 일별 기록에도 정확한 값을 남긴다
    expect(target.upsertTodayMemberCount).toHaveBeenCalledWith('c1', 40_892);
  });

  it('오차를 벗어나면 축약값으로 갱신한다', async () => {
    const { row, target } = await runLight(40_892, '43.1K');
    expect(row.memberCount).toBe(43_100);
    expect(target.upsertTodayMemberCount).toHaveBeenCalledWith('c1', 43_100);
  });

  it('미리보기가 정확한 숫자(1천 미만)면 그대로 갱신한다', async () => {
    const { row } = await runLight(512, '523');
    expect(row.memberCount).toBe(523);
  });

  it('저장된 값이 없으면 축약값을 저장한다', async () => {
    const { row } = await runLight(null, '40.8K');
    expect(row.memberCount).toBe(40_800);
  });
});

describe('정확한 회원 수 우선 (full)', () => {
  it('계정 판별 페이지의 정확한 수가 미리보기 축약값보다 우선한다', async () => {
    const target = build();
    target.mtproto = { canCollect: jest.fn(() => false) };
    target.classifyAccount = jest.fn(async () => ({
      status: 'ok',
      exactMemberCount: 40_892,
    }));
    target.fetchPreviewPage = jest.fn(async () => ({
      status: 200,
      html: PREVIEW_HTML('40.8K'),
    }));
    target.fetchOlderPagesIfNeeded = jest.fn(async (_u: string, first: unknown) => first);
    const row = channel({ memberCount: 40_000 });
    target.channelRepository.findOneBy = jest.fn(async () => row);

    const result = await target.collectOne(row);

    expect(result).toEqual({ ok: true, mode: 'preview' });
    expect(row.memberCount).toBe(40_892);
  });

  it('판별 결과를 재사용한 날(정확한 수 없음)은 축약값이 오차 안이면 저장값을 지킨다', async () => {
    const target = build();
    target.mtproto = { canCollect: jest.fn(() => false) };
    target.classifyAccount = jest.fn(async () => ({
      status: 'ok',
      exactMemberCount: null,
    }));
    target.fetchPreviewPage = jest.fn(async () => ({
      status: 200,
      html: PREVIEW_HTML('40.9K'),
    }));
    target.fetchOlderPagesIfNeeded = jest.fn(async (_u: string, first: unknown) => first);
    const row = channel({ memberCount: 40_892 });
    target.channelRepository.findOneBy = jest.fn(async () => row);

    await target.collectOne(row);

    expect(row.memberCount).toBe(40_892);
  });

  it('그룹 공개 페이지의 정확한 수를 그대로 저장한다', async () => {
    const target = build();
    target.fetchHtml = jest.fn(async () => ({
      status: 200,
      html: '<div class="tgme_page_title"><span>우리 그룹</span></div><div class="tgme_page_extra">94 074 members, 4 455 online</div>',
      finalUrl: 'https://t.me/grp_kr',
    }));
    const row = channel({ linkType: LinkType.GROUP, memberCount: 90_000 });
    const result = await target.collectGroup(row, 'grp_kr');
    expect(result).toEqual({ ok: true, mode: 'preview' });
    expect(row.memberCount).toBe(94_074);
  });
});
