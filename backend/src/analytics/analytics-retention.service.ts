import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { addKstDays, formatKstYmd } from '../stats/channel-metrics.math';
import {
  ChannelOpenDaily,
  SearchDailyStat,
  SearchLog,
  TelegramOpenRecent,
} from './analytics.entities';

/** search_logs 기본 보관 일수 */
export const SEARCH_LOG_RETENTION_DEFAULT_DAYS = 30;
/** 일별 집계 중 "딱 1번 검색 + 막히지 않음" 행을 지우는 기준 일수 */
export const SEARCH_DAILY_SINGLE_RETENTION_DAYS = 90;
/** telegram_open_recent 보관 시간(1시간 중복 판정에는 충분한 여유) */
export const OPEN_RECENT_RETENTION_HOURS = 48;
const DELETE_BATCH_SIZE = 5000;
const MAX_BATCHES = 200;

export function parseSearchLogRetentionDays(raw: string | undefined): number {
  const parsed = Number.parseInt((raw ?? '').trim(), 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return SEARCH_LOG_RETENTION_DEFAULT_DAYS;
  }
  return Math.min(parsed, 365);
}

export interface RetentionResult {
  searchLogs: number;
  searchDailySingles: number;
  openRecent: number;
  openDailyOrphans: number;
}

/**
 * 검색·이동 기록 정리.
 * - search_logs: SEARCH_LOG_RETENTION_DAYS(기본 30일) 지난 원본 삭제
 * - search_daily_stats: 90일 지난 날짜 중 search_count=1 이고 blocked_count=0 인 행 삭제
 * - telegram_open_recent: 48시간 지난 행 삭제
 * - channel_open_daily: 삭제된 채널의 행 삭제
 * 실행 시점은 AnalyticsRetentionScheduler 가 정한다. search_logs 삭제는 5000건씩 나눠서 한다.
 */
@Injectable()
export class AnalyticsRetentionService {
  private readonly logger = new Logger(AnalyticsRetentionService.name);
  private running = false;

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(SearchLog)
    private readonly logs: Repository<SearchLog>,
    @InjectRepository(SearchDailyStat)
    private readonly stats: Repository<SearchDailyStat>,
    @InjectRepository(TelegramOpenRecent)
    private readonly recent: Repository<TelegramOpenRecent>,
    @InjectRepository(ChannelOpenDaily)
    private readonly opens: Repository<ChannelOpenDaily>,
  ) {}

  /** 오류를 던지지 않는다. 이미 실행 중이면 건너뛴다. */
  async runOnce(now: Date = new Date()): Promise<RetentionResult | null> {
    if (this.running) return null;
    this.running = true;
    try {
      const result = await this.cleanup(now);
      this.logger.log(
        `검색·이동 기록 정리: 검색원본 ${result.searchLogs}, 일별(1회) ${result.searchDailySingles}, 이동임시 ${result.openRecent}, 이동고아 ${result.openDailyOrphans}`,
      );
      return result;
    } catch (error) {
      this.logger.warn(
        `검색·이동 기록 정리 실패: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    } finally {
      this.running = false;
    }
  }

  async cleanup(
    now: Date = new Date(),
    batchSize: number = DELETE_BATCH_SIZE,
  ): Promise<RetentionResult> {
    const retentionDays = parseSearchLogRetentionDays(
      this.config.get<string>('SEARCH_LOG_RETENTION_DAYS'),
    );
    const logCutoff = new Date(now.getTime() - retentionDays * 86_400_000);
    const recentCutoff = new Date(
      now.getTime() - OPEN_RECENT_RETENTION_HOURS * 3_600_000,
    );
    const singleCutoffDate = addKstDays(
      formatKstYmd(now),
      -SEARCH_DAILY_SINGLE_RETENTION_DAYS,
    );

    const searchLogs = await this.deleteInBatches(
      'created_at < :cutoff',
      { cutoff: logCutoff },
      batchSize,
    );

    const single = await this.stats
      .createQueryBuilder()
      .delete()
      .from(SearchDailyStat)
      .where(
        'stat_date < :cutoffDate AND search_count = 1 AND blocked_count = 0',
        { cutoffDate: singleCutoffDate },
      )
      .execute();

    // telegram_open_recent 는 하루치 행 수가 적어 한 번에 지운다.
    const recent = await this.recent
      .createQueryBuilder()
      .delete()
      .from(TelegramOpenRecent)
      .where('last_counted_at < :cutoff', { cutoff: recentCutoff })
      .execute();

    const orphans = await this.opens
      .createQueryBuilder()
      .delete()
      .from(ChannelOpenDaily)
      .where('channel_id NOT IN (SELECT id FROM channels)')
      .execute();

    return {
      searchLogs,
      searchDailySingles: single.affected ?? 0,
      openRecent: recent.affected ?? 0,
      openDailyOrphans: orphans.affected ?? 0,
    };
  }

  /**
   * 조건에 맞는 행을 batchSize 건씩 지운다. DB 종류와 무관하게
   * "id IN (id 만 골라낸 서브쿼리 LIMIT n)" 형태를 쓴다.
   */
  private async deleteInBatches(
    condition: string,
    params: Record<string, unknown>,
    batchSize: number,
  ): Promise<number> {
    let total = 0;
    for (let i = 0; i < MAX_BATCHES; i += 1) {
      const sub = this.logs
        .createQueryBuilder('t')
        .select('t.id')
        .where(condition, params)
        .limit(batchSize);
      const result = await this.logs
        .createQueryBuilder()
        .delete()
        .from(SearchLog)
        .where(`id IN (${sub.getQuery()})`)
        .setParameters(sub.getParameters())
        .execute();
      const affected = result.affected ?? 0;
      total += affected;
      if (affected < batchSize) break;
    }
    return total;
  }
}