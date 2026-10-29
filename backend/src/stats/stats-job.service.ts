import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Channel } from '../channels/channel.entity';
import { ChannelVerifyService } from '../channels/channel-verify.service';
import { ChannelCollectorService } from './channel-collector.service';
import {
  ChannelDiscoveryService,
  type DiscoveryRunResult,
} from './channel-discovery.service';
import {
  KeywordSearchService,
  type KeywordSearchRunResult,
} from './keyword-search.service';
import { ChannelLanguageService } from './channel-language.service';
import { ChannelCategoryService } from './channel-category.service';
import { CategorySuggestionService } from './category-suggestion.service';
import {
  MtprotoCollectorService,
  type MtprotoPublicStatus,
} from './mtproto-collector.service';
import { ChannelMetricsService } from './channel-metrics.service';
import { PublicStatsService } from './public-stats.service';
import {
  collectBudgetMs,
  DISCOVERY_BUDGET_MIN_DEFAULT,
  phaseBudgetMs,
  VERIFY_RECHECK_BUDGET_MIN_DEFAULT,
} from './collect-budget.logic';
import {
  decideCollectOverlap,
  FULL_WAIT_FOR_LIGHT_MS,
  SERVER_LIGHT_CRON_KST,
  startedRecently,
  type StatsCollectMode,
} from './stats-collect.logic';
import { getTmeGate } from './tme-gate';
import { StatsRun } from './stats-run.entity';
import {
  interruptOpenStatsRuns,
  newStatsRunInsert,
  toPublicStatsRun,
  type StatsRunEndedReason,
  type StatsRunStatus,
} from './stats-run.logic';

function envFalsy(value: string | undefined): boolean {
  return ['0', 'false', 'no', 'off'].includes(
    (value ?? '').trim().toLowerCase(),
  );
}

export interface StatsJobStatus {
  running: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  processed: number;
  total: number;
  failed: number;
  lastDiscovery: DiscoveryRunResult | null;
  lastKeywordSearch: KeywordSearchRunResult | null;
  lastRun: {
    id: string;
    status: StatsRunStatus;
    processed: number;
    total: number;
  } | null;
  mtproto: MtprotoPublicStatus;
}

/** light 회차에서 새 그룹·초대방 첫 수집에 쓰는 최대 시간 */
const LIGHT_FIRST_COLLECT_BUDGET_MS = 5 * 60 * 1000;
/** light 회차마다 검사할 대기 초대 링크 수 (하루 8회 × 40 = 320) */
const LIGHT_INVITE_INSPECT_MAX_DEFAULT = 40;

@Injectable()
export class StatsJobService implements OnModuleInit {
  private readonly logger = new Logger(StatsJobService.name);
  private currentRunId: string | null = null;
  private currentRunMode: StatsCollectMode | null = null;
  /** 모드별 마지막 시작 시각(ms). 서버 일정과 GitHub 예비 실행이 겹치지 않게 쓴다 */
  private lastStartedAt: Record<StatsCollectMode, number | null> = {
    light: null,
    full: null,
  };
  private lastRunPublic: StatsJobStatus['lastRun'] = null;
  private status: Omit<StatsJobStatus, 'mtproto' | 'lastRun'> = {
    running: false,
    startedAt: null,
    finishedAt: null,
    processed: 0,
    total: 0,
    failed: 0,
    lastDiscovery: null,
    lastKeywordSearch: null,
  };

  constructor(
    private readonly configService: ConfigService,
    private readonly collector: ChannelCollectorService,
    private readonly metrics: ChannelMetricsService,
    private readonly languages: ChannelLanguageService,
    private readonly channelVerify: ChannelVerifyService,
    private readonly discovery: ChannelDiscoveryService,
    private readonly keywordSearch: KeywordSearchService,
    private readonly channelCategory: ChannelCategoryService,
    private readonly categorySuggestions: CategorySuggestionService,
    private readonly mtproto: MtprotoCollectorService,
    private readonly publicStats: PublicStatsService,
    @InjectRepository(Channel)
    private readonly channelRepository: Repository<Channel>,
    @InjectRepository(StatsRun)
    private readonly runRepository: Repository<StatsRun>,
  ) {}

  async onModuleInit() {
    try {
      const open = await this.runRepository.find({
        where: { finishedAt: IsNull() },
      });
      const now = new Date();
      const interrupted = interruptOpenStatsRuns(open, now);
      for (const run of interrupted) {
        await this.runRepository.update(run.id, {
          finishedAt: run.finishedAt,
          endedReason: run.endedReason,
        });
      }
      if (interrupted.length > 0) {
        this.logger.warn(
          `끝나지 않은 수집 ${interrupted.length}건을 interrupted 로 표시했습니다.`,
        );
      }
      await this.refreshLastRunView();
    } catch (error) {
      this.logger.warn(
        `수집 실행 상태 복구 실패: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  isRunning(): boolean {
    return this.status.running;
  }

  getStatus(): StatsJobStatus {
    return {
      ...this.status,
      lastRun: this.lastRunPublic,
      mtproto: this.mtproto.getPublicStatus(),
    };
  }

  /** 매일 KST 03:00. STATS_CRON_ENABLED=false 이면 건너뜁니다. */
  @Cron('0 3 * * *', { timeZone: 'Asia/Seoul' })
  async handleNightlyCron() {
    if (envFalsy(this.configService.get<string>('STATS_CRON_ENABLED'))) {
      return;
    }
    const result = await this.startPipeline('full', { skipIfRecent: true });
    if (!result.started) {
      this.logger.warn('통계 크론을 건너뜁니다. 이미 실행 중입니다.');
    }
  }

  /**
   * 매일 KST 05:20 (새벽 full 수집이 게시글을 모은 뒤). 분류대기 채널을 게시글 본문으로 다시 분류합니다.
   * 대상은 분류대기 방뿐이고 AI 하루 한도(AI_DAILY_LIMIT)를 넘지 않는다.
   * GitHub Actions 가 월요일에 POST /internal/stats/reclassify 로도 부른다(겹치면 한 번만 돈다).
   */
  @Cron('20 5 * * *', { timeZone: 'Asia/Seoul' })
  handleWeeklyCategoryCron() {
    if (envFalsy(this.configService.get<string>('STATS_CRON_ENABLED'))) {
      return;
    }
    this.startWeeklyCategory();
  }

  private weeklyCategory: {
    running: boolean;
    startedAt: string | null;
    finishedAt: string | null;
    updated: number | null;
    skipped: number | null;
    total: number | null;
    error: string | null;
  } = {
    running: false,
    startedAt: null,
    finishedAt: null,
    updated: null,
    skipped: null,
    total: null,
    error: null,
  };

  getWeeklyCategoryStatus() {
    return { ...this.weeklyCategory };
  }

  /** 분류대기 재분류를 백그라운드로 시작. 이미 도는 중이면 started=false */
  startWeeklyCategory(): { started: boolean; startedAt: string | null } {
    if (this.weeklyCategory.running) {
      return { started: false, startedAt: this.weeklyCategory.startedAt };
    }
    const startedAt = new Date().toISOString();
    this.weeklyCategory = {
      running: true,
      startedAt,
      finishedAt: null,
      updated: null,
      skipped: null,
      total: null,
      error: null,
    };
    void this.channelCategory
      .classifyUnlockedWeekly()
      .then((result) => {
        this.weeklyCategory = {
          ...this.weeklyCategory,
          running: false,
          finishedAt: new Date().toISOString(),
          updated: result.updated,
          skipped: result.skipped,
          total: result.total,
        };
        void this.categorySuggestions.checkAlerts();
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`주간 카테고리 재분류 실패: ${message}`);
        this.weeklyCategory = {
          ...this.weeklyCategory,
          running: false,
          finishedAt: new Date().toISOString(),
          error: message.slice(0, 200),
        };
      });
    return { started: true, startedAt };
  }

  /**
   * 3시간마다 light (KST 00·06·09·12·15·18·21시 5분). 서버가 잠들지 않으니 서버가 직접 시작하고,
   * GitHub Actions 일정은 예비로 남긴다(빠지거나 늦게 와도 수집이 돈다).
   */
  @Cron(SERVER_LIGHT_CRON_KST, { timeZone: 'Asia/Seoul' })
  async handleLightCron() {
    if (envFalsy(this.configService.get<string>('STATS_CRON_ENABLED'))) {
      return;
    }
    const result = await this.startPipeline('light', { skipIfRecent: true });
    if (!result.started) {
      this.logger.log(`서버 light 일정 건너뜀 (${result.reason ?? 'busy'})`);
    }
  }

  async startPipeline(
    mode: StatsCollectMode = 'full',
    options: { skipIfRecent?: boolean } = {},
  ): Promise<{
    started: boolean;
    skipped: boolean;
    runId: string | null;
    mode: StatsCollectMode;
    reason?: 'recent';
  }> {
    if (
      options.skipIfRecent &&
      !this.status.running &&
      startedRecently({
        mode,
        lastStartedAtMs: this.lastStartedAt[mode],
        nowMs: Date.now(),
      })
    ) {
      return {
        started: false,
        skipped: true,
        runId: this.currentRunId,
        mode,
        reason: 'recent',
      };
    }
    if (this.status.running) {
      const decision = decideCollectOverlap({
        requested: mode,
        running: this.currentRunMode,
      });
      if (decision.action === 'skip_conflict') {
        return {
          started: false,
          skipped: true,
          runId: this.currentRunId,
          mode,
        };
      }
      if (decision.action === 'wait_for_light') {
        const idle = await this.waitUntilIdle(FULL_WAIT_FOR_LIGHT_MS);
        if (!idle || this.status.running) {
          return {
            started: false,
            skipped: false,
            runId: this.currentRunId,
            mode,
          };
        }
      } else {
        return {
          started: false,
          skipped: false,
          runId: this.currentRunId,
          mode,
        };
      }
    }
    const run = await this.beginRun(0, mode);
    this.lastStartedAt[mode] = Date.now();
    const gate = getTmeGate();
    gate.beginRun(mode);
    const work =
      mode === 'light' ? this.runLightPipeline() : this.runPipeline();
    void work.finally(() => {
      gate.endRun();
      void this.finishRun('completed');
    });
    return { started: true, skipped: false, runId: run.id, mode };
  }

  async startOne(
    channel: Channel,
  ): Promise<{ started: boolean; runId: string | null }> {
    if (this.status.running) {
      return { started: false, runId: this.currentRunId };
    }
    const run = await this.beginRun(1, 'full');
    void this.runOne(channel).finally(() => {
      void this.finishRun('completed');
    });
    return { started: true, runId: run.id };
  }

  async findChannel(channelId: string): Promise<Channel | null> {
    return this.channelRepository.findOneBy({ id: channelId });
  }

  private async runPipeline() {
    this.logger.log(
      '통계 파이프라인 시작: 수집 → 언어 → 점수 → 정리 → 인증 재확인 → 눈덩이 발견 → 키워드 검색',
    );
    await this.mtproto.prepareForCollectRun();
    try {
      await this.collector.collectAll(
        (progress) => this.noteProgress(progress),
        { deadlineMs: this.collectDeadline('full') },
      );
      await this.languages.classifyAll();
      await this.metrics.computeToday();
      const pruned = await this.collector.pruneOldPosts();
      if (pruned > 0) {
        this.logger.log(`90일 지난 게시글 ${pruned}건을 삭제했습니다.`);
      }
      await this.channelVerify.recheckVerifiedChannels({
        deadlineMs: this.phaseDeadline(
          'VERIFY_RECHECK_BUDGET_MIN',
          VERIFY_RECHECK_BUDGET_MIN_DEFAULT,
        ),
      });
      this.status.lastDiscovery = await this.discovery.discover({
        deadlineMs: this.phaseDeadline(
          'DISCOVERY_BUDGET_MIN',
          DISCOVERY_BUDGET_MIN_DEFAULT,
        ),
      });
      this.status.lastKeywordSearch = await this.keywordSearch.search();
      this.logger.log('통계 파이프라인이 끝났습니다.');
    } catch (error) {
      this.logger.error(
        `통계 파이프라인 실패: ${error instanceof Error ? error.message : error}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private async runLightPipeline() {
    this.logger.log('light 수집 시작: t.me/s 미리보기 → 공개 캐시 비우기');
    try {
      // 새로 들어온 그룹·초대방은 light 미리보기로 못 읽어 새벽까지 회원 페이지에 안 보인다 → 먼저 첫 수집
      await this.inspectQueuedInvitesLight();
      await this.collectFirstSeenGroupsAndInvites();
      await this.collector.collectLightAll(
        (progress) => this.noteProgress(progress),
        { deadlineMs: this.collectDeadline('light') },
      );
      this.publicStats.clearPublicCaches();
      this.logger.log('light 수집이 끝났습니다.');
    } catch (error) {
      this.logger.error(
        `light 수집 실패: ${error instanceof Error ? error.message : error}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  /** light 맨 앞 최대 5분: 대기 중인 비공개 초대 링크 검사(공개 페이지만, 기본 40개) */
  private async inspectQueuedInvitesLight() {
    try {
      const raw = Number(
        this.configService.get<string>('LIGHT_INVITE_INSPECT_MAX'),
      );
      const limit =
        Number.isFinite(raw) && raw >= 0
          ? Math.floor(raw)
          : LIGHT_INVITE_INSPECT_MAX_DEFAULT;
      await this.discovery.inspectQueuedInvites({
        limit,
        deadlineMs: Date.now() + LIGHT_FIRST_COLLECT_BUDGET_MS,
      });
    } catch (error) {
      this.logger.warn(
        `초대 링크 낮 검사 실패: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  /** light 앞부분 최대 5분: 새 그룹·초대방 첫 수집 → 언어·점수 바로 계산(노출 판정용) */
  private async collectFirstSeenGroupsAndInvites() {
    try {
      const { ids } = await this.collector.collectFirstSeenNonLight({
        deadlineMs: Date.now() + LIGHT_FIRST_COLLECT_BUDGET_MS,
      });
      for (const id of ids) {
        const channel = await this.channelRepository.findOneBy({ id });
        if (!channel) continue;
        await this.languages.classifyOne(channel);
        await this.metrics.computeOne(id);
      }
    } catch (error) {
      this.logger.warn(
        `새 그룹·초대방 첫 수집 실패: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  private async runOne(channel: Channel) {
    this.logger.log(`단일 채널 수집 시작: ${channel.id}`);
    try {
      const result = await this.collector.collectOne(channel);
      this.noteProgress({ processed: 1, total: 1, failed: result.ok ? 0 : 1 });
      this.logger.log(`단일 채널 수집 끝: ${channel.id}`);
    } catch (error) {
      this.noteProgress({ processed: 1, total: 1, failed: 1 });
      this.logger.warn(
        `단일 채널 수집 실패(${channel.id}): ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  private async waitUntilIdle(maxMs: number): Promise<boolean> {
    const deadline = Date.now() + maxMs;
    while (this.status.running && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    return !this.status.running;
  }

  private async beginRun(
    total: number,
    mode: StatsCollectMode,
  ): Promise<StatsRun> {
    const startedAt = new Date();
    const run = await this.runRepository.save(
      this.runRepository.create(newStatsRunInsert({ total, startedAt, mode })),
    );
    this.currentRunId = run.id;
    this.currentRunMode = mode;
    this.status = {
      running: true,
      startedAt: startedAt.toISOString(),
      finishedAt: null,
      processed: 0,
      total,
      failed: 0,
      lastDiscovery: this.status.lastDiscovery,
      lastKeywordSearch: this.status.lastKeywordSearch,
    };
    this.lastRunPublic = toPublicStatsRun(run);
    return run;
  }

  private noteProgress(progress: {
    processed: number;
    total: number;
    failed: number;
  }) {
    this.status.processed = progress.processed;
    this.status.total = progress.total;
    this.status.failed = progress.failed;
    if (this.lastRunPublic) {
      this.lastRunPublic = {
        ...this.lastRunPublic,
        processed: progress.processed,
        total: progress.total,
      };
    }
    if (this.currentRunId) {
      void this.runRepository.update(this.currentRunId, {
        processed: progress.processed,
        total: progress.total,
      });
    }
  }

  private async finishRun(reason: StatsRunEndedReason) {
    const finishedAt = new Date();
    this.status.running = false;
    this.status.finishedAt = finishedAt.toISOString();
    if (this.currentRunId) {
      await this.runRepository.update(this.currentRunId, {
        finishedAt,
        endedReason: reason,
        processed: this.status.processed,
        total: this.status.total,
      });
      this.currentRunId = null;
      this.currentRunMode = null;
    }
    await this.refreshLastRunView();
    void this.categorySuggestions.checkAlerts();
  }

  private collectDeadline(mode: StatsCollectMode): number {
    return (
      Date.now() +
      collectBudgetMs(mode, {
        COLLECT_LIGHT_BUDGET_MIN: this.configService.get<string>(
          'COLLECT_LIGHT_BUDGET_MIN',
        ),
        COLLECT_FULL_BUDGET_MIN: this.configService.get<string>(
          'COLLECT_FULL_BUDGET_MIN',
        ),
      })
    );
  }

  private phaseDeadline(envKey: string, fallbackMin: number): number {
    return (
      Date.now() +
      phaseBudgetMs(this.configService.get<string>(envKey), fallbackMin)
    );
  }

  private async refreshLastRunView() {
    const latest = await this.runRepository.find({
      order: { startedAt: 'DESC' },
      take: 1,
    });
    this.lastRunPublic = latest[0] ? toPublicStatsRun(latest[0]) : null;
  }
}
