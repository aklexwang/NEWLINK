import {
  ConflictException,
  Injectable,
  Logger,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { CategoryAiService } from '../auto-manage/category-ai.service';
import { Channel, ChannelStatus } from '../channels/channel.entity';
import { DISCOVERY_MAX_PER_DAY } from '../stats/channel-discovery.logic';
import {
  COLLECT_FULL_BUDGET_MIN_DEFAULT,
  COLLECT_LIGHT_BUDGET_MIN_DEFAULT,
  collectBudgetMinutes,
  DISCOVERY_BUDGET_MIN_DEFAULT,
  phaseBudgetMinutes,
  VERIFY_RECHECK_BUDGET_MIN_DEFAULT,
} from '../stats/collect-budget.logic';
import { ChannelDiscoveryService } from '../stats/channel-discovery.service';
import { summarizeCollectQueue } from '../stats/collect-queue.logic';
import { KEYWORD_SEARCH_DEFAULT_DAILY_LIMIT } from '../stats/mtproto-budget.logic';
import { RESOLVE_DAILY_LIMIT_DEFAULT } from '../stats/mtproto-access.logic';
import { MtprotoState } from '../stats/mtproto-state.entity';
import { StatsJobService } from '../stats/stats-job.service';
import { getTmeGate } from '../stats/tme-gate';
import { StatsRun } from '../stats/stats-run.entity';
import {
  ADMIN_LIGHT_RUN_BUSY_MESSAGE,
  ADMIN_LIGHT_RUN_ONLY_MESSAGE,
  classifyAdminStatsRun,
  durationMs,
  floodWaitSeconds,
  formatDurationKo,
  remainingOf,
} from './admin-stats.logic';
import { shouldBlockAdminCollect } from './admin-collect.logic';
import { checkServerConfig } from './config-health.logic';
import {
  miniAppGateCounters,
  miniAppGateMode,
} from '../security/miniapp-gate.logic';
import { TelegramAdminNotifyService } from '../common/telegram-admin-notify.service';

@Injectable()
export class AdminStatsService implements OnModuleInit {
  private readonly logger = new Logger(AdminStatsService.name);

  constructor(
    private readonly statsJob: StatsJobService,
    private readonly discovery: ChannelDiscoveryService,
    private readonly categoryAi: CategoryAiService,
    private readonly configService: ConfigService,
    @InjectRepository(Channel)
    private readonly channelRepository: Repository<Channel>,
    @InjectRepository(StatsRun)
    private readonly runRepository: Repository<StatsRun>,
    @InjectRepository(MtprotoState)
    private readonly mtprotoStateRepository: Repository<MtprotoState>,
    @Optional() private readonly adminNotify?: TelegramAdminNotifyService,
  ) {}

  /** 서버 설정 점검: 코드가 기대하는 값과 다르면 화면에 보여 주고 시작할 때 텔레그램으로 알린다 */
  configWarnings() {
    const mtproto = this.statsJob.getStatus().mtproto;
    const keys = [
      'STATS_CRON_ENABLED',
      'MTPROTO_ENABLED',
      'AI_API_KEY',
      'OPENAI_API_KEY',
    ];
    const env: Record<string, string | undefined> = {};
    for (const key of keys) env[key] = this.configService.get<string>(key);
    return checkServerConfig({
      env,
      mtprotoDailyLimit: mtproto.dailyLimit,
      mtprotoReserve: mtproto.specialReserve,
    });
  }

  onModuleInit() {
    const warnings = this.configWarnings();
    if (warnings.length === 0) return;
    for (const w of warnings) this.logger.warn(`설정 점검: ${w.text}`);
    void this.adminNotify
      ?.notifyConfigWarnings(warnings.map((w) => w.text))
      .catch(() => undefined);
  }

  async listRuns(limit = 30) {
    const take = Math.min(Math.max(limit, 1), 30);
    const rows = await this.runRepository.find({
      order: { startedAt: 'DESC' },
      take,
    });
    const now = Date.now();
    return rows.map((run) => {
      const remaining = remainingOf(run.processed, run.total);
      const kind = classifyAdminStatsRun(run);
      return {
        id: run.id,
        mode: run.mode,
        kind,
        status: kind,
        processed: run.processed,
        total: run.total,
        remaining,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt,
        durationMs: durationMs(run.startedAt, run.finishedAt, now),
        durationLabel: formatDurationKo(
          durationMs(run.startedAt, run.finishedAt, now),
        ),
        endedReason: run.endedReason,
        budgetNote:
          kind === 'budget'
            ? `시간 예산 도달, 남은 ${remaining}개는 다음 회차`
            : null,
      };
    });
  }

  async getOps() {
    const status = this.statsJob.getStatus();
    const mtproto = status.mtproto;
    const flood = await this.mtprotoStateRepository.findOne({
      where: { id: 1 },
    });
    const discoveryToday = await this.discovery.countSnowballToday();
    const queue = await this.getQueueSummary();
    return {
      mtproto: {
        enabled: mtproto.enabled,
        requestsToday: mtproto.requestsToday,
        resolvesToday: mtproto.resolvesToday,
        resolveDailyLimit: this.envPositive(
          'RESOLVE_DAILY_LIMIT',
          RESOLVE_DAILY_LIMIT_DEFAULT,
        ),
        searchesToday: mtproto.searchesToday,
        searchDailyLimit: this.envPositive(
          'KEYWORD_SEARCH_DAILY_LIMIT',
          KEYWORD_SEARCH_DEFAULT_DAILY_LIMIT,
        ),
        invitesToday: mtproto.invitesToday,
        inviteDailyLimit: mtproto.inviteDailyLimit,
        joinsToday: mtproto.joinsToday,
        joinOutcomes: mtproto.joinOutcomes,
        dailyLimit: mtproto.dailyLimit,
        specialReserve: mtproto.specialReserve,
        joinDailyLimit: mtproto.joinDailyLimit,
        joinedTotal: mtproto.joinedTotal,
        joinTotalMax: mtproto.joinTotalMax,
        lastError: mtproto.lastError,
        countersFromMemory: true,
        floodWait: {
          startedAt: flood?.floodWaitStartedAt ?? null,
          until: flood?.floodWaitUntil ?? null,
          seconds: floodWaitSeconds(
            flood?.floodWaitStartedAt,
            flood?.floodWaitUntil,
          ),
        },
      },
      budgets: {
        lightMin: collectBudgetMinutes('light', {
          COLLECT_LIGHT_BUDGET_MIN: this.configService.get<string>(
            'COLLECT_LIGHT_BUDGET_MIN',
          ),
          COLLECT_FULL_BUDGET_MIN: this.configService.get<string>(
            'COLLECT_FULL_BUDGET_MIN',
          ),
        }),
        fullMin: collectBudgetMinutes('full', {
          COLLECT_LIGHT_BUDGET_MIN: this.configService.get<string>(
            'COLLECT_LIGHT_BUDGET_MIN',
          ),
          COLLECT_FULL_BUDGET_MIN: this.configService.get<string>(
            'COLLECT_FULL_BUDGET_MIN',
          ),
        }),
        discoveryMin: phaseBudgetMinutes(
          this.configService.get<string>('DISCOVERY_BUDGET_MIN'),
          DISCOVERY_BUDGET_MIN_DEFAULT,
        ),
        verifyRecheckMin: phaseBudgetMinutes(
          this.configService.get<string>('VERIFY_RECHECK_BUDGET_MIN'),
          VERIFY_RECHECK_BUDGET_MIN_DEFAULT,
        ),
        defaults: {
          lightMin: COLLECT_LIGHT_BUDGET_MIN_DEFAULT,
          fullMin: COLLECT_FULL_BUDGET_MIN_DEFAULT,
          discoveryMin: DISCOVERY_BUDGET_MIN_DEFAULT,
          verifyRecheckMin: VERIFY_RECHECK_BUDGET_MIN_DEFAULT,
        },
      },
      discovery: {
        today: discoveryToday,
        dailyMax: DISCOVERY_MAX_PER_DAY,
      },
      // AI 분류 호출 현황(서버가 켜진 뒤 센 값. 재시작하면 0 부터 다시 센다)
      categoryAi: this.categoryAi.status(),
      // 메모리 기준이라 서버가 다시 뜨면 0부터 센다
      collectGate: getTmeGate().snapshot(),
      queue,
      configWarnings: this.configWarnings(),
      miniAppGate: {
        mode: miniAppGateMode(this.configService.get<string>('MINIAPP_ONLY')),
        ...miniAppGateCounters,
      },
      failures: await this.getFailureSummary(),
      running: this.statsJob.isRunning(),
    };
  }

  /** 지금 수집 실패 상태인 방을 실패 이유별로 센다 (반복 실패 = 3회 이상) */
  private async getFailureSummary() {
    const rows = await this.channelRepository
      .createQueryBuilder('c')
      .select("COALESCE(c.collectError, '(없음)')", 'reason')
      .addSelect('COUNT(*)', 'count')
      .addSelect(
        'SUM(CASE WHEN c.collectFailCount >= 3 THEN 1 ELSE 0 END)',
        'repeated',
      )
      .where('c.status = :active', { active: ChannelStatus.ACTIVE })
      .andWhere("c.collectStatus = 'failed'")
      .groupBy("COALESCE(c.collectError, '(없음)')")
      .orderBy('COUNT(*)', 'DESC')
      .limit(12)
      .getRawMany<{ reason: string; count: string; repeated: string | null }>();
    const reasons = rows.map((row) => ({
      reason: row.reason,
      count: Number(row.count) || 0,
      repeated: Number(row.repeated) || 0,
    }));
    return {
      total: reasons.reduce((sum, r) => sum + r.count, 0),
      reasons,
    };
  }

  /** 수집 큐 현황: 구간별 채널 수 · 지금 밀린 수 · 다음 24시간 예상 수집 수 */
  private async getQueueSummary() {
    const rows = await this.channelRepository.find({
      where: { status: ChannelStatus.ACTIVE },
      select: [
        'id',
        'linkType',
        'memberCount',
        'posts7d',
        'createdAt',
        'nextCollectAt',
        'collectStatus',
        'collectFailCount',
        'lastCollectedAt',
      ],
    });
    return summarizeCollectQueue(rows);
  }

  async startLight() {
    const unfinished = await this.runRepository.find({
      where: { finishedAt: IsNull() },
      select: ['id', 'startedAt', 'finishedAt'],
    });
    if (shouldBlockAdminCollect(this.statsJob.isRunning(), unfinished)) {
      throw new ConflictException(ADMIN_LIGHT_RUN_BUSY_MESSAGE);
    }
    const result = await this.statsJob.startPipeline('light');
    if (!result.started) {
      throw new ConflictException(ADMIN_LIGHT_RUN_BUSY_MESSAGE);
    }
    return {
      started: true,
      runId: result.runId,
      mode: result.mode,
    };
  }

  lightRejectedMessage(): string {
    return ADMIN_LIGHT_RUN_ONLY_MESSAGE;
  }

  private envPositive(key: string, fallback: number): number {
    const n = Number(this.configService.get<string>(key));
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
  }
}
