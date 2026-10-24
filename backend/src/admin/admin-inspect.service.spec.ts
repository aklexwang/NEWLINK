jest.mock('jose', () => ({
  createRemoteJWKSet: jest.fn(),
  jwtVerify: jest.fn(),
}));

jest.mock('@nestjs/schedule', () => ({
  ScheduleModule: {
    forRoot: () => ({
      module: class ScheduleRootMock {},
    }),
  },
  Cron: () => () => undefined,
}));

import { BadRequestException, ConflictException } from '@nestjs/common';
import { LinkType } from '../channels/channel.entity';
import { AdminInspectService } from './admin-inspect.service';

const INVITE_HTML = `<div class="tgme_page">
  <div class="tgme_page_photo"><img src="https://cdn4.telegram-cdn.org/file/abc.jpg"></div>
  <div class="tgme_page_title">테더천국 장외거래 소통방</div>
  <div class="tgme_page_extra">558 members</div>
  <div class="tgme_page_description">장외 소통</div>
</div>
<meta property="og:image" content="https://cdn4.telegram-cdn.org/file/abc.jpg">`;

const CHANNEL_HTML = `<div class="tgme_page_title">한국뉴스속보채널</div>
<div class="tgme_page_extra">1 200 subscribers</div>
<div class="tgme_page_description">국내 뉴스 속보를 모읍니다</div>`;

const GROUP_HTML = `<div class="tgme_page_title">한국뉴스속보그룹</div>
<div class="tgme_page_extra">1 200 members</div>
<div class="tgme_page_description">국내 뉴스 속보를 모읍니다</div>`;

function buildService(overrides?: {
  existing?: unknown;
  html?: string | null;
  status?: number;
  finalUrl?: string | null;
  createByAdmin?: jest.Mock;
}) {
  const channelsService = {
    findByLink: jest.fn().mockResolvedValue(overrides?.existing ?? null),
    createByAdmin: overrides?.createByAdmin ?? jest.fn(),
  };
  const channelRepository = {
    findOne: jest.fn().mockResolvedValue(null),
  };
  const service = new AdminInspectService(
    {} as never,
    channelsService as never,
    {} as never,
    {} as never,
    {} as never,
    channelRepository as never,
    {} as never,
  );
  (
    service as unknown as {
      publicFetch: {
        fetchHtml: (url: string) => Promise<{
          html: string | null;
          status: number;
          finalUrl: string | null;
        }>;
      };
    }
  ).publicFetch = {
    fetchHtml: jest.fn().mockResolvedValue({
      html: overrides?.html ?? null,
      status: overrides?.status ?? 404,
      finalUrl: overrides?.finalUrl ?? null,
    }),
  };
  return { service, channelsService };
}

describe('AdminInspectService 부팅', () => {
  it('status=running 인 job 을 interrupted 로 바꾼다', async () => {
    const jobRepository = {
      find: jest.fn().mockResolvedValue([
        { id: 'job-running', status: 'running', finishedAt: null },
      ]),
      update: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    const service = new AdminInspectService(
      {} as never,
      {} as never,
      {} as never,
      jobRepository as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await service.onModuleInit();

    expect(jobRepository.update).toHaveBeenCalledWith(
      'job-running',
      expect.objectContaining({
        status: 'interrupted',
        endedReason: 'interrupted',
      }),
    );
  });

  it('단건 초대 링크는 그룹·제목·인원·정상으로 본다', async () => {
    const { service } = buildService({
      html: INVITE_HTML,
      status: 200,
      finalUrl: 'https://t.me/+uI8tNLAF57MzMThk',
    });
    const view = await service.inspectOne(
      'https://t.me/+uI8tNLAF57MzMThk',
    );
    expect(view.result).toBe('ok');
    expect(view.resultCaption).toBe('정상');
    expect(view.linkType).toBe('group');
    expect(view.title).toBe('테더천국 장외거래 소통방');
    expect(view.memberCount).toBe(558);
    expect(view.description).toBe('장외 소통');
    expect(view.avatarUrl).toContain('telegram-cdn.org');
  });

  it('단건 공개 채널·그룹을 판별한다', async () => {
    const channel = await buildService({
      html: CHANNEL_HTML,
      status: 200,
      finalUrl: 'https://t.me/NewsKorea',
    }).service.inspectOne('@NewsKorea');
    expect(channel.result).toBe('ok');
    expect(channel.linkType).toBe('channel');
    expect(channel.title).toBe('한국뉴스속보채널');

    const group = await buildService({
      html: GROUP_HTML,
      status: 200,
      finalUrl: 'https://t.me/NewsKoreaGroup',
    }).service.inspectOne('https://t.me/NewsKoreaGroup');
    expect(group.result).toBe('ok');
    expect(group.linkType).toBe('group');
    expect(group.title).toBe('한국뉴스속보그룹');
  });

  it('없는 방은 not_found 이고 제목이 없다', async () => {
    const missing = await buildService({
      html: `This channel doesn't seem to exist`,
      status: 200,
    }).service.inspectOne('https://t.me/no_such_room_zzzz');
    expect(missing.result).toBe('not_found');
    expect(missing.title).toBe('');
    expect(missing.resultCaption).toBe('없는 채널');
  });

  it('단건 등록은 중복을 다시 보고 createByAdmin 을 부른다', async () => {
    const createByAdmin = jest.fn().mockResolvedValue({ id: 'ch-1' });
    const { service } = buildService({
      html: INVITE_HTML,
      status: 200,
      finalUrl: 'https://t.me/+uI8tNLAF57MzMThk',
      createByAdmin,
    });
    await service.registerInspected({
      title: '테더천국 장외거래 소통방',
      link: 'https://t.me/+uI8tNLAF57MzMThk',
      category: '금융',
    });
    expect(createByAdmin).toHaveBeenCalledWith(
      expect.objectContaining({
        link: 'https://t.me/+uI8tNLAF57MzMThk',
        linkType: LinkType.GROUP,
        category: '금융',
      }),
    );
  });

  it('없는 방·이미 등록된 방은 단건 등록을 막는다', async () => {
    await expect(
      buildService({ html: null, status: 404 }).service.registerInspected({
        title: '없음',
        link: 'https://t.me/no_such_room_zzzz',
        category: '뉴스',
        linkType: LinkType.CHANNEL,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      buildService({
        existing: { id: 'ch-9', title: '있음', linkType: LinkType.GROUP },
      }).service.registerInspected({
        title: '있음',
        link: 'https://t.me/+dup',
        category: '뉴스',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
