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
import { MtprotoCollectorService } from './mtproto-collector.service';
import { ChannelMetricsService } from './channel-metrics.service';
import { StatsRun } from './stats-run.entity';
import {
  interruptOpenStatsRuns,
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
  mtproto: {
    enabled: boolean;
    requestsToday: number;
    lastError: string | null;
  };
}

@Injectable()
export class StatsJobService implements OnModuleInit {
  private readonly logger = new Logger(StatsJobService.name);
  private currentRunId: string | null = null;
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
    private readonly mtproto: MtprotoCollectorService,
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
    const result = await this.startPipeline();
    if (!result.started) {
      this.logger.warn('통계 크론을 건너뜁니다. 이미 실행 중입니다.');
    }
  }

  /** 매주 월요일 KST 04:00. 카테고리 고정이 아닌 채널을 게시글 본문으로 다시 분류합니다. */
  @Cron('0 4 * * 1', { timeZone: 'Asia/Seoul' })
  async handleWeeklyCategoryCron() {
    if (envFalsy(this.configService.get<string>('STATS_CRON_ENABLED'))) {
      return;
    }
    try {
      await this.channelCategory.classifyUnlockedWeekly();
    } catch (error) {
      this.logger.warn(
        `주간 카테고리 재분류 실패: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  async startPipeline(): Promise<{ started: boolean; runId: string | null }> {
    if (this.status.running) {
      return { started: false, runId: this.currentRunId };
    }
    const run = await this.beginRun(0);
    void this.runPipeline().finally(() => {
      void this.finishRun('completed');
    });
    return { started: true, runId: run.id };
  }

  async startOne(
    channel: Channel,
  ): Promise<{ started: boolean; runId: string | null }> {
    if (this.status.running) {
      return { started: false, runId: this.currentRunId };
    }
    const run = await this.beginRun(1);
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
    try {
      await this.collector.collectAll((progress) =>
        this.noteProgress(progress),
      );
      await this.languages.classifyAll();
      await this.metrics.computeToday();
      const pruned = await this.collector.pruneOldPosts();
      if (pruned > 0) {
        this.logger.log(`90일 지난 게시글 ${pruned}건을 삭제했습니다.`);
      }
      await this.channelVerify.recheckVerifiedChannels();
      this.status.lastDiscovery = await this.discovery.discover();
      this.status.lastKeywordSearch = await this.keywordSearch.search();
      this.logger.log('통계 파이프라인이 끝났습니다.');
    } catch (error) {
      this.logger.error(
        `통계 파이프라인 실패: ${error instanceof Error ? error.message : error}`,
        error instanceof Error ? error.stack : undefined,
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

  private async beginRun(total: number): Promise<StatsRun> {
    const startedAt = new Date();
    const run = await this.runRepository.save(
      this.runRepository.create({
        startedAt,
        finishedAt: null,
        processed: 0,
        total,
        endedReason: null,
      }),
    );
    this.currentRunId = run.id;
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
    }
    await this.refreshLastRunView();
  }

  private async refreshLastRunView() {
    const latest = await this.runRepository.find({
      order: { startedAt: 'DESC' },
      take: 1,
    });
    this.lastRunPublic = latest[0] ? toPublicStatsRun(latest[0]) : null;
  }
}
