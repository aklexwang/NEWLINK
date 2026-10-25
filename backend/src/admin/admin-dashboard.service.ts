import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Channel, ChannelStatus } from '../channels/channel.entity';
import { StatsRun } from '../stats/stats-run.entity';
import {
  emptySourceCounts,
  kstDayStart,
  kstRollingStart,
  registerSourceSql,
  sqlBoolLiterals,
} from './admin-dashboard.logic';
import { summarizeMemberVisibility } from '../stats/member-page-count.logic';
import { loadMemberPageRows } from '../stats/member-page-rows';

type CountRow = Record<string, unknown>;

@Injectable()
export class AdminDashboardService {
  constructor(
    @InjectRepository(Channel)
    private readonly channelRepository: Repository<Channel>,
    @InjectRepository(StatsRun)
    private readonly runRepository: Repository<StatsRun>,
  ) {}

  async getDashboard() {
    const driver = String(this.channelRepository.manager.connection.options.type);
    const bool = sqlBoolLiterals(driver);
    const sourceExpr = registerSourceSql('channel', bool);
    const todayStart = kstDayStart();
    const weekStart = kstRollingStart(7);

    const [
      linkRows,
      memberRows,
      pendingCount,
      collectRows,
      languageRows,
      categoryRows,
      todayRows,
      weekRows,
      latest,
    ] = await Promise.all([
      this.channelRepository
        .createQueryBuilder('channel')
        .select('channel.linkType', 'linkType')
        .addSelect('COUNT(*)', 'cnt')
        .groupBy('channel.linkType')
        .getRawMany<CountRow>(),
      // 회원 화면과 같은 판별 함수로 세기 위해 필요한 컬럼만 읽는다 (SQL 근사 아님)
      loadMemberPageRows(this.channelRepository, { onlyActive: false }),
      this.channelRepository.count({ where: { status: ChannelStatus.PENDING } }),
      this.channelRepository
        .createQueryBuilder('channel')
        .select(`COALESCE(channel.collect_status, '(없음)')`, 'name')
        .addSelect('COUNT(*)', 'cnt')
        .groupBy(`COALESCE(channel.collect_status, '(없음)')`)
        .getRawMany<CountRow>(),
      this.channelRepository
        .createQueryBuilder('channel')
        .select(`COALESCE(channel.language, 'unknown')`, 'name')
        .addSelect('COUNT(*)', 'cnt')
        .groupBy(`COALESCE(channel.language, 'unknown')`)
        .getRawMany<CountRow>(),
      this.channelRepository
        .createQueryBuilder('channel')
        .select(
          `COALESCE(NULLIF(TRIM(channel.category), ''), '(없음)')`,
          'name',
        )
        .addSelect('COUNT(*)', 'cnt')
        .groupBy(`COALESCE(NULLIF(TRIM(channel.category), ''), '(없음)')`)
        .orderBy('cnt', 'DESC')
        .addOrderBy('name', 'ASC')
        .limit(10)
        .getRawMany<CountRow>(),
      this.channelRepository
        .createQueryBuilder('channel')
        .select(sourceExpr, 'source')
        .addSelect('COUNT(*)', 'cnt')
        .where('channel.createdAt >= :since', { since: todayStart })
        .groupBy(sourceExpr)
        .getRawMany<CountRow>(),
      this.channelRepository
        .createQueryBuilder('channel')
        .select(sourceExpr, 'source')
        .addSelect('COUNT(*)', 'cnt')
        .where('channel.createdAt >= :since', { since: weekStart })
        .groupBy(sourceExpr)
        .getRawMany<CountRow>(),
      this.runRepository.find({
        order: { startedAt: 'DESC' },
        take: 1,
      }),
    ]);

    let channelCount = 0;
    let groupCount = 0;
    for (const row of linkRows) {
      const n = toCount(row);
      if (String(row.linkType) === 'group') groupCount += n;
      else channelCount += n;
    }

    const member = summarizeMemberVisibility(memberRows);

    const collectStatus: Record<string, number> = {};
    for (const row of collectRows) {
      collectStatus[String(row.name ?? '(없음)')] = toCount(row);
    }

    const language = { ko: 0, foreign: 0, unknown: 0 };
    for (const row of languageRows) {
      const key = String(row.name ?? 'unknown');
      const n = toCount(row);
      if (key === 'ko') language.ko += n;
      else if (key === 'foreign') language.foreign += n;
      else language.unknown += n;
    }

    const categories = categoryRows.map((row) => ({
      name: String(row.name ?? '(없음)'),
      count: toCount(row),
    }));

    const run = latest[0] ?? null;
    return {
      channelCount,
      groupCount,
      memberVisible: member.visible,
      memberHidden: member.hidden,
      memberDuplicateExcess: member.duplicateExcess,
      memberListTotal: member.listTotal,
      hiddenReasons: member.hiddenReasons,
      registered: {
        today: fillSourceCounts(todayRows),
        last7d: fillSourceCounts(weekRows),
      },
      pendingCount,
      collectStatus,
      language,
      categories,
      lastCollectRun: run
        ? {
            mode: run.mode,
            startedAt: run.startedAt,
            finishedAt: run.finishedAt,
            processed: run.processed,
            total: run.total,
            remaining: Math.max(0, (run.total ?? 0) - (run.processed ?? 0)),
            status: run.finishedAt ? (run.endedReason ?? 'completed') : 'running',
          }
        : null,
    };
  }
}

function toCount(row: CountRow): number {
  return Number(row.cnt ?? 0) || 0;
}

function fillSourceCounts(rows: CountRow[]) {
  const out = emptySourceCounts();
  for (const row of rows) {
    const n = toCount(row);
    const source = String(row.source ?? '');
    if (source === 'auto' || source === 'admin' || source === 'report') {
      out[source] += n;
    }
    out.total += n;
  }
  return out;
}
