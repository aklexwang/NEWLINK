import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Channel, ChannelStatus, LinkType } from '../channels/channel.entity';
import { isScoreCollectable } from './collect-visibility';
import { isMemberSurgeSuspected } from './channel-badges';
import { ChannelEvent } from './channel-event.entity';
import { ChannelPost } from './channel-post.entity';
import { ChannelScore } from './channel-score.entity';
import { ChannelSnapshot } from './channel-snapshot.entity';
import {
  addKstDays,
  clampScore,
  countObservedDays,
  DATA_SHORT_DAYS,
  formatKstYmd,
  GRADE_A_MIN,
  GRADE_B_MIN,
  GRADE_C_MIN,
  GRADE_S_MIN,
  gradeFromTotal,
  growthFromSnapshots,
  memberDeltaFromSnapshots,
  isManipulationSuspected,
  MANIPULATION_SCORE_MULTIPLIER,
  SURGE_SCORE_MULTIPLIER,
  MEMBER_SPIKE_RATIO,
  median,
  MIN_POSTS_FOR_CV,
  percentile,
  RANK_UP_STEPS,
  VIEW_CV_SUSPECT,
  VIEW_RATE_SUSPECT,
  WEIGHT_CHANNEL_ACTIVITY,
  WEIGHT_CHANNEL_GROWTH,
  WEIGHT_CHANNEL_SCALE,
  WEIGHT_CHANNEL_VIEW_RATE,
  WEIGHT_GROUP_ACTIVITY,
  WEIGHT_GROUP_GROWTH,
  WEIGHT_GROUP_SCALE,
} from './channel-metrics.math';

/** 점수 가중치 · 조작 의심 · 등급 임계값 */
const SCORE_WEIGHTS = {
  channel: {
    scale: WEIGHT_CHANNEL_SCALE,
    viewRate: WEIGHT_CHANNEL_VIEW_RATE,
    activity: WEIGHT_CHANNEL_ACTIVITY,
    growth: WEIGHT_CHANNEL_GROWTH,
  },
  group: {
    scale: WEIGHT_GROUP_SCALE,
    activity: WEIGHT_GROUP_ACTIVITY,
    growth: WEIGHT_GROUP_GROWTH,
  },
} as const;

const THRESHOLDS = {
  viewRateSuspect: VIEW_RATE_SUSPECT,
  memberSpikeRatio: MEMBER_SPIKE_RATIO,
  viewCvSuspect: VIEW_CV_SUSPECT,
  minPostsForCv: MIN_POSTS_FOR_CV,
  manipulationScoreMultiplier: MANIPULATION_SCORE_MULTIPLIER,
  rankUpSteps: RANK_UP_STEPS,
  dataShortDays: DATA_SHORT_DAYS,
  gradeS: GRADE_S_MIN,
  gradeA: GRADE_A_MIN,
  gradeB: GRADE_B_MIN,
  gradeC: GRADE_C_MIN,
} as const;

const POST_LOOKBACK_MS = 90 * 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const TWENTY_FOUR_H_MS = 24 * 60 * 60 * 1000;

/** 점수 계산에 쓰는 게시글 칸만 */
interface PostPoint {
  channelId: string;
  postedAt: Date;
  views: number | null;
  forwardedFrom: boolean;
}

type SnapshotPick = Pick<
  ChannelSnapshot,
  | 'channelId'
  | 'capturedOn'
  | 'memberCount'
  | 'medianViews7d'
  | 'activity24h'
  | 'activity7d'
>;

interface ChannelMetricsRow {
  channel: Channel;
  medianViews7d: number | null;
  posts7d: number;
  forwardedRatio: number;
  viewRate: number | null;
  growth24h: number | null;
  growth7d: number | null;
  memberDelta24h: number | null;
  memberDelta7d: number | null;
  memberDelta30d: number | null;
  growth30d: number | null;
  observedDays: number;
  memberCount: number;
  isGroup: boolean;
  activity24h: number;
  activity7d: number;
  manipulationSuspected: boolean;
}

interface ScoredRow extends ChannelMetricsRow {
  scaleScore: number;
  viewRateScore: number;
  activityScore: number;
  growthScore: number;
  total: number;
  grade: ReturnType<typeof gradeFromTotal>;
  overallRank: number;
  categoryRank: number;
}

@Injectable()
export class ChannelMetricsService {
  private readonly logger = new Logger(ChannelMetricsService.name);

  constructor(
    @InjectRepository(Channel)
    private readonly channelRepository: Repository<Channel>,
    @InjectRepository(ChannelPost)
    private readonly postRepository: Repository<ChannelPost>,
    @InjectRepository(ChannelSnapshot)
    private readonly snapshotRepository: Repository<ChannelSnapshot>,
    @InjectRepository(ChannelScore)
    private readonly scoreRepository: Repository<ChannelScore>,
    @InjectRepository(ChannelEvent)
    private readonly eventRepository: Repository<ChannelEvent>,
  ) {}

  async computeToday(now: Date = new Date()): Promise<void> {
    const built = await this.buildScored(now);
    if (!built) return;
    await this.persistSnapshots(built.rows, built.today);
    await this.persistScores(built.scored, built.today);
    this.logger.log(
      `오늘(${built.today}) 스냅샷·점수 ${built.scored.length}건을 저장했습니다. (관측 ${THRESHOLDS.dataShortDays}일 미만은 데이터 부족)`,
    );
  }

  /** 한 채널의 score/grade 만 저장. 카테고리 순위는 새벽 전체 계산에서 맞춘다 */
  async computeOne(channelId: string, now: Date = new Date()): Promise<void> {
    await this.computeMany([channelId], now);
  }

  /** 여러 채널을 한 번의 계산으로 (채널마다 전체 계산을 되풀이하지 않게) */
  async computeMany(
    channelIds: string[],
    now: Date = new Date(),
  ): Promise<void> {
    if (channelIds.length === 0) return;
    const built = await this.buildScored(now);
    if (!built) return;
    const want = new Set(channelIds);
    const rows = built.rows.filter((item) => want.has(item.channel.id));
    const scored = built.scored.filter((item) => want.has(item.channel.id));
    if (rows.length === 0 || scored.length === 0) return;
    await this.persistSnapshots(rows, built.today);
    await this.persistScores(scored, built.today);
  }

  private async buildScored(now: Date): Promise<{
    today: string;
    rows: ChannelMetricsRow[];
    scored: ScoredRow[];
  } | null> {
    const today = formatKstYmd(now);
    const channels = (
      await this.channelRepository.find({
        where: { status: ChannelStatus.ACTIVE },
      })
    ).filter(isScoreCollectable);
    if (channels.length === 0) {
      this.logger.log('점수 계산 대상 채널이 없습니다.');
      return null;
    }

    const ids = channels.map((c) => c.id);
    // 메모리: 게시글 전체(본문 발췌·언급 등 포함, 20만 줄 가까이)를 엔티티로 읽으면 512MB 서버가 꺼진다.
    // 계산에 쓰는 칸만, 그리고 쓰는 줄만 읽는다 (최근 7일 글 + 채널마다 조회 수 있는 최신 글 몇 개)
    const posts = await this.loadPostPoints(ids, now);
    const snapshots = await this.snapshotRepository.find({
      select: [
        'channelId',
        'capturedOn',
        'memberCount',
        'medianViews7d',
        'activity24h',
        'activity7d',
      ],
      where: { channelId: In(ids) },
    });

    const postsByChannel = groupBy(posts, (p) => p.channelId);
    const snapsByChannel = groupBy(snapshots, (s) => s.channelId);

    const rows: ChannelMetricsRow[] = channels.map((channel) =>
      this.buildRow(
        channel,
        postsByChannel.get(channel.id) ?? [],
        snapsByChannel.get(channel.id) ?? [],
        now,
        today,
      ),
    );
    return { today, rows, scored: this.scoreRows(rows) };
  }

  /** 점수 계산용 게시글: 필요한 칸·줄만 (buildRow 가 쓰는 범위와 같게) */
  private async loadPostPoints(ids: string[], now: Date): Promise<PostPoint[]> {
    if (ids.length === 0) return [];
    const since = new Date(now.getTime() - POST_LOOKBACK_MS);
    const sevenAgo = new Date(now.getTime() - SEVEN_DAYS_MS);
    const out: PostPoint[] = [];
    // id 목록이 길면 나눠서 (쿼리 인자 수 제한)
    for (let i = 0; i < ids.length; i += 1000) {
      const chunk = ids.slice(i, i + 1000);
      const rows: Array<{
        channel_id: string;
        posted_at: Date | string;
        views: number | null;
        fwd: boolean | number | null;
      }> = await this.postRepository.manager
        .createQueryBuilder()
        .select([])
        .from((qb) => {
          return qb
            .from(ChannelPost, 'p')
            .select('p.channel_id', 'channel_id')
            .addSelect('p.posted_at', 'posted_at')
            .addSelect('p.views', 'views')
            .addSelect('(p.forwarded_from IS NOT NULL)', 'fwd')
            .addSelect(
              'ROW_NUMBER() OVER (PARTITION BY p.channel_id, (p.views IS NULL) ORDER BY p.posted_at DESC)',
              'rn',
            )
            .where('p.channel_id IN (:...chunk)', { chunk })
            .andWhere('p.posted_at >= :since', { since });
        }, 'x')
        .addSelect('x.channel_id', 'channel_id')
        .addSelect('x.posted_at', 'posted_at')
        .addSelect('x.views', 'views')
        .addSelect('x.fwd', 'fwd')
        .where('x.posted_at >= :sevenAgo', { sevenAgo })
        .orWhere('(x.views IS NOT NULL AND x.rn <= :minPosts)', {
          minPosts: THRESHOLDS.minPostsForCv,
        })
        .getRawMany();
      for (const row of rows) {
        out.push({
          channelId: row.channel_id,
          postedAt: new Date(row.posted_at),
          views: row.views == null ? null : Number(row.views),
          forwardedFrom: Boolean(row.fwd),
        });
      }
    }
    return out;
  }

  private async persistSnapshots(rows: ChannelMetricsRow[], today: string) {
    if (rows.length === 0) return;
    await this.snapshotRepository.upsert(
      rows.map((row) => ({
        channelId: row.channel.id,
        capturedOn: today,
        memberCount: row.memberCount,
        medianViews7d:
          row.medianViews7d == null ? 0 : Math.round(row.medianViews7d),
        posts7d: row.posts7d,
        forwardedRatio: row.forwardedRatio,
        activity24h: row.activity24h,
        activity7d: row.activity7d,
      })),
      ['channelId', 'capturedOn'],
    );
  }

  private buildRow(
    channel: Channel,
    posts: PostPoint[],
    snapshots: SnapshotPick[],
    now: Date,
    today: string,
  ): ChannelMetricsRow {
    const isGroup = channel.linkType === LinkType.GROUP;
    const memberCount = channel.memberCount ?? 0;
    const sevenAgo = new Date(now.getTime() - SEVEN_DAYS_MS);
    const matureBefore = new Date(now.getTime() - TWENTY_FOUR_H_MS);
    const todaySnap = snapshots.find((s) => s.capturedOn === today);

    if (isGroup) {
      const activity7d = todaySnap?.activity7d ?? channel.posts7d ?? 0;
      const growth24h = growthFromSnapshots(snapshots, today, memberCount, 1);
      const growth7d = growthFromSnapshots(snapshots, today, memberCount, 7);
      const growth30d = growthFromSnapshots(snapshots, today, memberCount, 30);
      return {
        channel,
        medianViews7d: null,
        posts7d: activity7d,
        forwardedRatio: 0,
        viewRate: null,
        growth24h,
        growth7d,
        growth30d,
        ...memberDeltas(snapshots, today, memberCount),
        observedDays: countObservedDays(channel.firstObservedAt, today),
        memberCount,
        isGroup,
        activity24h: todaySnap?.activity24h ?? 0,
        activity7d,
        manipulationSuspected: false,
      };
    }

    const posts7dList = posts.filter(
      (p) => p.postedAt.getTime() >= sevenAgo.getTime(),
    );
    const matureViews = posts7dList
      .filter(
        (p) =>
          p.postedAt.getTime() <= matureBefore.getTime() && p.views != null,
      )
      .map((p) => p.views as number);
    const medianViews7d = median(matureViews);
    const posts7d = posts7dList.length;
    const forwardedRatio =
      posts7d === 0
        ? 0
        : posts7dList.filter((p) => Boolean(p.forwardedFrom)).length / posts7d;
    const viewRate =
      isGroup || medianViews7d == null || memberCount <= 0
        ? null
        : medianViews7d / memberCount;

    const growth24h = growthFromSnapshots(snapshots, today, memberCount, 1);
    const growth7d = growthFromSnapshots(snapshots, today, memberCount, 7);
    const growth30d = growthFromSnapshots(snapshots, today, memberCount, 30);

    const observedDays = countObservedDays(channel.firstObservedAt, today);
    const recentViews = posts
      .filter((p) => p.views != null)
      .sort((a, b) => b.postedAt.getTime() - a.postedAt.getTime())
      .slice(0, THRESHOLDS.minPostsForCv)
      .map((p) => p.views as number);

    const todaySnapForFlag = {
      capturedOn: today,
      memberCount,
      medianViews7d: medianViews7d == null ? 0 : Math.round(medianViews7d),
    };
    const snapsForFlag = [
      ...snapshots
        .filter((s) => s.capturedOn !== today)
        .map((s) => ({
          capturedOn: s.capturedOn,
          memberCount: s.memberCount,
          medianViews7d: s.medianViews7d,
        })),
      todaySnapForFlag,
    ];

    return {
      channel,
      medianViews7d: medianViews7d == null ? null : Math.round(medianViews7d),
      posts7d,
      forwardedRatio,
      viewRate,
      growth24h,
      growth7d,
      growth30d,
      ...memberDeltas(snapshots, today, memberCount),
      observedDays,
      memberCount,
      isGroup,
      activity24h: 0,
      activity7d: 0,
      manipulationSuspected: isManipulationSuspected({
        viewRate,
        snapshots: snapsForFlag,
        recentViews,
      }),
    };
  }

  private scoreRows(rows: ChannelMetricsRow[]): ScoredRow[] {
    const domesticChannels = rows.filter(
      (r) => !r.isGroup && r.channel.language !== 'foreign',
    );
    const foreignChannels = rows.filter(
      (r) => !r.isGroup && r.channel.language === 'foreign',
    );
    const domesticGroups = rows.filter(
      (r) => r.isGroup && r.channel.language !== 'foreign',
    );
    const foreignGroups = rows.filter(
      (r) => r.isGroup && r.channel.language === 'foreign',
    );
    return [
      ...this.scorePool(domesticChannels, false),
      ...this.scorePool(foreignChannels, false),
      ...this.scorePool(domesticGroups, true),
      ...this.scorePool(foreignGroups, true),
    ];
  }

  private scorePool(rows: ChannelMetricsRow[], isGroup: boolean): ScoredRow[] {
    if (rows.length === 0) return [];

    const scaleValues = sorted(rows.map((r) => Math.log10(r.memberCount + 1)));
    const viewRateValues = sorted(rows.map((r) => r.viewRate ?? 0));
    // 활동 점수는 글이 실제로 읽힌 방(posts7d>0)끼리만 순위를 매긴다.
    // 예전엔 글 0인 방이 많아 "0"도 중간 순위를 받았다 → 회원만 많은·글 못 읽는 방이 상위를 차지.
    // 이제 글 0이면 활동 점수 0, 글이 하나라도 있으면 그들 사이의 순위.
    const activeActivityValues = sorted(
      rows.map((r) => r.posts7d).filter((v) => v > 0),
    );
    const growthValues = sorted(rows.map((r) => r.growth7d ?? 0));

    const prelim = rows.map((row) => {
      const scaleScore = percentile(
        Math.log10(row.memberCount + 1),
        scaleValues,
      );
      const viewRateScore = isGroup
        ? 0
        : percentile(row.viewRate ?? 0, viewRateValues);
      const activityScore =
        row.posts7d > 0 ? percentile(row.posts7d, activeActivityValues) : 0;
      const growthScore = percentile(row.growth7d ?? 0, growthValues);

      let mixed: number;
      if (isGroup) {
        mixed =
          100 *
          (SCORE_WEIGHTS.group.scale * scaleScore +
            SCORE_WEIGHTS.group.activity * activityScore +
            SCORE_WEIGHTS.group.growth * growthScore);
      } else {
        mixed =
          100 *
          (SCORE_WEIGHTS.channel.scale * scaleScore +
            SCORE_WEIGHTS.channel.viewRate * viewRateScore +
            SCORE_WEIGHTS.channel.activity * activityScore +
            SCORE_WEIGHTS.channel.growth * growthScore);
      }
      if (row.manipulationSuspected) {
        mixed *= THRESHOLDS.manipulationScoreMultiplier;
      }
      // 회원만 급증하고 활동이 확인 안 되는 방(회원 구매 정황)은 추가 감점
      if (
        isMemberSurgeSuspected({
          memberCount: row.memberCount,
          memberDelta7d: row.memberDelta7d,
          memberDelta30d: row.memberDelta30d,
          viewRate: row.viewRate,
          posts7d: row.posts7d,
        })
      ) {
        mixed *= SURGE_SCORE_MULTIPLIER;
      }
      const total = clampScore(mixed);
      return {
        ...row,
        scaleScore,
        viewRateScore,
        activityScore,
        growthScore,
        total,
        grade: gradeFromTotal(total),
        overallRank: 0,
        categoryRank: 0,
      };
    });

    const byScore = [...prelim].sort(
      (a, b) => b.total - a.total || a.channel.id.localeCompare(b.channel.id),
    );
    byScore.forEach((row, i) => {
      row.overallRank = i + 1;
    });

    const byCategory = new Map<string, ScoredRow[]>();
    for (const row of byScore) {
      const key = row.channel.category || '';
      const list = byCategory.get(key) ?? [];
      list.push(row);
      byCategory.set(key, list);
    }
    for (const list of byCategory.values()) {
      list.forEach((row, i) => {
        row.categoryRank = i + 1;
      });
    }

    return prelim;
  }

  private async persistScores(rows: ScoredRow[], today: string) {
    const yesterday = addKstDays(today, -1);
    const ids = rows.map((r) => r.channel.id);
    const yesterdayScores =
      ids.length === 0
        ? []
        : await this.scoreRepository.find({
            where: { channelId: In(ids), scoredOn: yesterday },
          });
    const yesterdayRank = new Map(
      yesterdayScores.map((s) => [s.channelId, s.overallRank]),
    );

    await this.scoreRepository.upsert(
      rows.map((row) => ({
        channelId: row.channel.id,
        scoredOn: today,
        total: row.total,
        grade: row.grade,
        scaleScore: row.scaleScore,
        viewRateScore: row.viewRateScore,
        activityScore: row.activityScore,
        growthScore: row.growthScore,
        manipulationSuspected: row.manipulationSuspected,
        overallRank: row.overallRank,
        categoryRank: row.categoryRank,
      })),
      ['channelId', 'scoredOn'],
    );

    for (const row of rows) {
      const prevRank = yesterdayRank.get(row.channel.id);
      if (
        prevRank != null &&
        row.overallRank != null &&
        prevRank - row.overallRank >= THRESHOLDS.rankUpSteps
      ) {
        await this.eventRepository.save({
          channelId: row.channel.id,
          type: 'rank_up',
          before: String(prevRank),
          after: String(row.overallRank),
          occurredAt: new Date(),
        });
      }

      await this.channelRepository.update(row.channel.id, {
        score: row.total,
        grade: row.grade,
        viewRate: row.viewRate,
        growth24h: row.growth24h,
        growth7d: row.growth7d,
        growth30d: row.growth30d,
        memberDelta24h: row.memberDelta24h,
        memberDelta7d: row.memberDelta7d,
        memberDelta30d: row.memberDelta30d,
        medianViews7d: row.medianViews7d,
        posts7d: row.posts7d,
        observedDays: row.observedDays,
      });
    }
  }
}

function memberDeltas(
  snapshots: { capturedOn: string; memberCount: number }[],
  today: string,
  memberCount: number,
) {
  return {
    memberDelta24h: memberDeltaFromSnapshots(snapshots, today, memberCount, 1),
    memberDelta7d: memberDeltaFromSnapshots(snapshots, today, memberCount, 7),
    memberDelta30d: memberDeltaFromSnapshots(snapshots, today, memberCount, 30),
  };
}

function groupBy<T>(items: T[], keyOf: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const list = map.get(key);
    if (list) list.push(item);
    else map.set(key, [item]);
  }
  return map;
}

function sorted(values: number[]): number[] {
  return [...values].sort((a, b) => a - b);
}
