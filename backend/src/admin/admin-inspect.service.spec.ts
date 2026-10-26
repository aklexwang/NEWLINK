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

const ENGLISH_CHANNEL_HTML = `<div class="tgme_page_title">English News</div>
<div class="tgme_page_extra">12 003 subscribers</div>
<div class="tgme_page_description">breaking news daily</div>`;

function feedHtml(texts: string[]): string {
  return texts
    .map(
      (text, index) =>
        `<div class="tgme_widget_message" data-post="news_en/${index + 1}"><div class="tgme_widget_message_text">${text}</div><time datetime="2026-10-20T0${index}:00:00+00:00"></time></div>`,
    )
    .join('\n');
}

function buildService(overrides?: {
  existing?: unknown;
  html?: string | null;
  status?: number;
  finalUrl?: string | null;
  existingKind?: 'active' | 'pending' | 'rejected';
  /** t.me/s 최근 글 페이지 HTML */
  feedHtml?: string | null;
  createByAdmin?: jest.Mock;
}) {
  const channelsService = {
    findDuplicate: jest.fn().mockResolvedValue(
      overrides?.existing
        ? {
            kind: overrides.existingKind ?? 'active',
            channel: overrides.existing,
          }
        : null,
    ),
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
    fetchHtml: jest.fn((url: string) =>
      Promise.resolve(
        url.includes('/s/')
          ? {
              html: overrides?.feedHtml ?? null,
              status: overrides?.feedHtml ? 200 : 404,
              finalUrl: null,
            }
          : {
              html: overrides?.html ?? null,
              status: overrides?.status ?? 404,
              finalUrl: overrides?.finalUrl ?? null,
            },
      ),
    ),
  };
  const fetchHtml = (
    service as unknown as { publicFetch: { fetchHtml: jest.Mock } }
  ).publicFetch.fetchHtml;
  return { service, channelsService, fetchHtml };
}

describe('AdminInspectService 부팅', () => {
  it('status=running 인 job 을 interrupted 로 바꾼다', async () => {
    const jobRepository = {
      find: jest
        .fn()
        .mockResolvedValue([
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
    const view = await service.inspectOne('https://t.me/+uI8tNLAF57MzMThk');
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

  it('단건 조회는 키워드 분류 추천 카테고리를 함께 준다', async () => {
    const view = await buildService({
      html: CHANNEL_HTML,
      status: 200,
      finalUrl: 'https://t.me/NewsKorea',
    }).service.inspectOne('@NewsKorea');
    expect(view.suggestedCategory).toBe('뉴스');

    const weak = await buildService({
      html: INVITE_HTML,
      status: 200,
      finalUrl: 'https://t.me/+uI8tNLAF57MzMThk',
    }).service.inspectOne('https://t.me/+uI8tNLAF57MzMThk');
    expect(typeof weak.suggestedCategory).toBe('string');
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

  it('공개 채널은 제목·소개로 못 가르면 최근 글(t.me/s)로 한국어를 판별한다', async () => {
    const { service, fetchHtml } = buildService({
      html: ENGLISH_CHANNEL_HTML,
      status: 200,
      feedHtml: feedHtml([
        '한국 경제 뉴스를 전합니다 오늘',
        '서울 날씨와 교통 소식입니다',
        '국회 본회의 결과를 전합니다',
        '증시 마감 상황을 공유합니다',
        '내일 일정 안내입니다 여러분',
      ]),
    });
    const view = await service.inspectOne('https://t.me/news_en');
    expect(view.result).toBe('ok');
    expect(view.language).toBe('ko');
    expect(fetchHtml).toHaveBeenCalledWith('https://t.me/s/news_en');
  });

  it('최근 글을 못 읽으면 언어 미확인으로 두고 등록은 막지 않는다', async () => {
    const createByAdmin = jest.fn().mockResolvedValue({ id: 'ch-2' });
    const { service } = buildService({
      html: ENGLISH_CHANNEL_HTML,
      status: 200,
      feedHtml: null,
      createByAdmin,
    });
    const view = await service.inspectOne('https://t.me/news_en');
    expect(view.result).toBe('language_unknown');
    expect(view.resultCaption).toBe('언어 미확인');

    await service.registerInspected({
      title: 'English News',
      link: 'https://t.me/news_en',
      category: '뉴스',
    });
    // 검사로 판별한 언어를 등록할 때 그대로 저장한다
    expect(createByAdmin).toHaveBeenCalledWith(
      expect.objectContaining({ language: 'unknown' }),
    );
  });

  it('최근 글까지 외국어면 한국어 아님(외국어)이다', async () => {
    const { service } = buildService({
      html: ENGLISH_CHANNEL_HTML,
      status: 200,
      feedHtml: feedHtml([
        'Breaking news from Washington today',
        'Market closed higher in New York',
        'Official statement released this morning',
        'Further details will follow later',
        'Subscribe for more English updates',
      ]),
    });
    const view = await service.inspectOne('https://t.me/news_en');
    expect(view.result).toBe('not_korean');
    expect(view.language).toBe('foreign');
  });

  it('거절된 행만 있으면 새로 만들지 않고 확인을 거쳐 그 행을 다시 활성화한다', async () => {
    const createByAdmin = jest.fn().mockResolvedValue({ id: 'ch-3' });
    const { service } = buildService({
      html: CHANNEL_HTML,
      status: 200,
      existing: {
        id: 'ch-old',
        title: '예전 제목',
        status: 'rejected',
        linkType: LinkType.CHANNEL,
      },
      existingKind: 'rejected',
      createByAdmin,
    });
    const data = {
      title: '한국뉴스속보채널',
      link: 'https://t.me/NewsKorea',
      category: '뉴스',
    };
    await service.registerInspected(data);
    expect(createByAdmin).toHaveBeenLastCalledWith(expect.anything(), {
      reactivateRejected: false,
    });
    await service.registerInspected({ ...data, reactivateRejected: true });
    expect(createByAdmin).toHaveBeenLastCalledWith(expect.anything(), {
      reactivateRejected: true,
    });
  });
});
