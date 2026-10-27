import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, MoreThanOrEqual, Repository } from 'typeorm';
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
import { asText } from '../common/as-text';
import { describeMemberPageVisibility } from '../stats/public-list-visibility.logic';

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
    const driver = String(
      this.channelRepository.manager.connection.options.type,
    );
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
      adminRecent,
    ] = await Promise.all([
      this.channelRepository
        .createQueryBuilder('channel')
        .select('channel.linkType', 'linkType')
        .addSelect('COUNT(*)', 'cnt')
        .groupBy('channel.linkType')
        .getRawMany<CountRow>(),
      // 회원 화면과 같은 판별 함수로 세기 위해 필요한 컬럼만 읽는다 (SQL 근사 아님)
      loadMemberPageRows(this.channelRepository, { onlyActive: false }),
      this.channelRepository.count({
        where: { status: ChannelStatus.PENDING },
      }),
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
      // 링크 등록(어드민)으로 최근 7일 넣은 방: 회원 노출 여부까지 센다
      this.channelRepository.find({
        select: [
          'id', 'createdAt', 'status', 'isVisible', 'firstObservedAt', 'collectStatus',
          'collectError', 'language', 'isPromoted', 'autoRegistered', 'submittedBy',
          'category', 'title', 'description', 'illegalCleared',
        ],
        where: {
          createdAt: MoreThanOrEqual(weekStart),
          autoRegistered: false,
          submittedBy: IsNull(),
        },
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
      collectStatus[asText(row.name ?? '(없음)')] = toCount(row);
    }

    const language = { ko: 0, foreign: 0, unknown: 0 };
    for (const row of languageRows) {
      const key = asText(row.name ?? 'unknown');
      const n = toCount(row);
      if (key === 'ko') language.ko += n;
      else if (key === 'foreign') language.foreign += n;
      else language.unknown += n;
    }

    const categories = categoryRows.map((row) => ({
      name: asText(row.name ?? '(없음)'),
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
      adminRegistered: {
        today: countAdminVisibility(adminRecent.filter((row) => row.createdAt >= todayStart)),
        last7d: countAdminVisibility(adminRecent),
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
            status: run.finishedAt
              ? (run.endedReason ?? 'completed')
              : 'running',
          }
        : null,
    };
  }
}

/** 링크 등록으로 들어온 방 중 회원 화면에 보이는 수 / 숨김 수 */
function countAdminVisibility(rows: Channel[]): { total: number; visible: number; hidden: number } {
  let visible = 0;
  for (const row of rows) {
    if (describeMemberPageVisibility(row).visible) visible += 1;
  }
  return { total: rows.length, visible, hidden: rows.length - visible };
}

function toCount(row: CountRow): number {
  return Number(row.cnt ?? 0) || 0;
}

function fillSourceCounts(rows: CountRow[]) {
  const out = emptySourceCounts();
  for (const row of rows) {
    const n = toCount(row);
    const source = asText(row.source ?? '');
    if (source === 'auto' || source === 'admin' || source === 'report') {
      out[source] += n;
    }
    out.total += n;
  }
  return out;
}
