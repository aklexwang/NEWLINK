import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThanOrEqual, Repository } from 'typeorm';
import { Channel, ChannelStatus, LinkType } from '../channels/channel.entity';
import { isScoreCollectable } from './collect-visibility';
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
    const built = await this.buildScored(now);
    if (!built) return;
    const row = built.rows.find((item) => item.channel.id === channelId);
    const scored = built.scored.find((item) => item.channel.id === channelId);
    if (!row || !scored) return;
    await this.persistSnapshots([row], built.today);
    await this.persistScores([scored], built.today);
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
    const since = new Date(now.getTime() - POST_LOOKBACK_MS);
    const posts = await this.postRepository.find({
      where: { channelId: In(ids), postedAt: MoreThanOrEqual(since) },
    });
    const snapshots = await this.snapshotRepository.find({
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
    posts: ChannelPost[],
    snapshots: ChannelSnapshot[],
    now: Date,
    today: string,
  ): ChannelMetricsRow {
    const isGroup = channel.linkType === LinkType.GROUP;
    const memberCount = channel.memberCount ?? 0;
    const sevenAgo = new Date(now.getTime() - SEVEN_DAYS_MS);
    const matureBefore = new Date(now.getTime() - TWENTY_FOUR_H_MS);
    const todaySnap = snapshots.find((s) => s.capturedOn === today);

    if (isGroup) {
      const activity7d =
        todaySnap?.activity7d ??
        channel.posts7d ??
        0;
      const growth24h = growthFromSnapshots(
        snapshots,
        today,
        memberCount,
        1,
      );
      const growth7d = growthFromSnapshots(
        snapshots,
        today,
        memberCount,
        7,
      );
      const growth30d = growthFromSnapshots(
        snapshots,
        today,
        memberCount,
        30,
      );
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

    const growth24h = growthFromSnapshots(
      snapshots,
      today,
      memberCount,
      1,
    );
    const growth7d = growthFromSnapshots(
      snapshots,
      today,
      memberCount,
      7,
    );
    const growth30d = growthFromSnapshots(
      snapshots,
      today,
      memberCount,
      30,
    );

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
    const activityValues = sorted(rows.map((r) => r.posts7d));
    const growthValues = sorted(rows.map((r) => r.growth7d ?? 0));

    const prelim = rows.map((row) => {
      const scaleScore = percentile(
        Math.log10(row.memberCount + 1),
        scaleValues,
      );
      const viewRateScore = isGroup
        ? 0
        : percentile(row.viewRate ?? 0, viewRateValues);
      const activityScore = percentile(row.posts7d, activityValues);
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
