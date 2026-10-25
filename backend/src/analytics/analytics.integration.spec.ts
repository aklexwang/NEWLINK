import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import type { Request } from 'express';
import { DataSource, Repository } from 'typeorm';
import { Channel, ChannelStatus } from '../channels/channel.entity';
import {
  ANALYTICS_ENTITIES,
  ChannelOpenDaily,
  SearchDailyStat,
  SearchLog,
  SearchTerm,
  TelegramOpenRecent,
} from './analytics.entities';
import { AnalyticsRetentionService } from './analytics-retention.service';
import { OpenStatsService } from './open-stats.service';
import { RequestActorService } from './request-actor.service';
import { SearchInsightsService } from './search-insights.service';
import { SearchLogService } from './search-log.service';
import { SearchTermsService } from './search-terms.service';
import { TelegramOpenService } from './telegram-open.service';

// telegram-auth.service 가 ESM 패키지(jose)를 불러와 Jest 에서 읽히지 않으므로 자리만 대신 둔다.
jest.mock('../auth/telegram-auth.service', () => ({
  TelegramAuthService: class TelegramAuthService {},
}));

const SECRET = 'f'.repeat(64);
const HUMAN_UA =
  'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36';

interface FakeReq {
  ip: string;
  headers: Record<string, string>;
}

function fakeReq(partial: Partial<FakeReq> & { ip?: string } = {}): Request {
  return {
    ip: partial.ip ?? '203.0.113.7',
    headers: {
      'user-agent': HUMAN_UA,
      'accept-language': 'ko-KR',
      ...(partial.headers ?? {}),
    },
    socket: { remoteAddress: partial.ip ?? '203.0.113.7' },
  } as unknown as Request;
}

describe('analytics (SQLite 메모리 DB)', () => {
  let dataSource: DataSource;
  let terms: SearchTermsService;
  let logService: SearchLogService;
  let opens: TelegramOpenService;
  let openStats: OpenStatsService;
  let insights: SearchInsightsService;
  let retention: AnalyticsRetentionService;
  let channelRepo: Repository<Channel>;
  let termRepo: Repository<SearchTerm>;
  let logRepo: Repository<SearchLog>;
  let statRepo: Repository<SearchDailyStat>;
  let recentRepo: Repository<TelegramOpenRecent>;
  let dailyRepo: Repository<ChannelOpenDaily>;
  let adminToken = false;
  let channelId: string;

  const actors = {
    resolve(req: Request) {
      const headers = req.headers as Record<string, string>;
      const memberHeader = headers['x-test-member'];
      return {
        isAdmin: adminToken,
        memberId: memberHeader ? Number(memberHeader) : null,
        ip: req.ip ?? '',
        userAgent: headers['user-agent'] ?? '',
        acceptLanguage: headers['accept-language'] ?? '',
      };
    },
  } as unknown as RequestActorService;

  function build(configValues: Record<string, string>) {
    const config = new ConfigService(configValues);
    opens = new TelegramOpenService(
      config,
      actors,
      channelRepo,
      recentRepo,
      dailyRepo,
    );
    retention = new AnalyticsRetentionService(
      config,
      logRepo,
      statRepo,
      recentRepo,
      dailyRepo,
    );
  }

  beforeEach(async () => {
    dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [Channel, ...ANALYTICS_ENTITIES],
      synchronize: true,
    });
    await dataSource.initialize();
    channelRepo = dataSource.getRepository(Channel);
    termRepo = dataSource.getRepository(SearchTerm);
    logRepo = dataSource.getRepository(SearchLog);
    statRepo = dataSource.getRepository(SearchDailyStat);
    recentRepo = dataSource.getRepository(TelegramOpenRecent);
    dailyRepo = dataSource.getRepository(ChannelOpenDaily);

    terms = new SearchTermsService(termRepo);
    logService = new SearchLogService(logRepo, statRepo, actors);
    insights = new SearchInsightsService(statRepo, logRepo);
    openStats = new OpenStatsService(dailyRepo, channelRepo);
    build({ ANALYTICS_HASH_SECRET: SECRET });
    adminToken = false;

    const saved = await channelRepo.save(
      channelRepo.create({
        title: '테스트 채널',
        link: 'https://t.me/test_channel',
        category: '기타',
        description: '설명',
        status: ChannelStatus.ACTIVE,
      }),
    );
    channelId = saved.id;
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await dataSource.destroy();
  });

  describe('금지어 서비스', () => {
    it('금지어·예외어 등록 후 판정하고, 끄거나 지우면 즉시 반영된다', async () => {
      expect((await terms.check('마약')).blocked).toBe(false);

      const block = await terms.create('block', '마약');
      const allow = await terms.create('allow', '마약김밥');
      expect((await terms.check('마.약 판매')).blocked).toBe(true);
      expect((await terms.check('마약김밥 맛집')).blocked).toBe(false);
      expect((await terms.check('마약김밥 마약')).blocked).toBe(true);

      await terms.update(block.id, { enabled: false });
      expect((await terms.check('마약')).blocked).toBe(false);
      await terms.update(block.id, { enabled: true });
      expect((await terms.check('마_약')).blocked).toBe(true);

      await terms.remove(allow.id);
      expect((await terms.check('마약김밥 맛집')).blocked).toBe(true);
    });

    it('2자 미만·중복은 거절하고 예외어가 효과 없으면 경고한다', async () => {
      await expect(terms.create('block', '약')).rejects.toThrow('2자 이상');
      await expect(terms.create('block', '.-')).rejects.toThrow();
      await terms.create('block', '마약');
      await expect(terms.create('block', '마.약')).rejects.toThrow('이미');
      const allow = await terms.create('allow', '김밥집');
      expect(allow.warning).toContain('효과가 없습니다');
    });
  });

  describe('검색 기록', () => {
    it('원본과 일별 집계를 저장하고 회원 ID·IP 는 저장하지 않는다', async () => {
      await logService.recordFromRequest(fakeReq(), {
        query: '  코인 톡 ',
        resultCount: 3,
        blocked: false,
      });
      await logService.recordFromRequest(fakeReq(), {
        query: '코인-톡',
        resultCount: 0,
        blocked: false,
      });
      await logService.recordFromRequest(fakeReq(), {
        query: '코인톡',
        resultCount: 0,
        blocked: true,
      });

      const logs = await logRepo.find({ order: { createdAt: 'ASC' } });
      expect(logs).toHaveLength(3);
      expect(logs[0].queryRaw).toBe('코인 톡');
      expect(logs[0].queryNormalized).toBe('코인톡');
      expect(Object.keys(logs[0]).sort()).toEqual(
        [
          'blocked',
          'createdAt',
          'id',
          'queryNormalized',
          'queryRaw',
          'resultCount',
          'searchedOn',
        ].sort(),
      );
      const stats = await statRepo.find();
      expect(stats).toHaveLength(1);
      expect(stats[0]).toMatchObject({
        queryNormalized: '코인톡',
        searchCount: 3,
        zeroCount: 1,
        blockedCount: 1,
      });
    });

    it('관리자·봇·이메일·빈 검색어·요청 과다는 기록하지 않는다', async () => {
      adminToken = true;
      await logService.recordFromRequest(fakeReq(), {
        query: '관리자',
        resultCount: 1,
        blocked: false,
      });
      adminToken = false;
      await logService.recordFromRequest(
        fakeReq({ headers: { 'user-agent': 'Googlebot/2.1' } }),
        { query: '봇', resultCount: 1, blocked: false },
      );
      await logService.recordFromRequest(fakeReq(), {
        query: 'a@example.com',
        resultCount: 1,
        blocked: false,
      });
      await logService.recordFromRequest(fakeReq(), {
        query: '   ',
        resultCount: 1,
        blocked: false,
      });
      expect(await logRepo.count()).toBe(0);

      for (let i = 0; i < 70; i += 1) {
        await logService.recordFromRequest(fakeReq({ ip: '198.51.100.9' }), {
          query: `검색${i}`,
          resultCount: 1,
          blocked: false,
        });
      }
      expect(await logRepo.count()).toBe(60);
    });

    it('숫자 7자리 이상은 # 으로 가려 저장한다', async () => {
      await logService.recordFromRequest(fakeReq(), {
        query: '010 1234 5678 환전',
        resultCount: 0,
        blocked: false,
      });
      const log = await logRepo.findOneByOrFail({});
      expect(log.queryRaw).toBe('# 환전');
      expect(log.queryRaw).not.toMatch(/\d{4}/);
    });

    it('인사이트: 인기·0건·막힌 검색어와 합계를 돌려준다', async () => {
      const send = (query: string, resultCount: number, blocked = false) =>
        logService.recordFromRequest(fakeReq({ ip: `10.0.0.${Math.random()}` }), {
          query,
          resultCount,
          blocked,
        });
      await send('코인', 5);
      await send('코인', 5);
      await send('없는검색어', 0);
      await send('마약', 0, true);

      const result = await insights.getInsights('today');
      expect(result.totals).toEqual({
        searchCount: 4,
        zeroCount: 1,
        blockedCount: 1,
      });
      expect(result.popular[0]).toMatchObject({ query: '코인', searchCount: 2 });
      expect(result.popular.map((r) => r.query)).not.toContain('마약');
      expect(result.zero.map((r) => r.query)).toEqual(['없는검색어']);
      expect(result.blocked.map((r) => r.query)).toEqual(['마약']);
      expect(result.zero[0].sample).toBe('없는검색어');
    });
  });

  describe('텔레그램 이동 기록', () => {
    it('같은 사람이 1시간 안에 다시 누르면 세지 않고 다른 사람은 센다', async () => {
      const t0 = new Date('2026-10-25T03:00:00Z');
      const first = await opens.recordFromRequest(fakeReq(), channelId, t0);
      const again = await opens.recordFromRequest(
        fakeReq(),
        channelId,
        new Date(t0.getTime() + 30 * 60_000),
      );
      const other = await opens.recordFromRequest(
        fakeReq({ ip: '203.0.113.99' }),
        channelId,
        new Date(t0.getTime() + 31 * 60_000),
      );
      const later = await opens.recordFromRequest(
        fakeReq(),
        channelId,
        new Date(t0.getTime() + 61 * 60_000),
      );

      expect(first.counted).toBe(true);
      expect(again).toEqual({ counted: false, skipped: 'duplicate' });
      expect(other.counted).toBe(true);
      expect(later.counted).toBe(true);

      const daily = await dailyRepo.find();
      expect(daily).toHaveLength(1);
      expect(daily[0]).toMatchObject({
        channelId,
        openDate: '2026-10-25',
        openCount: 3,
      });
      const recent = await recentRepo.find();
      expect(recent).toHaveLength(2);
      for (const row of recent) {
        expect(row.visitorHash).toMatch(/^[0-9a-f]{32}$/);
        expect(row.visitorHash).not.toContain('203');
      }
    });

    it('로그인 회원은 IP 가 바뀌어도 같은 사람으로 본다', async () => {
      const t0 = new Date('2026-10-25T03:00:00Z');
      const headers = { 'x-test-member': '4242' };
      await opens.recordFromRequest(fakeReq({ headers }), channelId, t0);
      const again = await opens.recordFromRequest(
        fakeReq({ headers, ip: '192.0.2.55' }),
        channelId,
        new Date(t0.getTime() + 10 * 60_000),
      );
      expect(again.skipped).toBe('duplicate');
    });

    it('동시에 눌러도 한 번만 센다', async () => {
      const t0 = new Date('2026-10-25T03:00:00Z');
      const results = await Promise.all(
        Array.from({ length: 5 }, () =>
          opens.recordFromRequest(fakeReq(), channelId, t0),
        ),
      );
      expect(results.filter((r) => r.counted)).toHaveLength(1);
      expect((await dailyRepo.findOneByOrFail({ channelId })).openCount).toBe(1);
    });

    it('날짜가 바뀌면(KST) 새 날짜 행에 센다', async () => {
      await opens.recordFromRequest(
        fakeReq(),
        channelId,
        new Date('2026-10-25T14:30:00Z'), // KST 23:30
      );
      await opens.recordFromRequest(
        fakeReq({ ip: '203.0.113.50' }),
        channelId,
        new Date('2026-10-25T15:30:00Z'), // KST 다음날 00:30
      );
      const dates = (await dailyRepo.find({ order: { openDate: 'ASC' } })).map(
        (row) => row.openDate,
      );
      expect(dates).toEqual(['2026-10-25', '2026-10-26']);
    });

    it('봇·관리자·없는 채널·승인 안 된 채널·요청 과다는 세지 않는다', async () => {
      const bot = await opens.recordFromRequest(
        fakeReq({ headers: { 'user-agent': 'TelegramBot (like TwitterBot)' } }),
        channelId,
      );
      const empty = await opens.recordFromRequest(
        fakeReq({ headers: { 'user-agent': '' } }),
        channelId,
      );
      adminToken = true;
      const admin = await opens.recordFromRequest(fakeReq(), channelId);
      adminToken = false;
      const missing = await opens.recordFromRequest(
        fakeReq(),
        '00000000-0000-4000-8000-000000000000',
      );
      const pending = await channelRepo.save(
        channelRepo.create({
          title: '대기',
          link: 'https://t.me/pending_channel',
          category: '기타',
          description: '설명',
          status: ChannelStatus.PENDING,
        }),
      );
      const notActive = await opens.recordFromRequest(fakeReq(), pending.id);

      expect(bot.skipped).toBe('bot');
      expect(empty.skipped).toBe('bot');
      expect(admin.skipped).toBe('admin');
      expect(missing.skipped).toBe('invalid_channel');
      expect(notActive.skipped).toBe('invalid_channel');
      expect(await dailyRepo.count()).toBe(0);

      let limited = 0;
      for (let i = 0; i < 70; i += 1) {
        const result = await opens.recordFromRequest(
          fakeReq({ ip: '198.51.100.1' }),
          channelId,
        );
        if (result.skipped === 'rate_limited') limited += 1;
      }
      expect(limited).toBeGreaterThan(0);
    });

    it('ANALYTICS_HASH_SECRET 이 없으면 기록을 건너뛰고 경고는 한 번만 남긴다', async () => {
      build({});
      const warn = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);

      const first = await opens.recordFromRequest(fakeReq(), channelId);
      const second = await opens.recordFromRequest(fakeReq(), channelId);

      expect(first).toEqual({ counted: false, skipped: 'no_secret' });
      expect(second).toEqual({ counted: false, skipped: 'no_secret' });
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0][0])).toContain('ANALYTICS_HASH_SECRET');
      expect(await dailyRepo.count()).toBe(0);
      expect(await recentRepo.count()).toBe(0);
    });

    it('빈 문자열 키도 없는 것으로 본다', async () => {
      build({ ANALYTICS_HASH_SECRET: '   ' });
      jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const result = await opens.recordFromRequest(fakeReq(), channelId);
      expect(result.skipped).toBe('no_secret');
    });

    it('어드민 순위와 채널별 요약', async () => {
      const now = new Date();
      await opens.recordFromRequest(fakeReq({ ip: '1.1.1.1' }), channelId, now);
      await opens.recordFromRequest(fakeReq({ ip: '1.1.1.2' }), channelId, now);

      const ranking = await openStats.ranking('today', 10, now);
      expect(ranking.items).toHaveLength(1);
      expect(ranking.items[0]).toMatchObject({
        channelId,
        title: '테스트 채널',
        opens: 2,
      });

      const summary = await openStats.channelSummary(channelId, now);
      expect(summary).toMatchObject({ today: 2, last7d: 2, last30d: 2 });
      expect(summary.daily).toHaveLength(30);
      expect(summary.daily[29].count).toBe(2);
    });
  });

  describe('정리 크론', () => {
    const NOW = new Date('2026-10-25T05:20:00+09:00');
    const daysAgo = (days: number) =>
      new Date(NOW.getTime() - days * 86_400_000);

    async function seedLog(id: string, createdAt: Date) {
      await logRepo.insert({
        id,
        queryNormalized: 'x',
        queryRaw: 'x',
        resultCount: 1,
        blocked: false,
        searchedOn: '2026-01-01',
        createdAt,
      });
    }

    it('search_logs 는 기본 30일 지난 것만 지운다', async () => {
      await seedLog('old-1', daysAgo(31));
      await seedLog('old-2', daysAgo(45));
      await seedLog('new-1', daysAgo(29));
      await seedLog('new-2', daysAgo(1));

      const result = await retention.cleanup(NOW);
      expect(result.searchLogs).toBe(2);
      const ids = (await logRepo.find()).map((row) => row.id).sort();
      expect(ids).toEqual(['new-1', 'new-2']);
    });

    it('SEARCH_LOG_RETENTION_DAYS 로 보관 기간을 바꿀 수 있고 잘못된 값은 30일', async () => {
      build({ SEARCH_LOG_RETENTION_DAYS: '7' });
      await seedLog('a', daysAgo(8));
      await seedLog('b', daysAgo(6));
      expect((await retention.cleanup(NOW)).searchLogs).toBe(1);

      build({ SEARCH_LOG_RETENTION_DAYS: 'abc' });
      await seedLog('c', daysAgo(31));
      await seedLog('d', daysAgo(20));
      expect((await retention.cleanup(NOW)).searchLogs).toBe(1); // c(31일 전)만 삭제
    });

    it('배치로 나눠서 모두 지운다', async () => {
      for (let i = 0; i < 25; i += 1) await seedLog(`o${i}`, daysAgo(40));
      await seedLog('keep', daysAgo(1));
      const result = await retention.cleanup(NOW, 10);
      expect(result.searchLogs).toBe(25);
      expect(await logRepo.count()).toBe(1);
    });

    it('일별 집계는 90일 지난 1회·미차단 행만 지운다', async () => {
      const old = '2026-07-01'; // 116일 전
      const recentDay = '2026-09-20'; // 35일 전
      await statRepo.insert([
        { statDate: old, queryNormalized: 'once', searchCount: 1, zeroCount: 0, blockedCount: 0 },
        { statDate: old, queryNormalized: 'twice', searchCount: 2, zeroCount: 0, blockedCount: 0 },
        { statDate: old, queryNormalized: 'blocked-once', searchCount: 1, zeroCount: 0, blockedCount: 1 },
        { statDate: old, queryNormalized: 'zero-once', searchCount: 1, zeroCount: 1, blockedCount: 0 },
        { statDate: recentDay, queryNormalized: 'once', searchCount: 1, zeroCount: 0, blockedCount: 0 },
      ]);

      const result = await retention.cleanup(NOW);
      // 1회·미차단이면 0건 검색이어도 지운다(search_count=1 AND blocked_count=0 기준)
      expect(result.searchDailySingles).toBe(2);
      const left = (await statRepo.find())
        .map((row) => `${row.statDate}/${row.queryNormalized}`)
        .sort();
      expect(left).toEqual([
        '2026-07-01/blocked-once',
        '2026-07-01/twice',
        '2026-09-20/once',
      ]);
    });

    it('이동 임시 표는 48시간 뒤, 삭제된 채널의 일별 이동 수는 고아로 지운다', async () => {
      await recentRepo.insert([
        { channelId, visitorHash: 'old', lastCountedAt: new Date(NOW.getTime() - 49 * 3_600_000) },
        { channelId, visitorHash: 'fresh', lastCountedAt: new Date(NOW.getTime() - 47 * 3_600_000) },
      ]);
      await dailyRepo.insert([
        { channelId, openDate: '2026-10-24', openCount: 3 },
        { channelId: '00000000-0000-4000-8000-0000000000aa', openDate: '2026-10-24', openCount: 9 },
      ]);

      const result = await retention.cleanup(NOW);
      expect(result.openRecent).toBe(1);
      expect(result.openDailyOrphans).toBe(1);
      expect((await recentRepo.find()).map((row) => row.visitorHash)).toEqual(['fresh']);
      expect((await dailyRepo.find()).map((row) => row.channelId)).toEqual([channelId]);
    });

    it('runOnce 는 오류를 던지지 않고 동시 실행을 막는다', async () => {
      jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
      const [a, b] = await Promise.all([
        retention.runOnce(NOW),
        retention.runOnce(NOW),
      ]);
      expect([a, b].filter((r) => r === null)).toHaveLength(1);
    });
  });
});
