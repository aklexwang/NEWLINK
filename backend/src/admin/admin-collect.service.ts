import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { ChannelCollectorService } from '../stats/channel-collector.service';
import { CHANNEL_GAP_MS } from '../stats/collect-fetch';
import { StatsJobService } from '../stats/stats-job.service';
import { StatsRun } from '../stats/stats-run.entity';
import { ChannelsService } from '../channels/channels.service';
import { AutoExposeService } from '../stats/auto-expose.service';
import { ChannelLanguageService } from '../stats/channel-language.service';
import { ChannelMetricsService } from '../stats/channel-metrics.service';
import { PublicStatsService } from '../stats/public-stats.service';
import { ChannelStatus } from '../channels/channel.entity';
import {
  assertBulkCollectSize,
  canAdminCollectNow,
  remainingCollectCooldownSec,
  shouldBlockAdminCollect,
  STATS_JOB_BUSY_MESSAGE,
} from './admin-collect.logic';

@Injectable()
export class AdminCollectService {
  private readonly lastCollectAt = new Map<string, number>();

  constructor(
    private readonly collector: ChannelCollectorService,
    private readonly channelsService: ChannelsService,
    private readonly statsJob: StatsJobService,
    private readonly autoExpose: AutoExposeService,
    private readonly languages: ChannelLanguageService,
    private readonly metrics: ChannelMetricsService,
    private readonly publicStats: PublicStatsService,
    @InjectRepository(StatsRun)
    private readonly runRepository: Repository<StatsRun>,
  ) {}

  async collectOne(id: string) {
    await this.assertPipelineIdle();
    const channel = await this.channelsService.findById(id);
    this.assertCooldown(channel.id);
    let note: string | undefined;
    try {
      const result = await this.collector.collectPublicPageNow(channel);
      note = result.note;
      const collected = await this.channelsService.findById(channel.id);
      await this.languages.classifyOne(collected);
      await this.metrics.computeOne(collected.id);
      this.publicStats.clearPublicCaches();
      if (collected.status === ChannelStatus.PENDING) {
        await this.autoExpose.tryPromoteSubmission(collected);
      }
    } finally {
      this.lastCollectAt.set(channel.id, Date.now());
    }
    const fresh = await this.channelsService.findById(channel.id);
    // 어떤 방법으로 읽었는지 관리자에게 알려 준다(초대 링크 방 MTProto 확인용)
    return Object.assign(fresh, { collectNote: note ?? null });
  }

  async collectMany(ids: string[]) {
    await this.assertPipelineIdle();
    let unique: string[];
    try {
      unique = assertBulkCollectSize(ids);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : '수집할 수 없습니다.',
      );
    }
    const results: Array<{ id: string; ok: boolean; message?: string }> = [];
    for (let i = 0; i < unique.length; i += 1) {
      const id = unique[i];
      try {
        await this.collectOne(id);
        results.push({ id, ok: true });
      } catch (error) {
        if (error instanceof ConflictException) throw error;
        results.push({
          id,
          ok: false,
          message: error instanceof Error ? error.message : '수집 실패',
        });
      }
      if (i < unique.length - 1) {
        await sleep(CHANNEL_GAP_MS);
      }
    }
    return { results };
  }

  private async assertPipelineIdle() {
    const open = await this.runRepository.find({
      where: { finishedAt: IsNull() },
      select: ['id', 'startedAt', 'finishedAt'],
    });
    if (shouldBlockAdminCollect(this.statsJob.isRunning(), open)) {
      throw new ConflictException(STATS_JOB_BUSY_MESSAGE);
    }
  }

  private assertCooldown(id: string) {
    const now = Date.now();
    const last = this.lastCollectAt.get(id);
    if (!canAdminCollectNow(last, now)) {
      const sec = remainingCollectCooldownSec(last, now);
      throw new BadRequestException(`${sec}초 뒤에 다시 수집할 수 있습니다.`);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
