import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
  Optional,
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
import { dedupeByTitle, normalizeTitleKey } from './title-dedupe.logic';
import { FeedFilterService } from './feed-filter.service';
import { isAdPost } from './feed-filter.logic';
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
import { asText } from '../common/as-text';
import { isBannerLive } from '../ads/ad-banner.logic';
import { RankAd } from '../ads/rank-ad.entity';
import { composeAdSlots } from '../ads/rank-ad.logic';

const HOME_CACHE_MS = 3 * 60 * 1000;
/** 홈 피드에서 보는 최근 글 기간 */
const FEED_LOOKBACK_DAYS = 7;
type LatestFeedPost = {
  messageId: number;
  text: string | null;
  mediaType: string;
  views: number | null;
  postedAt: string;
};
/** 예전에 저장된 채널 알림 글(종류 표시 전) 거르기 */
const SERVICE_TEXT_RE =
  /^(channel (photo|name|title) (updated|changed|removed)|channel created|.{0,80} pinned( a| «| ")|.{0,80}(pinned|고정했습니다)|live stream (started|finished|scheduled)|video chat (started|ended))/i;
/** 순위 목록용 공개 채널 묶음. 요청마다 전체 표를 읽지 않게 잠깐 들고 있는다 */
const RANKING_POOL_MS = 60 * 1000;
/**
 * 순위 묶음이 읽는 칸. 노출 판정(수집·언어·불법 의심)·중복 대표 고르기·정렬·배지·목록 출력에 필요한 것만.
 * 70여 칸 전체를 1.5만 행 읽으면 메모리가 수백 MB 로 늘어난다.
 */
const RANKING_POOL_COLUMNS: (keyof Channel)[] = [
  'id',
  'title',
  'link',
  'linkType',
  'category',
  'description',
  'recommendCount',
  'status',
  'isPromoted',
  'submittedBy',
  'autoRegistered',
  'avatarUrl',
  'avatarApproved',
  'memberCount',
  'username',
  'firstObservedAt',
  'collectStatus',
  'language',
  'isVisible',
  'score',
  'grade',
  'viewRate',
  'growth24h',
  'growth7d',
  'growth30d',
  'memberDelta7d',
  'medianViews7d',
  'posts7d',
  'observedDays',
  'isVerified',
  'illegalCleared',
  'createdAt',
  'updatedAt',
];

const WEEKLY_EVENT_TYPES: ChannelEventType[] = [
  'title_changed',
  'username_changed',
  'first_seen',
  'rank_up',
];

export type ChannelSummary = {
  id: string;
  rank: number | null;
  rankTotal: number;
  score: number | null;
  grade: string | null;
  medianViews7d: number | null;
  viewRate: number | null;
  memberDelta7d: number | null;
  growth7d: number | null;
  posts7d: number | null;
  postsApprox: number | null;
  collectedPosts: number;
  photos: number;
  videos: number;
  mentions: number;
  observedDays: number | null;
  sparkline14: (number | null)[];
};

@Injectable()
export class PublicStatsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PublicStatsService.name);
  private homeCache: { expiresAt: number; data: unknown } | null = null;
  private rankingPool: {
    expiresAt: number;
    rows: Channel[];
    illegalIds: Set<string>;
  } | null = null;
  private rankingPoolLoading: Promise<{
    rows: Channel[];
    illegalIds: Set<string>;
  }> | null = null;
  private readonly feedCache = new Map<
    string,
    { expiresAt: number; data: unknown }
  >();

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
    @InjectRepository(RankAd)
    private readonly rankAdRepository: Repository<RankAd>,
    @Optional() private readonly feedFilter?: FeedFilterService,
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
      /** 수집 때 저장해 둔 글 앞부분(최대 200자). 채널 글만 (그룹은 위에서 빈 목록) */
      text: post.textExcerpt ?? null,
      username: username ?? null,
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
    this.rankAdCache.clear();
    this.summaryCache.clear();
    // 지우지 않고 "오래됨" 표시만: 다음 요청은 이전 결과를 바로 받고, 뒤에서 새로 계산한다
    if (this.homeCache) this.homeCache.expiresAt = 0;
    for (const entry of this.feedCache.values()) entry.expiresAt = 0;
    // 수집이 끝난 직후 등: 첫 화면은 바로 새로 계산해 둔다
    this.warmHomeCaches();
    this.rankingPool = null;
  }

  /**
   * 활성 채널 전체를 60초 동안 한 번만 읽는다. 동시에 여러 요청이 와도 읽기는 한 번.
   * 채널 1.5만 개에서 순위·카테고리 화면을 넘길 때마다 표 전체를 읽으면 무료 서버(512MB)가 버티지 못한다.
   * 돌려준 배열·행은 바꾸지 말 것 (필터·정렬은 새 배열로).
   */
  private async loadRankingPool(): Promise<{
    rows: Channel[];
    illegalIds: Set<string>;
  }> {
    const now = Date.now();
    if (this.rankingPool && this.rankingPool.expiresAt > now) {
      return this.rankingPool;
    }
    if (this.rankingPoolLoading) return this.rankingPoolLoading;
    this.rankingPoolLoading = this.channelRepository
      .find({
        where: { status: ChannelStatus.ACTIVE },
        select: RANKING_POOL_COLUMNS,
      })
      .then((rows) => {
        // 불법 의심 판정에만 쓰는 소개글은 판정 뒤 버려 메모리를 줄인다 (이 행들은 이 묶음 전용)
        const illegalIds = new Set<string>();
        for (const row of rows) {
          if (shouldHideIllegalSuspicion(row)) illegalIds.add(row.id);
          row.description = '';
        }
        const pool = {
          expiresAt: Date.now() + RANKING_POOL_MS,
          rows,
          illegalIds,
        };
        this.rankingPool = pool;
        return pool;
      })
      .finally(() => {
        this.rankingPoolLoading = null;
      });
    return this.rankingPoolLoading;
  }

  async getHome() {
    if (this.homeCache) {
      // 만료됐어도 이전 결과를 바로 주고, 새 계산은 뒤에서 한 번만 (첫 방문자가 3~4초 기다리지 않게)
      if (this.homeCache.expiresAt <= Date.now())
        this.refreshInBackground('home', () => this.computeHome());
      return this.homeCache.data;
    }
    return this.computeHome();
  }

  /** 같은 계산이 이미 돌고 있으면 또 시작하지 않는다 */
  private readonly refreshing = new Set<string>();
  private refreshInBackground(key: string, run: () => Promise<unknown>) {
    if (this.refreshing.has(key)) return;
    this.refreshing.add(key);
    void run()
      .catch((error: unknown) =>
        this.logger.warn(
          `캐시 새로고침 실패(${key}): ${error instanceof Error ? error.message : String(error)}`,
        ),
      )
      .finally(() => this.refreshing.delete(key));
  }

  onApplicationBootstrap() {
    // 서버가 막 켜졌을 때 첫 방문자가 기다리지 않게 (DB 연결이 자리 잡은 뒤)
    setTimeout(() => this.warmHomeCaches(), 10_000).unref?.();
  }

  /** 첫 화면 데이터를 미리 계산해 둔다 */
  warmHomeCaches() {
    this.refreshInBackground('home', () => this.computeHome());
    this.refreshInBackground('feed:channel::20', () =>
      this.computeFeed({ type: 'channel', limit: 20 }),
    );
  }

  private async computeHome() {
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
        username: ch.username ?? extractTelegramUsernameFromLink(ch.link),
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
    if (cached) {
      if (cached.expiresAt <= Date.now()) {
        this.refreshInBackground(cacheKey, () => this.computeFeed(query));
      }
      return cached.data;
    }
    return this.computeFeed(query);
  }

  private async computeFeed(query: HomeFeedQueryDto) {
    const type = query.type ?? 'channel';
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 50);
    const cacheKey = `feed:${type}:${query.cursor ?? ''}:${limit}`;

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
      // 피드는 최근 활동만 보면 되므로 최근 며칠 글만 훑는다 (게시글이 쌓여도 느려지지 않게)
      .where('post.posted_at >= :since', {
        since: new Date(Date.now() - FEED_LOOKBACK_DAYS * 86_400_000),
      })
      .groupBy('post.channel_id')
      .getRawMany<Record<string, unknown>>();
    const lastMap = new Map<string, Date>();
    for (const row of lastPosts) {
      const id = asText(row.channelId ?? row.channel_id);
      const rawAt = row.lastPostAt ?? row.last_post_at;
      const last = lastPostAtFromCollectedPosts([
        { postedAt: rawAt instanceof Date ? rawAt : asText(rawAt) },
      ]);
      if (id && last) lastMap.set(id, last);
    }

    const rows = channels
      .map((channel) => {
        if (channel.linkType === LinkType.GROUP) {
          if (channel.collectStatus !== 'ok' || !channel.lastCollectedAt) {
            return {
              channel,
              lastPostAt: null as Date | null,
              activityKind: 'members' as const,
            };
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
        const dt =
          (b.lastPostAt as Date).getTime() - (a.lastPostAt as Date).getTime();
        if (dt !== 0) return dt;
        return b.channel.id.localeCompare(a.channel.id);
      });

    // 이름이 같은 방은 최근 활동이 더 최근인 하나만
    const seenTitles = new Set<string>();
    const uniqueRows = rows.filter((row) => {
      const key = normalizeTitleKey(row.channel.title);
      if (!key) return true;
      if (seenTitles.has(key)) return false;
      seenTitles.add(key);
      return true;
    });
    rows.length = 0;
    rows.push(...uniqueRows);
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

    // 광고 거르기: 제외 카테고리는 빼고, 최근 글에 광고 단어가 여러 개면 뺀다 (모자라면 다음 줄에서 채움)
    const filter = await this.feedFilter?.get();
    const excluded = new Set(filter?.excludeCategories ?? []);
    const slice: typeof rows = [];
    const latestPosts = new Map<string, LatestFeedPost>();
    let lastScanned: (typeof rows)[number] | undefined;
    let i = start;
    while (slice.length < limit && i < rows.length) {
      const chunk = rows.slice(i, i + Math.max(limit * 2, 30));
      i += chunk.length;
      const posts = await this.latestPostsFor(
        chunk
          .filter((r) => r.channel.linkType === LinkType.CHANNEL)
          .map((r) => r.channel.id),
      );
      for (const row of chunk) {
        lastScanned = row;
        if (excluded.has(row.channel.category)) continue;
        const post = posts.get(row.channel.id);
        if (filter && post && isAdPost(post.text, filter)) continue;
        if (post) latestPosts.set(row.channel.id, post);
        slice.push(row);
        if (slice.length >= limit) break;
      }
    }
    const last = slice.length >= limit ? slice[slice.length - 1] : lastScanned;
    const nextCursor =
      slice.length >= limit && last?.lastPostAt
        ? `${last.lastPostAt.toISOString()}::${last.channel.id}`
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
        memberDelta7d: channel.memberDelta7d ?? null,
        grade: channel.grade,
        score: channel.score,
        lastPostAt: (lastPostAt as Date).toISOString(),
        activityKind,
        // 채널의 최근 글 하나 (앞부분 200자만 저장돼 있음, 그룹은 글을 저장하지 않음)
        latestPost: latestPosts.get(channel.id) ?? null,
      })),
      nextCursor,
    };
    this.feedCache.set(cacheKey, {
      expiresAt: Date.now() + HOME_CACHE_MS,
      data,
    });
    return data;
  }

  /** 채널마다 지워지지 않은 가장 최근 글 하나 */
  private async latestPostsFor(channelIds: string[]) {
    const map = new Map<
      string,
      {
        messageId: number;
        text: string | null;
        mediaType: string;
        views: number | null;
        postedAt: string;
      }
    >();
    if (channelIds.length === 0) return map;
    const posts = await this.postRepository
      .createQueryBuilder('post')
      .select([
        'post.channelId',
        'post.messageId',
        'post.textExcerpt',
        'post.mediaType',
        'post.views',
        'post.postedAt',
      ])
      .where('post.channelId IN (:...ids)', { ids: channelIds })
      .andWhere('post.deletedAt IS NULL')
      .andWhere('post.postedAt >= :since', {
        since: new Date(Date.now() - 30 * 86_400_000),
      })
      .orderBy('post.postedAt', 'DESC')
      .addOrderBy('post.messageId', 'DESC')
      .getMany();
    for (const post of posts) {
      if (map.has(post.channelId)) continue;
      // 고정·사진 변경 같은 "Service message"(글도 사진도 없는 알림)는 건너뛰고 그 전 글을 쓴다
      if (post.mediaType === 'service') continue;
      if (post.mediaType === 'text' && !post.textExcerpt?.trim()) continue;
      if (post.textExcerpt && SERVICE_TEXT_RE.test(post.textExcerpt.trim()))
        continue;
      map.set(post.channelId, {
        messageId: post.messageId,
        text: post.textExcerpt,
        mediaType: post.mediaType,
        views: post.views,
        postedAt: new Date(post.postedAt).toISOString(),
      });
    }
    return map;
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

  private rankAdCache = new Map<
    string,
    { expiresAt: number; data: unknown[] }
  >();

  private summaryCache = new Map<
    string,
    { at: number; value: ChannelSummary }
  >();

  /**
   * 목록 카드용 요약(검색·즐겨찾기). 순위·14일 추이·조회·글/사진/영상·언급 수.
   * 카드마다 상세를 부르지 않게 한 번에 최대 30개, 5분 캐시.
   */
  async channelSummaries(idsRaw: string): Promise<ChannelSummary[]> {
    const ids = parseCompareIds(idsRaw).slice(0, 30);
    if (ids.length === 0) return [];
    const now = Date.now();
    const fresh: ChannelSummary[] = [];
    const missing: string[] = [];
    for (const id of ids) {
      const hit = this.summaryCache.get(id);
      if (hit && now - hit.at < 5 * 60_000) fresh.push(hit.value);
      else missing.push(id);
    }
    if (missing.length > 0) {
      const built = await this.buildSummaries(missing);
      for (const item of built) {
        this.summaryCache.set(item.id, { at: now, value: item });
        fresh.push(item);
      }
      if (this.summaryCache.size > 5000) this.summaryCache.clear();
    }
    const order = new Map(ids.map((id, index) => [id, index]));
    return fresh.sort(
      (a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0),
    );
  }

  private async buildSummaries(ids: string[]): Promise<ChannelSummary[]> {
    const today = formatKstYmd();
    const pool = await this.loadRankingPool();
    const listable = (c: Channel) =>
      isPublicCollectable(c) &&
      !pool.illegalIds.has(c.id) &&
      isVisibleOnPublicLists(c) &&
      allowAdultInList(c.category) &&
      !isPendingCategory(c.category);
    const ranked = dedupeChannelsByLink([...pool.rows], { prefer: listable })
      .filter(listable)
      .sort((a, b) => this.compareRanking(a, b, 'score'));
    const rankById = new Map(ranked.map((c, index) => [c.id, index + 1]));
    const poolById = new Map(pool.rows.map((c) => [c.id, c]));
    const channels = ids
      .map((id) => poolById.get(id))
      .filter((c): c is Channel => Boolean(c));
    if (channels.length === 0) return [];

    const spark = await this.sparkline14(
      channels.map((c) => c.id),
      today,
    );
    const postRows = await this.postRepository
      .createQueryBuilder('post')
      .select('post.channel_id', 'channelId')
      .addSelect('COUNT(*)', 'total')
      .addSelect(
        "SUM(CASE WHEN post.media_type = 'photo' THEN 1 ELSE 0 END)",
        'photos',
      )
      .addSelect(
        "SUM(CASE WHEN post.media_type = 'video' THEN 1 ELSE 0 END)",
        'videos',
      )
      .addSelect('MAX(post.message_id)', 'maxMessageId')
      .where('post.channel_id IN (:...ids)', { ids: channels.map((c) => c.id) })
      .groupBy('post.channel_id')
      .getRawMany<Record<string, unknown>>();
    const postsById = new Map(
      postRows.map((row) => [
        asText(row.channelId),
        {
          collected: Number(row.total) || 0,
          photos: Number(row.photos) || 0,
          videos: Number(row.videos) || 0,
          maxMessageId: Number(row.maxMessageId) || null,
        },
      ]),
    );

    const result: ChannelSummary[] = [];
    for (const channel of channels) {
      const posts = postsById.get(channel.id);
      const handle = (channel.username ?? '').replace(/^@/, '').toLowerCase();
      let mentions = 0;
      if (handle.length >= 4) {
        const pattern = `%${handle}%`;
        const row = await this.postRepository
          .createQueryBuilder('post')
          .select('COUNT(DISTINCT post.channel_id)', 'count')
          .where('post.channel_id <> :id', { id: channel.id })
          .andWhere(
            '(LOWER(post.mentioned_usernames) LIKE :pattern OR LOWER(post.forwarded_from) LIKE :pattern)',
            { pattern },
          )
          .getRawOne<{ count: string | number }>();
        mentions = Number(row?.count) || 0;
      }
      result.push({
        id: channel.id,
        rank: rankById.get(channel.id) ?? null,
        rankTotal: ranked.length,
        score: channel.score,
        grade: channel.grade,
        medianViews7d: channel.medianViews7d,
        viewRate: channel.viewRate,
        memberDelta7d: channel.memberDelta7d ?? null,
        growth7d: channel.growth7d,
        posts7d: channel.posts7d,
        // 채널 글 번호는 1부터 늘어나므로 가장 큰 번호 ≈ 지금까지 올린 글 수(지운 글 포함, "약")
        postsApprox:
          channel.linkType === LinkType.GROUP
            ? null
            : (posts?.maxMessageId ?? null),
        collectedPosts: posts?.collected ?? 0,
        photos: posts?.photos ?? 0,
        videos: posts?.videos ?? 0,
        mentions,
        observedDays: channel.observedDays,
        sparkline14: spark.get(channel.id) ?? [],
      });
    }
    return result;
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
        memberDelta7d: detail.memberDelta7d,
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

    const pool = await this.loadRankingPool();
    let channels = [...pool.rows];
    const listable = (c: Channel) =>
      isPublicCollectable(c) &&
      !pool.illegalIds.has(c.id) &&
      (query.includeForeign || isVisibleOnPublicLists(c));
    // 같은 링크는 목록에 나올 수 있는 행을 먼저 대표로 고른다
    channels = dedupeChannelsByLink(channels, { prefer: listable }).filter(
      listable,
    );

    if (query.category && query.category !== 'all') {
      channels = channels.filter((c) => c.category === query.category);
    } else {
      channels = channels.filter(
        (c) => allowAdultInList(c.category) && !isPendingCategory(c.category),
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
        (c) => (c.memberCount ?? 0) >= RISING_MIN_MEMBERS && c.growth7d != null,
      );
    }

    channels.sort((a, b) => this.compareRanking(a, b, sort));
    // 이름이 같은 방(같은 방의 다른 주소 등)은 순위가 높은 하나만
    channels = dedupeByTitle(channels);
    const slice = sliceRankingPage(channels, query.offset, limit);

    return this.toRankingItems(slice, this.countByCategory(channels), today);
  }

  /** 순위 목록 한 줄 모양으로 바꾼다 (순위 목록·순위 광고 공용) */
  private async toRankingItems(
    slice: Channel[],
    categoryCounts: Map<string, number>,
    today: string,
  ) {
    const latestScores = await this.latestScoresByChannel(
      slice.map((c) => c.id),
    );
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
        memberDelta7d: channel.memberDelta7d ?? null,
        isVerified: Boolean(channel.isVerified),
        badges,
        sparkline14: sparkByChannel.get(channel.id) ?? [],
      };
    });
  }

  /**
   * 순위 광고: 이 목록(카테고리·채널/그룹)의 1~5위 자리에 넣을 광고.
   * 전체 광고는 모든 카테고리 목록에, 카테고리 광고는 그 카테고리 목록에만.
   * 30초 캐시. 목록에 나올 수 없는 방(숨김·불법 의심 등)은 빼고 보낸다.
   */
  async listRankAds(category?: string, type?: LinkType) {
    const key = `${category ?? 'all'}:${type ?? ''}`;
    const hit = this.rankAdCache.get(key);
    if (hit && hit.expiresAt > Date.now()) return hit.data;

    const now = new Date();
    const live = (
      await this.rankAdRepository.find({ where: { isActive: true } })
    ).filter((ad) => isBannerLive(ad, now));
    const isAll = !category || category === 'all';
    const globalAds = live.filter((ad) => ad.scope === 'global');
    const categoryAds = isAll
      ? []
      : live.filter(
          (ad) => ad.scope === 'category' && ad.category === category,
        );

    const pool = await this.loadRankingPool();
    const byId = new Map(pool.rows.map((c) => [c.id, c]));
    const usable = (ad: RankAd) => {
      const c = byId.get(ad.channelId);
      if (!c || pool.illegalIds.has(c.id) || !isPublicCollectable(c))
        return false;
      if (type && c.linkType !== type) return false;
      // 전체 목록에서는 성인·분류 대기 방을 넣지 않는다 (일반 목록 규칙과 같게)
      if (
        isAll &&
        (!allowAdultInList(c.category) || isPendingCategory(c.category))
      )
        return false;
      return true;
    };
    const slots = composeAdSlots(
      globalAds.filter(usable),
      categoryAds.filter(usable),
    );
    const ordered = [...slots.entries()].sort((a, b) => a[0] - b[0]);
    const channels = ordered.map(([, ad]) => byId.get(ad.channelId) as Channel);
    const items = await this.toRankingItems(
      channels,
      this.countByCategory(pool.rows),
      formatKstYmd(),
    );
    const data = ordered.map(([slot, ad], index) => ({
      adId: ad.id,
      slot,
      scope: ad.scope,
      channel: items[index],
    }));
    this.rankAdCache.set(key, { expiresAt: Date.now() + 30_000, data });
    return data;
  }

  async clickRankAd(id: string) {
    await this.rankAdRepository.increment({ id }, 'clicks', 1);
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
      createdOn: channel.createdOn
        ? new Date(channel.createdOn).toISOString()
        : null,
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
      memberDelta24h: channel.memberDelta24h ?? null,
      memberDelta7d: channel.memberDelta7d ?? null,
      memberDelta30d: channel.memberDelta30d ?? null,
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
      where: { channelId: In(ids), capturedOn: MoreThanOrEqual(start) },
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
