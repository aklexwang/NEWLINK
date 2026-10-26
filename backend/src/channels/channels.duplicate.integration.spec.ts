// 채널 서비스가 끌고 오는 ESM 패키지(jose, @nestjs/schedule)는 Jest 에서 읽히지 않아 자리만 대신 둔다.
jest.mock('jose', () => ({
  createRemoteJWKSet: jest.fn(),
  jwtVerify: jest.fn(),
}));
jest.mock('@nestjs/schedule', () => ({
  ScheduleModule: { forRoot: () => ({ module: class ScheduleRootMock {} }) },
  Cron: () => () => undefined,
}));

import { BadRequestException, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, Repository } from 'typeorm';
import { ChannelEvent } from '../stats/channel-event.entity';
import { Channel, ChannelStatus, LinkType } from './channel.entity';
import { ChannelsService } from './channels.service';
import { DUPLICATE_REJECTED_CODE } from './link-duplicate.logic';
import type { TelegramPreview } from './telegram-preview.logic';

const OBSERVED = new Date('2026-10-20T00:00:00+09:00');

describe('ChannelsService 중복 판단·제목 고정·회원 노출 (SQLite 메모리 DB)', () => {
  let dataSource: DataSource;
  let repo: Repository<Channel>;
  let service: ChannelsService;
  let rewardSettingsRows: Array<{ enabled: boolean }> = [];
  let preview: TelegramPreview;

  beforeEach(async () => {
    dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [Channel, ChannelEvent],
      synchronize: true,
    });
    await dataSource.initialize();
    repo = dataSource.getRepository(Channel);
    preview = {
      title: null,
      description: null,
      avatarUrl: null,
      memberCount: null,
      kind: 'channel',
    };
    rewardSettingsRows = [];
    service = new ChannelsService(
      repo,
      {} as never,
      {} as never,
      new ConfigService({}),
      { fetchPreview: jest.fn(async () => preview) } as never,
      { getReporterOrNull: jest.fn(async () => null) } as never,
      { notifyNewSubmission: jest.fn(async () => undefined) } as never,
      dataSource.getRepository(ChannelEvent),
      {
        get: () => {
          throw new Error('테스트에서는 쓰지 않는 서비스');
        },
      } as never,
      { find: jest.fn(async () => rewardSettingsRows) } as never,
    );
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  async function seed(overrides: Partial<Channel> = {}): Promise<Channel> {
    return repo.save(
      repo.create({
        title: '정상 채널',
        link: 'https://t.me/news_kr',
        username: 'news_kr',
        linkType: LinkType.CHANNEL,
        category: '뉴스',
        description: '소개글',
        status: ChannelStatus.ACTIVE,
        isVisible: true,
        firstObservedAt: OBSERVED,
        collectStatus: 'ok',
        language: 'ko',
        memberCount: 100,
        ...overrides,
      }),
    );
  }

  const submission = (link: string, linkType?: LinkType) => ({
    title: '제보 채널',
    link,
    linkType,
    category: '뉴스',
    description: '제보 소개',
  });

  describe('회원 제보 (5. 자동 판별·링크 정규화)', () => {
    it('서버가 판별한 종류를 쓰고 링크는 정규화해서 저장한다', async () => {
      preview.kind = 'group';
      const saved = await service.create(
        submission('t.me/Brand_New/', LinkType.CHANNEL),
        1001,
      );
      expect(saved.linkType).toBe(LinkType.GROUP);
      expect(saved.link).toBe('https://t.me/Brand_New');
      expect(saved.username).toBe('brand_new');
      expect(saved.status).toBe(ChannelStatus.PENDING);
    });

    it('보상이 켜진 때 제보는 지급 대기, 꺼진 때 제보는 대상 아님', async () => {
      preview.kind = 'channel';
      rewardSettingsRows = [{ enabled: true }];
      const on = await service.create(
        submission('https://t.me/reward_on'),
        1001,
      );
      expect(on.payoutStatus).toBe('pending');
      rewardSettingsRows = [{ enabled: false }];
      const off = await service.create(
        submission('https://t.me/reward_off'),
        1001,
      );
      expect(off.payoutStatus).toBe('not_eligible');
      expect(off.payoutSkipReason).toBe('보상 꺼진 기간 제보');
    });

    it('종류 선택 없이도 접수된다', async () => {
      preview.kind = 'channel';
      const saved = await service.create(
        submission('https://t.me/only_link'),
        1001,
      );
      expect(saved.linkType).toBe(LinkType.CHANNEL);
    });

    it('판별에 실패하고 선택도 없으면 선택을 요청한다', async () => {
      preview.kind = null;
      await expect(
        service.create(submission('https://t.me/unknown_kind'), 1001),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'LINK_TYPE_REQUIRED' }),
      });
      await expect(
        service.create(submission('https://t.me/unknown_kind'), 1001),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(await repo.count()).toBe(0);
    });

    it('판별에 실패해도 회원이 고른 값이 있으면 그 값을 쓴다', async () => {
      preview.kind = null;
      const saved = await service.create(
        submission('https://t.me/unknown_kind', LinkType.GROUP),
        1001,
      );
      expect(saved.linkType).toBe(LinkType.GROUP);
    });
  });

  describe('2. 중복 판단 통일', () => {
    it('ACTIVE·PENDING 이 있으면 회원에게 같은 안내를 준다', async () => {
      await seed({ link: 'https://t.me/Dup_One', username: 'dup_one' });
      await seed({
        link: 'https://t.me/pend_one',
        username: 'pend_one',
        status: ChannelStatus.PENDING,
      });
      await expect(
        service.create(submission('https://t.me/DUP_ONE'), 1),
      ).rejects.toThrow('이미 등록되었거나 심사 중인 채널입니다');
      await expect(service.create(submission('@pend_one'), 1)).rejects.toThrow(
        '이미 등록되었거나 심사 중인 채널입니다',
      );
    });

    it('REJECTED 만 있으면 회원 제보를 막는다', async () => {
      await seed({
        link: 'https://t.me/rej_one',
        username: 'rej_one',
        status: ChannelStatus.REJECTED,
      });
      await expect(
        service.create(submission('https://t.me/Rej_One'), 1),
      ).rejects.toThrow('이미 검토된 링크입니다');
    });

    it('초대 링크는 해시 대소문자가 같을 때만 중복이다', async () => {
      await seed({
        link: 'https://t.me/+AbCdEfGh',
        username: null,
        collectStatus: 'invite_only',
        firstObservedAt: null,
      });
      await expect(
        service.create(submission('https://t.me/+AbCdEfGh'), 1),
      ).rejects.toBeInstanceOf(ConflictException);
      const other = await service.create(
        submission('https://t.me/+abcdefgh', LinkType.GROUP),
        1,
      );
      expect(other.id).toBeDefined();
    });

    it('합쳐진(merged) 행은 비교 대상이 아니고 여러 행이면 ACTIVE 가 먼저다', async () => {
      await seed({ collectStatus: 'merged', title: '합쳐진 행' });
      expect(await service.findDuplicate('https://t.me/news_kr')).toBeNull();

      await seed({
        status: ChannelStatus.REJECTED,
        title: '거절 행',
        link: 'https://t.me/News_KR/',
      });
      await seed({ title: '승인 행' });
      const match = await service.findDuplicate('https://t.me/NEWS_KR');
      expect(match?.kind).toBe('active');
      expect(match?.channel.title).toBe('승인 행');
    });

    it('approve 는 같은 링크의 다른 ACTIVE 행이 있으면 409 이다', async () => {
      await seed({ title: '이미 승인된 행' });
      const pending = await seed({
        title: '대기 행',
        link: 'https://t.me/News_KR',
        status: ChannelStatus.PENDING,
      });
      await expect(service.approve(pending.id)).rejects.toBeInstanceOf(
        ConflictException,
      );
      const fresh = await repo.findOneByOrFail({ id: pending.id });
      expect(fresh.status).toBe(ChannelStatus.PENDING);
    });

    it('approve 는 중복이 없으면 승인한다', async () => {
      const pending = await seed({
        link: 'https://t.me/solo_one',
        username: 'solo_one',
        status: ChannelStatus.PENDING,
      });
      const saved = await service.approve(pending.id);
      expect(saved.status).toBe(ChannelStatus.ACTIVE);
    });

    it('어드민 등록: ACTIVE·PENDING 이 있으면 409', async () => {
      await seed({ link: 'https://t.me/adm_one', username: 'adm_one' });
      await expect(
        service.createByAdmin({
          title: '새로',
          link: 'https://t.me/ADM_ONE',
          linkType: LinkType.CHANNEL,
          category: '뉴스',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(await repo.count()).toBe(1);
    });

    it('어드민 등록: REJECTED 만 있으면 새로 만들지 않고 확인을 요청한 뒤 그 행을 다시 활성화한다', async () => {
      const rejected = await seed({
        link: 'https://t.me/rej_two',
        username: 'rej_two',
        status: ChannelStatus.REJECTED,
        title: '예전 제목',
      });
      const data = {
        title: '새 제목',
        link: 'https://t.me/Rej_Two',
        linkType: LinkType.GROUP,
        category: '게임',
        language: 'ko' as const,
      };

      await expect(service.createByAdmin(data)).rejects.toMatchObject({
        response: expect.objectContaining({
          code: DUPLICATE_REJECTED_CODE,
          existingChannelId: rejected.id,
        }),
      });
      expect(await repo.count()).toBe(1);

      const saved = await service.createByAdmin(data, {
        reactivateRejected: true,
        skipPublicCollect: true,
      });
      expect(saved.id).toBe(rejected.id);
      expect(saved.status).toBe(ChannelStatus.ACTIVE);
      expect(saved.title).toBe('새 제목');
      expect(saved.linkType).toBe(LinkType.GROUP);
      expect(await repo.count()).toBe(1);
    });

    it('어드민 등록: 검사로 판별한 언어를 저장한다', async () => {
      const saved = await service.createByAdmin(
        {
          title: '언어 확인',
          link: 'https://t.me/lang_one',
          linkType: LinkType.CHANNEL,
          category: '뉴스',
          language: 'unknown',
        },
        { skipPublicCollect: true },
      );
      expect(saved.language).toBe('unknown');
      const korean = await service.createByAdmin(
        {
          title: '한국어 채널',
          link: 'https://t.me/lang_two',
          linkType: LinkType.CHANNEL,
          category: '뉴스',
          language: 'ko',
        },
        { skipPublicCollect: true },
      );
      expect(korean.language).toBe('ko');
    });

    it('updateAdmin 링크 변경도 같은 판단을 쓴다(자기 자신은 제외)', async () => {
      await seed({ link: 'https://t.me/taken_one', username: 'taken_one' });
      const mine = await seed({
        link: 'https://t.me/mine_one',
        username: 'mine_one',
      });
      await expect(
        service.updateAdmin(mine.id, { link: 'https://t.me/TAKEN_ONE' }),
      ).rejects.toBeInstanceOf(ConflictException);
      const same = await service.updateAdmin(mine.id, {
        link: 'https://t.me/Mine_One',
      });
      expect(same.link).toBe('https://t.me/Mine_One');
    });

    it('lookup 은 같은 판단으로 기존 행 상태를 알려 준다', async () => {
      await seed({
        link: 'https://t.me/look_one',
        username: 'look_one',
        status: ChannelStatus.REJECTED,
      });
      const result = await service.lookupTelegramLink('@Look_One');
      expect(result.alreadyRegistered).toBe(true);
      expect(result.existingStatus).toBe(ChannelStatus.REJECTED);
    });
  });

  describe('1. 제목 고정', () => {
    it('어드민이 제목을 바꾸면 자동으로 고정된다', async () => {
      const channel = await seed({ titleLocked: false });
      const saved = await service.updateAdmin(channel.id, {
        title: '어드민 제목',
      });
      expect(saved.title).toBe('어드민 제목');
      expect(saved.titleLocked).toBe(true);
    });

    it('제목을 그대로 두고 다른 값만 바꾸면 고정되지 않는다', async () => {
      const channel = await seed({ titleLocked: false });
      const saved = await service.updateAdmin(channel.id, {
        title: channel.title,
        category: '게임',
      });
      expect(saved.titleLocked).toBe(false);
    });

    it('고정을 풀면 다시 수집이 제목을 바꿀 수 있는 상태가 된다', async () => {
      const channel = await seed({ titleLocked: true });
      const saved = await service.updateAdmin(channel.id, {
        titleLocked: false,
      });
      expect(saved.titleLocked).toBe(false);
    });

    it('명시한 고정 값이 자동 고정보다 우선한다', async () => {
      const channel = await seed({ titleLocked: true });
      const saved = await service.updateAdmin(channel.id, {
        title: '새 제목',
        titleLocked: false,
      });
      expect(saved.title).toBe('새 제목');
      expect(saved.titleLocked).toBe(false);
    });

    it('미리보기 갱신도 고정된 제목을 덮어쓰지 않는다', async () => {
      preview = {
        title: '텔레그램 제목',
        description: '텔레그램 소개',
        avatarUrl: null,
        memberCount: 10,
        kind: 'channel',
      };
      const locked = await seed({
        status: ChannelStatus.PENDING,
        titleLocked: true,
        title: '고정 제목',
        link: 'https://t.me/lock_one',
        username: 'lock_one',
      });
      const refreshedLocked = await service.refreshPreview(locked.id);
      expect(refreshedLocked.title).toBe('고정 제목');
      expect(refreshedLocked.description).toBe('텔레그램 소개');

      const free = await seed({
        status: ChannelStatus.PENDING,
        titleLocked: false,
        title: '풀린 제목',
        link: 'https://t.me/lock_two',
        username: 'lock_two',
      });
      const refreshedFree = await service.refreshPreview(free.id);
      expect(refreshedFree.title).toBe('텔레그램 제목');
    });
  });

  describe('3. 회원 검색 노출 규칙', () => {
    it('외국어·불법 의심·사라짐·합쳐짐은 검색에서 빠지고 정상 채널만 나온다', async () => {
      await seed({
        title: '정상 뉴스',
        link: 'https://t.me/ok_one',
        username: 'ok_one',
      });
      await seed({
        title: '외국어',
        link: 'https://t.me/fo_one',
        username: 'fo_one',
        language: 'foreign',
      });
      await seed({
        title: '마약 정보방',
        link: 'https://t.me/il_one',
        username: 'il_one',
      });
      await seed({
        title: '사라짐',
        link: 'https://t.me/go_one',
        username: 'go_one',
        collectStatus: 'gone',
      });
      await seed({
        title: '합쳐짐',
        link: 'https://t.me/me_one',
        username: 'me_one',
        collectStatus: 'merged',
      });
      const result = await service.search({ page: 1, limit: 20 });
      expect(result.items.map((item) => item.title)).toEqual(['정상 뉴스']);
      expect(result.total).toBe(1);
    });

    it('같은 링크 행이 둘이면 노출 가능한 행 하나만 나온다', async () => {
      await seed({
        title: '숨김 행(추천 많음)',
        link: 'https://t.me/Same_One',
        username: 'same_one',
        language: 'foreign',
        recommendCount: 99,
      });
      await seed({
        title: '노출 행',
        link: 'https://t.me/same_one/',
        username: 'same_one',
      });
      const result = await service.search({ page: 1, limit: 20 });
      expect(result.items.map((item) => item.title)).toEqual(['노출 행']);
    });
  });
});
