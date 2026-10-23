import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
  mtproto: {
    enabled: boolean;
    requestsToday: number;
    lastError: string | null;
  };
}

@Injectable()
export class StatsJobService {
  private readonly logger = new Logger(StatsJobService.name);
  private status: Omit<StatsJobStatus, 'mtproto'> = {
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
  ) {}

  isRunning(): boolean {
    return this.status.running;
  }

  getStatus(): StatsJobStatus {
    return { ...this.status, mtproto: this.mtproto.getPublicStatus() };
  }

  /** 매일 KST 03:00. STATS_CRON_ENABLED=false 이면 건너뜁니다. */
  @Cron('0 3 * * *', { timeZone: 'Asia/Seoul' })
  async handleNightlyCron() {
    if (envFalsy(this.configService.get<string>('STATS_CRON_ENABLED'))) {
      return;
    }
    const result = this.startPipeline();
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

  startPipeline(): { started: boolean } {
    if (this.status.running) return { started: false };
    this.beginRun(0);
    void this.runPipeline().finally(() => {
      this.finishRun();
    });
    return { started: true };
  }

  startOne(channel: Channel): { started: boolean } {
    if (this.status.running) return { started: false };
    this.beginRun(1);
    void this.runOne(channel).finally(() => {
      this.finishRun();
    });
    return { started: true };
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

  private beginRun(total: number) {
    this.status = {
      running: true,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      processed: 0,
      total,
      failed: 0,
      lastDiscovery: this.status.lastDiscovery,
      lastKeywordSearch: this.status.lastKeywordSearch,
    };
  }

  private noteProgress(progress: {
    processed: number;
    total: number;
    failed: number;
  }) {
    this.status.processed = progress.processed;
    this.status.total = progress.total;
    this.status.failed = progress.failed;
  }

  private finishRun() {
    this.status.running = false;
    this.status.finishedAt = new Date().toISOString();
  }
}
