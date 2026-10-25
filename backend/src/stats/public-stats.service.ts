import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, MoreThanOrEqual, Repository } from 'typeorm';
import { Channel, ChannelStatus, LinkType } from '../channels/channel.entity';
import { isVisibleOnPublicLists } from '../channels/channel-language.logic';
import { shouldHideIllegalSuspicion } from '../channels/illegal-content.logic';
import {
  allowAdultInList,
  isPendingCategory,
} from '../channels/auto-expose.logic';
import { dedupeChannelsByLink } from '../channels/channel-link.logic';
import { isPublicCollectable } from './collect-visibility';
import {
  isMemberVisible,
  pickBestMemberRow,
  selectMemberVisibleRows,
} from './member-visible.logic';
import { telegramChatIdVariants } from './linked-chat.logic';
import { sliceRankingPage } from './collect-budget.logic';
import { lastPostAtFromCollectedPosts } from './stats-collect.logic';
import {
  collapseWeeklyRankUps,
  isWeeklyHeadlineChannel,
} from './weekly-headlines.logic';
import { ChannelsService } from '../channels/channels.service';
import { extractTelegramUsernameFromLink } from '../channels/telegram-username';
import {
  buildChannelBadges,
  RISING_MIN_MEMBERS,
  type ChannelBadge,
} from './channel-badges';
import { ChannelEvent, ChannelEventType } from './channel-event.entity';
import {
  addKstDays,
  DATA_SHORT_DAYS,
  formatKstYmd,
} from './channel-metrics.math';
import { ChannelPost } from './channel-post.entity';
import { ChannelScore } from './channel-score.entity';
import { ChannelSnapshot } from './channel-snapshot.entity';
import type {
  HomeFeedQueryDto,
  RankingQueryDto,
  RankingSort,
  StatsRange,
} from './dto/public-stats.dto';
import { parseCompareIds } from './dto/public-stats.dto';
import {
  formatIsoWeek,
  currentIsoWeek,
  isoWeekRangeKst,
  isAfterIsoWeek,
  parseIsoWeek,
  previousIsoWeek,
} from './kst-week';

const HOME_CACHE_MS = 3 * 60 * 1000;

const WEEKLY_EVENT_TYPES: ChannelEventType[] = [
  'title_changed',
  'username_changed',
  'first_seen',
  'rank_up',
];

@Injectable()
export class PublicStatsService {
  private homeCache: { expiresAt: number; data: unknown } | null = null;
  private readonly feedCache = new Map<string, { expiresAt: number; data: unknown }>();

  constructor(
    @InjectRepository(Channel)
    private readonly channelRepository: Repository<Channel>,
    @InjectRepository(ChannelScore)
    private readonly scoreRepository: Repository<ChannelScore>,
    @InjectRepository(ChannelSnapshot)
    private readonly snapshotRepository: Repository<ChannelSnapshot>,
    @InjectRepository(ChannelPost)
    private readonly postRepository: Repository<ChannelPost>,
    @InjectRepository(ChannelEvent)
    private readonly eventRepository: Repository<ChannelEvent>,
    private readonly channelsService: ChannelsService,
  ) {}

  async getDetailByUsername(usernameRaw: string) {
    const username = usernameRaw.replace(/^@/, '').trim().toLowerCase();
    if (!username) {
      throw new BadRequestException('username이 필요합니다.');
    }
    const rows = await this.channelRepository
      .createQueryBuilder('channel')
      .where('channel.status = :status', { status: ChannelStatus.ACTIVE })
      .andWhere('LOWER(channel.username) = :username', { username })
      .getMany();
    // 같은 username 행이 여럿이면 노출 가능한 행을 먼저, 그다음 가장 좋은 행
    const channel = pickBestMemberRow(rows);
    if (!channel) {
      throw new NotFoundException('채널을 찾을 수 없습니다.');
    }
    return this.buildDetail(channel);
  }

  async getDetailById(id: string) {
    const channel = await this.requireActive(id);
    return this.buildDetail(channel);
  }

  async getStatsSeries(id: string, range: StatsRange = '7') {
    const channel = await this.requireActive(id);
    const days = Number(range);
    const today = formatKstYmd();
    const start = addKstDays(today, -(days - 1));
    const snaps = await this.snapshotRepository.find({
      where: { channelId: channel.id },
    });
    const byDay = new Map(snaps.map((s) => [s.capturedOn, s]));
    const points: {
      date: string;
      memberCount: number | null;
      medianViews7d: number | null;
    }[] = [];
    for (let i = 0; i < days; i += 1) {
      const date = addKstDays(start, i);
      const snap = byDay.get(date);
      points.push({
        date,
        memberCount: snap ? snap.memberCount : null,
        medianViews7d: snap ? snap.medianViews7d : null,
      });
    }
    return { channelId: channel.id, range: days, points };
  }

  async getPosts(id: string, limit = 20) {
    const channel = await this.requireActive(id);
    if (channel.linkType === LinkType.GROUP) return [];
    const posts = await this.postRepository.find({
      where: { channelId: channel.id },
      order: { postedAt: 'DESC' },
      take: limit,
    });
    const username =
      channel.username ?? extractTelegramUsernameFromLink(channel.link);
    return posts.map((post) => ({
      messageId: post.messageId,
      postedAt: post.postedAt.toISOString(),
      views: post.views,
      mediaType: post.mediaType,
      link: username
        ? `https://t.me/${username}/${post.messageId}`
        : channel.link,
    }));
  }

  async getEvents(id: string, limit = 20) {
    const channel = await this.requireActive(id);
    const events = await this.eventRepository.find({
      where: { channelId: channel.id },
      order: { occurredAt: 'DESC' },
      take: limit,
    });
    return events.map((event) => ({
      id: event.id,
      type: event.type,
      before: event.before,
      after: event.after,
      occurredAt: event.occurredAt.toISOString(),
    }));
  }

  async getMediaMix(id: string) {
    const channel = await this.requireActive(id);
    if (channel.linkType === LinkType.GROUP) {
      return {
        channelId: channel.id,
        rangeDays: 90,
        total: 0,
        byType: { text: 0, photo: 0, video: 0, file: 0, other: 0 },
        topSources: [] as { source: string; count: number }[],
      };
    }
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const posts = await this.postRepository.find({
      where: { channelId: channel.id, postedAt: MoreThanOrEqual(since) },
    });
    const byType: Record<string, number> = {
      text: 0,
      photo: 0,
      video: 0,
      file: 0,
      other: 0,
    };
    const sourceCounts = new Map<string, number>();
    for (const post of posts) {
      byType[post.mediaType] = (byType[post.mediaType] ?? 0) + 1;
      if (post.forwardedFrom) {
        sourceCounts.set(
          post.forwardedFrom,
          (sourceCounts.get(post.forwardedFrom) ?? 0) + 1,
        );
      }
    }
    const topSources = [...sourceCounts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 10)
      .map(([source, count]) => ({ source, count }));
    return {
      channelId: channel.id,
      rangeDays: 90,
      total: posts.length,
      byType,
      topSources,
    };
  }

  async getWeekly(weekRaw?: string) {
    const today = formatKstYmd();
    let year: number;
    let week: number;
    if (weekRaw) {
      const parsed = parseIsoWeek(weekRaw);
      if (!parsed) {
        throw new BadRequestException('week는 YYYY-Www 형식이어야 합니다.');
      }
      year = parsed.year;
      week = parsed.week;
      if (isAfterIsoWeek(year, week, today)) {
        const current = currentIsoWeek(today);
        year = current.year;
        week = current.week;
      }
    } else {
      const prev = previousIsoWeek(today);
      year = prev.year;
      week = prev.week;
    }
    const { startYmd, endYmd } = isoWeekRangeKst(year, week);
    const start = new Date(`${startYmd}T00:00:00+09:00`);
    const weekEnd = new Date(`${endYmd}T23:59:59.999+09:00`);
    const now = new Date();
    const end = weekEnd.getTime() > now.getTime() ? now : weekEnd;
    const events = await this.eventRepository.find({
      where: {
        type: In(WEEKLY_EVENT_TYPES),
        occurredAt: Between(start, end),
      },
      order: { occurredAt: 'DESC' },
    });
    const channelIds = [...new Set(events.map((e) => e.channelId))];
    const channels =
      channelIds.length === 0
        ? []
        : await this.channelRepository.find({ where: { id: In(channelIds) } });
    const channelMap = new Map(channels.map((c) => [c.id, c]));
    const visibleEvents = events.filter((event) => {
      const ch = channelMap.get(event.channelId);
      return ch != null && isWeeklyHeadlineChannel(ch);
    });

    const mapEvent = (event: ChannelEvent) => {
      const ch = channelMap.get(event.channelId);
      return {
        id: event.id,
        channelId: event.channelId,
        channelTitle: ch?.title ?? null,
        username: ch?.username ?? null,
        type: event.type,
        before: event.before,
        after: event.after,
        occurredAt: event.occurredAt.toISOString(),
      };
    };

    const titleChanged = visibleEvents
      .filter((e) => e.type === 'title_changed')
      .map(mapEvent);
    const usernameChanged = visibleEvents
      .filter((e) => e.type === 'username_changed')
      .map(mapEvent);
    const firstSeen = visibleEvents
      .filter((e) => e.type === 'first_seen')
      .map(mapEvent);
    const rankUp = collapseWeeklyRankUps(
      visibleEvents.filter((e) => e.type === 'rank_up'),
    ).map(mapEvent);

    return {
      week: formatIsoWeek(year, week),
      start: startYmd,
      end: endYmd,
      counts: {
        titleChanged: titleChanged.length,
        usernameChanged: usernameChanged.length,
        firstSeen: firstSeen.length,
        rankUp: rankUp.length,
      },
      titleChanged,
      usernameChanged,
      firstSeen,
      rankUp,
    };
  }

  clearPublicCaches() {
    this.homeCache = null;
    this.feedCache.clear();
  }

  async getHome() {
    if (this.homeCache && this.homeCache.expiresAt > Date.now()) {
      return this.homeCache.data;
    }

    const weekly = await this.getWeekly(currentIsoWeek(formatKstYmd()).label);
    let topBy: 'score' | 'members' = 'score';
    let top = await this.listRanking({ sort: 'score', limit: 10 });
    const scoredCount = top.filter((item) => item.score != null).length;
    if (scoredCount < 3) {
      topBy = 'members';
      top = await this.listRanking({ sort: 'members', limit: 10 });
    }

    const rising = await this.listRanking({ sort: 'rising', limit: 1 });
    const promoted = (await this.channelsService.findActivePromoted(8)).filter(
      (ch) => isPublicCollectable(ch),
    );

    const data = {
      week: weekly.week,
      topBy,
      topChannels: top.map((item) => this.toHomeCard(item)),
      headlines: {
        risingTitle: rising[0]?.title ?? null,
        risingId: rising[0]?.id ?? null,
        risingUsername: this.stripAt(rising[0]?.username),
        risingLink: rising[0]?.link ?? null,
        firstSeenCount: weekly.counts.firstSeen,
        rankUpCount: weekly.counts.rankUp,
        firstSeen: weekly.firstSeen.slice(0, 8).map((item) => ({
          id: item.channelId,
          title: item.channelTitle,
          username: item.username,
        })),
        rankUp: weekly.rankUp.slice(0, 8).map((item) => ({
          id: item.channelId,
          title: item.channelTitle,
          username: item.username,
        })),
      },
      promoted: promoted.map((ch) => ({
        id: ch.id,
        title: ch.title,
        username:
          ch.username ?? extractTelegramUsernameFromLink(ch.link),
        link: ch.link,
        avatarUrl: this.channelsService.getListAvatarUrl(ch),
        category: ch.category,
        linkType: ch.linkType,
      })),
    };

    this.homeCache = { expiresAt: Date.now() + HOME_CACHE_MS, data };
    return data;
  }

  async getFeed(query: HomeFeedQueryDto) {
    const type = query.type ?? 'channel';
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 50);
    const cacheKey = `feed:${type}:${query.cursor ?? ''}:${limit}`;
    const cached = this.feedCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    let channels = await this.channelRepository.find({
      where: { status: ChannelStatus.ACTIVE },
    });
    // 회원 노출 규칙은 한 곳(describeMemberPageVisibility), 같은 링크는 가장 좋은 행 1개
    channels = selectMemberVisibleRows(channels);
    if (type === 'channel') {
      channels = channels.filter((c) => c.linkType === LinkType.CHANNEL);
    } else if (type === 'group') {
      channels = channels.filter((c) => c.linkType === LinkType.GROUP);
    }

    const lastPosts = await this.postRepository
      .createQueryBuilder('post')
      .select('post.channel_id', 'channelId')
      .addSelect('MAX(post.posted_at)', 'lastPostAt')
      .groupBy('post.channel_id')
      .getRawMany<Record<string, unknown>>();
    const lastMap = new Map<string, Date>();
    for (const row of lastPosts) {
      const id = String(row.channelId ?? row.channel_id ?? '');
      const rawAt = row.lastPostAt ?? row.last_post_at;
      const last = lastPostAtFromCollectedPosts([
        { postedAt: rawAt instanceof Date ? rawAt : String(rawAt ?? '') },
      ]);
      if (id && last) lastMap.set(id, last);
    }

    const rows = channels
      .map((channel) => {
        if (channel.linkType === LinkType.GROUP) {
          if (channel.collectStatus !== 'ok' || !channel.lastCollectedAt) {
            return { channel, lastPostAt: null as Date | null, activityKind: 'members' as const };
          }
          return {
            channel,
            lastPostAt: channel.lastCollectedAt,
            activityKind: 'members' as const,
          };
        }
        const lastPostAt = lastMap.get(channel.id) ?? null;
        return { channel, lastPostAt, activityKind: 'post' as const };
      })
      .filter((row) => row.lastPostAt != null)
      .sort((a, b) => {
        const dt = (b.lastPostAt as Date).getTime() - (a.lastPostAt as Date).getTime();
        if (dt !== 0) return dt;
        return b.channel.id.localeCompare(a.channel.id);
      });

    const cursor = parseFeedCursor(query.cursor);
    let start = 0;
    if (cursor) {
      start = rows.findIndex((row) => {
        const at = (row.lastPostAt as Date).getTime();
        if (at < cursor.at) return true;
        if (at === cursor.at && row.channel.id < cursor.id) return true;
        return false;
      });
      if (start < 0) start = rows.length;
    }

    const slice = rows.slice(start, start + limit);
    const last = slice[slice.length - 1];
    const nextCursor =
      slice.length === limit && last?.lastPostAt
        ? `${(last.lastPostAt as Date).toISOString()}::${last.channel.id}`
        : null;

    const data = {
      items: slice.map(({ channel, lastPostAt, activityKind }) => ({
        id: channel.id,
        title: channel.title,
        username:
          channel.username ?? extractTelegramUsernameFromLink(channel.link),
        link: channel.link,
        avatarUrl: this.channelsService.getListAvatarUrl(channel),
        category: channel.category,
        linkType: channel.linkType,
        memberCount: channel.memberCount,
        growth7d: channel.growth7d,
        grade: channel.grade,
        score: channel.score,
        lastPostAt: (lastPostAt as Date).toISOString(),
        activityKind,
      })),
      nextCursor,
    };
    this.feedCache.set(cacheKey, {
      expiresAt: Date.now() + HOME_CACHE_MS,
      data,
    });
    return data;
  }

  private toHomeCard(item: {
    id: string;
    title: string;
    username: string | null;
    link: string;
    avatarUrl: string | null;
    score?: number | null;
    participantsCount: number;
    category: string;
    linkType: string;
    grade?: string | null;
  }) {
    return {
      id: item.id,
      title: item.title,
      username: this.stripAt(item.username),
      link: item.link,
      avatarUrl: item.avatarUrl,
      score: item.score ?? null,
      memberCount: item.participantsCount,
      category: item.category,
      linkType: item.linkType,
      grade: item.grade ?? null,
    };
  }

  private stripAt(username: string | null | undefined): string | null {
    if (!username) return null;
    const u = username.replace(/^@/, '').trim();
    return u || null;
  }

  async compare(idsRaw: string) {
    const ids = parseCompareIds(idsRaw);
    if (ids.length < 1) {
      throw new BadRequestException('ids가 필요합니다.');
    }
    if (ids.length > 3) {
      throw new BadRequestException('비교는 최대 3개입니다.');
    }
    const items = [];
    for (const id of ids) {
      const channel = await this.requireActive(id);
      if (channel.isVisible === false) {
        throw new BadRequestException('노출이 중지된 채널입니다.');
      }
      const detail = await this.buildDetail(channel);
      const stats = await this.getStatsSeries(channel.id, '30');
      items.push({
        id: channel.id,
        title: channel.title,
        username: channel.username,
        score: detail.score,
        grade: detail.grade,
        viewRate: detail.viewRate,
        growth7d: detail.growth7d,
        memberCount: detail.memberCount,
        badges: detail.badges,
        latestScore: detail.latestScore,
        stats: stats.points,
      });
    }
    return { items };
  }

  async listRanking(query: RankingQueryDto) {
    const sort: RankingSort = query.sort ?? 'members';
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 100);
    const today = formatKstYmd();

    let channels = await this.channelRepository.find({
      where: { status: ChannelStatus.ACTIVE },
    });
    const listable = (c: Channel) =>
      isPublicCollectable(c) &&
      !shouldHideIllegalSuspicion(c) &&
      (query.includeForeign || isVisibleOnPublicLists(c));
    // 같은 링크는 목록에 나올 수 있는 행을 먼저 대표로 고른다
    channels = dedupeChannelsByLink(channels, { prefer: listable }).filter(
      listable,
    );

    if (query.category && query.category !== 'all') {
      channels = channels.filter((c) => c.category === query.category);
    } else {
      channels = channels.filter(
        (c) =>
          allowAdultInList(c.category) && !isPendingCategory(c.category),
      );
    }
    if (query.type) {
      channels = channels.filter((c) => c.linkType === query.type);
    }
    if (query.hideLowData) {
      channels = channels.filter(
        (c) => (c.observedDays ?? 0) >= DATA_SHORT_DAYS,
      );
    }
    if (query.verifiedOnly) {
      channels = channels.filter((c) => c.isVerified);
    }
    if (sort === 'rising') {
      channels = channels.filter(
        (c) =>
          (c.memberCount ?? 0) >= RISING_MIN_MEMBERS && c.growth7d != null,
      );
    }

    channels.sort((a, b) => this.compareRanking(a, b, sort));
    const slice = sliceRankingPage(channels, query.offset, limit);

    const latestScores = await this.latestScoresByChannel(
      slice.map((c) => c.id),
    );
    const categoryCounts = this.countByCategory(channels);
    const sparkByChannel = await this.sparkline14(
      slice.map((c) => c.id),
      today,
    );

    return slice.map((channel) => {
      const score = latestScores.get(channel.id) ?? null;
      const badges = buildChannelBadges({
        viewRate: channel.viewRate,
        firstObservedAt: channel.firstObservedAt,
        createdAt: channel.createdAt,
        observedDays: channel.observedDays,
        categoryRank: score?.categoryRank ?? null,
        categoryCount: categoryCounts.get(channel.category) ?? 0,
        manipulationSuspected: score?.manipulationSuspected ?? false,
        todayYmd: today,
      });
      return {
        id: channel.id,
        title: channel.title,
        username: channel.username
          ? `@${channel.username}`
          : extractTelegramUsernameFromLink(channel.link),
        link: channel.link,
        avatarUrl: this.channelsService.getListAvatarUrl(channel),
        participantsCount: channel.memberCount ?? 0,
        recommendCount: channel.recommendCount,
        category: channel.category,
        linkType: channel.linkType,
        source: 'database' as const,
        score: channel.score,
        grade: channel.grade,
        viewRate: channel.viewRate,
        growth7d: channel.growth7d,
        isVerified: Boolean(channel.isVerified),
        badges,
        sparkline14: sparkByChannel.get(channel.id) ?? [],
      };
    });
  }

  private compareRanking(a: Channel, b: Channel, sort: RankingSort): number {
    const num = (v: number | null | undefined) => v ?? -Infinity;
    const date = (v: Date | null | undefined) => (v ? v.getTime() : 0);
    switch (sort) {
      case 'score':
        return (
          num(b.score) - num(a.score) ||
          (b.memberCount ?? 0) - (a.memberCount ?? 0)
        );
      case 'views':
        return num(b.medianViews7d) - num(a.medianViews7d);
      case 'viewRate':
        return num(b.viewRate) - num(a.viewRate);
      case 'rising':
      case 'growth7d':
        return num(b.growth7d) - num(a.growth7d);
      case 'growth24h':
        return num(b.growth24h) - num(a.growth24h);
      case 'growth30d':
        return num(b.growth30d) - num(a.growth30d);
      case 'activity':
        return num(b.posts7d) - num(a.posts7d);
      case 'newest':
        return (
          date(b.firstObservedAt ?? b.createdAt) -
          date(a.firstObservedAt ?? a.createdAt)
        );
      case 'members':
      default:
        return (
          (b.memberCount ?? 0) - (a.memberCount ?? 0) ||
          b.recommendCount - a.recommendCount
        );
    }
  }

  private async buildDetail(channel: Channel) {
    const today = formatKstYmd();
    const latest = await this.latestScore(channel.id);
    const categoryCount = await this.channelRepository.count({
      where: { status: ChannelStatus.ACTIVE, category: channel.category },
    });
    const badges: ChannelBadge[] = buildChannelBadges({
      viewRate: channel.viewRate,
      firstObservedAt: channel.firstObservedAt,
      createdAt: channel.createdAt,
      observedDays: channel.observedDays,
      categoryRank: latest?.categoryRank ?? null,
      categoryCount,
      manipulationSuspected: latest?.manipulationSuspected ?? false,
      todayYmd: today,
    });

    const linkedChat = await this.buildLinkedChat(channel);

    return {
      id: channel.id,
      title: channel.title,
      username: channel.username,
      link: channel.link,
      linkType: channel.linkType,
      createdOn: channel.createdOn ? new Date(channel.createdOn).toISOString() : null,
      linkedChat,
      category: channel.category,
      description: channel.description,
      avatarUrl: this.channelsService.getListAvatarUrl(channel),
      memberCount: channel.memberCount,
      firstObservedAt: channel.firstObservedAt?.toISOString() ?? null,
      lastCollectedAt: channel.lastCollectedAt?.toISOString() ?? null,
      observedDays: channel.observedDays,
      score: channel.score,
      grade: channel.grade,
      viewRate: channel.viewRate,
      growth24h: channel.growth24h,
      growth7d: channel.growth7d,
      growth30d: channel.growth30d,
      medianViews7d: channel.medianViews7d,
      posts7d: channel.posts7d,
      activity7d: channel.posts7d,
      collectStatus: channel.collectStatus,
      isVisible: channel.isVisible !== false,
      isVerified: Boolean(channel.isVerified),
      verifiedAt: channel.verifiedAt?.toISOString() ?? null,
      latestScore: latest
        ? {
            scoredOn: latest.scoredOn,
            total: latest.total,
            grade: latest.grade,
            scaleScore: latest.scaleScore,
            viewRateScore: latest.viewRateScore,
            activityScore: latest.activityScore,
            growthScore: latest.growthScore,
            manipulationSuspected: latest.manipulationSuspected,
            overallRank: latest.overallRank,
            categoryRank: latest.categoryRank,
          }
        : null,
      badges,
    };
  }

  /**
   * 채널이면 연결된 대화방, 그룹이면 부모 채널. MTProto 로 확인된 것만.
   * 우리 DB 에 회원에게 보여도 되는 행이 있으면 그 행으로 연결하고, 없으면 이름만 보여준다.
   */
  private async buildLinkedChat(channel: Channel) {
    if (channel.linkedChatTelegramId == null) return null;
    const role = channel.linkType === LinkType.GROUP ? 'parent' : 'discussion';
    const rows = await this.channelRepository
      .createQueryBuilder('c')
      .where('c.status = :status', { status: ChannelStatus.ACTIVE })
      .andWhere('c.id <> :self', { self: channel.id })
      .andWhere('c.telegramChatId IN (:...ids)', {
        ids: telegramChatIdVariants(channel.linkedChatTelegramId),
      })
      .getMany();
    const row = pickBestMemberRow(rows);
    const visible = row && isMemberVisible(row) ? row : null;
    const username = visible?.username ?? channel.linkedChatUsername ?? null;
    return {
      role,
      title: visible?.title ?? channel.linkedChatTitle ?? null,
      username,
      channelId: visible?.id ?? null,
      memberCount: visible?.memberCount ?? null,
      isPrivate: !username,
      createdOn: channel.linkedChatCreatedOn
        ? new Date(channel.linkedChatCreatedOn).toISOString()
        : null,
    };
  }

  private async latestScore(channelId: string): Promise<ChannelScore | null> {
    return this.scoreRepository.findOne({
      where: { channelId },
      order: { scoredOn: 'DESC' },
    });
  }

  private async latestScoresByChannel(
    ids: string[],
  ): Promise<Map<string, ChannelScore>> {
    const map = new Map<string, ChannelScore>();
    if (ids.length === 0) return map;
    const scores = await this.scoreRepository.find({
      where: { channelId: In(ids) },
      order: { scoredOn: 'DESC' },
    });
    for (const score of scores) {
      if (!map.has(score.channelId)) map.set(score.channelId, score);
    }
    return map;
  }

  private countByCategory(channels: Channel[]): Map<string, number> {
    const map = new Map<string, number>();
    for (const ch of channels) {
      map.set(ch.category, (map.get(ch.category) ?? 0) + 1);
    }
    return map;
  }

  private async sparkline14(
    ids: string[],
    today: string,
  ): Promise<Map<string, (number | null)[]>> {
    const result = new Map<string, (number | null)[]>();
    if (ids.length === 0) return result;
    const start = addKstDays(today, -13);
    const snaps = await this.snapshotRepository.find({
      where: { channelId: In(ids) },
    });
    const byChannel = new Map<string, Map<string, number>>();
    for (const snap of snaps) {
      let days = byChannel.get(snap.channelId);
      if (!days) {
        days = new Map();
        byChannel.set(snap.channelId, days);
      }
      days.set(snap.capturedOn, snap.memberCount);
    }
    for (const id of ids) {
      const days = byChannel.get(id);
      const series: (number | null)[] = [];
      for (let i = 0; i < 14; i += 1) {
        const date = addKstDays(start, i);
        series.push(days?.get(date) ?? null);
      }
      result.set(id, series);
    }
    return result;
  }

  private async requireActive(id: string): Promise<Channel> {
    const channel = await this.channelRepository.findOne({
      where: { id, status: ChannelStatus.ACTIVE },
    });
    if (!channel) {
      throw new NotFoundException('채널을 찾을 수 없습니다.');
    }
    return channel;
  }

}

function parseFeedCursor(
  raw: string | undefined,
): { at: number; id: string } | null {
  if (!raw?.trim()) return null;
  const sep = raw.lastIndexOf('::');
  if (sep <= 0) return null;
  const at = new Date(raw.slice(0, sep)).getTime();
  const id = raw.slice(sep + 2);
  if (!id || Number.isNaN(at)) return null;
  return { at, id };
}
