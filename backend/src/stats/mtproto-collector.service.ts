import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { TelegramAdminNotifyService } from '../common/telegram-admin-notify.service';
import { Channel, LinkType } from '../channels/channel.entity';
import { clipPostExcerpt } from '../channels/channel-language.logic';
import {
  applyCollectedTitle,
  isTitleLocked,
} from '../channels/title-lock.logic';
import {
  extractTelegramUsernameFromLink,
  isInviteOnlyLink,
} from '../channels/telegram-username';
import { formatKstYmd } from './channel-metrics.math';
import { ChannelEvent } from './channel-event.entity';
import { ChannelPost, type ChannelPostMediaType } from './channel-post.entity';
import { ChannelSnapshot } from './channel-snapshot.entity';
import {
  activityInWindow,
  assertMtprotoMethodAllowed,
  canSpendMtprotoRequest,
  deletedMessageIds,
  FloodWaitTooLongError,
  isMtprotoTimeoutError,
  MTPROTO_CONNECT_TIMEOUT_MS,
  MTPROTO_REQUEST_TIMEOUT_MS,
  MTPROTO_TIMEOUT_STREAK_DISABLE,
  nextTimeoutStreak,
  shouldDisableMtprotoAfterTimeouts,
  firstHistoryMessageId,
  firstHistoryMessagePostedAtMs,
  GROUP_ACTIVITY_DAY_MS,
  GROUP_ACTIVITY_WEEK_MS,
  isMtprotoAuthFatal,
  MTPROTO_DEFAULT_DAILY_LIMIT,
  MTPROTO_EXCERPT_MAX,
  MTPROTO_HISTORY_LIMIT,
  mtprotoErrorCode,
  retryAfterFloodWait,
  shouldSaveMtprotoPosts,
  withTimeout,
  summarizeGroupHistory,
  unixSecondsAgo,
  unixSecondsToDate,
  type GroupActivityCounts,
  type GroupHistorySummary,
} from './mtproto-collect.logic';
import {
  canReuseStoredAccess,
  canSpendResolve,
  floodWaitUntilFromSeconds,
  isFloodWaitBlocking,
  isResolveOrSearchMethod,
  isStoredAccessInvalid,
  mtprotoCallGapMs,
  RESOLVE_DAILY_LIMIT_DEFAULT,
  serializeAccessHash,
} from './mtproto-access.logic';
import {
  envPositiveInt,
  KEYWORD_SEARCH_DEFAULT_DAILY_LIMIT,
} from './mtproto-budget.logic';
import {
  publicUsernamesFromContactsSearch,
  type PublicSearchHit,
} from './mtproto-search.logic';
import { nextCollectAtAfterSuccess } from './collect-queue.logic';
import { DiscoveredUsername } from './discovered-username.entity';
import {
  matchGroupByTitle,
  normalizeTelegramChatId,
  parseLinkedChat,
  pickChatById,
  telegramChatIdVariants,
  type LinkedChatInfo,
} from './linked-chat.logic';
import { MtprotoState } from './mtproto-state.entity';
import {
  extractTmeUsernamesFromHtml,
  joinMentionedUsernames,
} from './telegram-preview-html';
import { asText } from '../common/as-text';

export type MtprotoPublicStatus = {
  enabled: boolean;
  requestsToday: number;
  resolvesToday: number;
  searchesToday: number;
  lastError: string | null;
};

export type MtprotoCollectResult =
  | { ok: true; mode: 'mtproto' }
  | { ok: false; reason: 'disabled' | 'skipped' | 'failed' | 'invalid' };

export type MtprotoTestSummary = {
  ok: boolean;
  reason?: string;
  username?: string;
  memberCount?: number | null;
  createdOn?: string | null;
  recentPosts?: number;
  avgViews?: number | null;
  forwardedPosts?: number;
  editedPosts?: number;
  activity24h?: number;
  activity7d?: number;
};

type ResolvedPublicChannel = {
  username: string;
  title: string | null;
  description: string | null;
  memberCount: number | null;
  createdOn: Date | null;
  telegramChatId: number | null;
  linkType: LinkType;
  inputChannel: { channelId: unknown; accessHash: unknown };
  /** 채널이면 연결된 대화방, 그룹이면 부모 채널. 없으면 null */
  linkedChat: LinkedChatInfo | null;
};

type HistoryPost = {
  messageId: number;
  postedAt: Date;
  views: number | null;
  forwards: number | null;
  mediaType: ChannelPostMediaType;
  forwardedFrom: string | null;
  isEdited: boolean;
  mentionedUsernames: string[];
  textExcerpt: string | null;
};

@Injectable()
export class MtprotoCollectorService implements OnModuleInit {
  private readonly logger = new Logger(MtprotoCollectorService.name);
  private client: import('telegram').TelegramClient | null = null;
  private stopped = false;
  private lastError: string | null = null;
  private requestsToday = 0;
  private requestDay = '';
  private lastCallAt = 0;
  private connecting: Promise<boolean> | null = null;
  private timeoutStreak = 0;
  private lastResolveOrSearchAt = 0;
  private resolvesToday = 0;
  private searchesToday = 0;
  private floodWaitUntil: Date | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly adminNotify: TelegramAdminNotifyService,
    @InjectRepository(Channel)
    private readonly channelRepository: Repository<Channel>,
    @InjectRepository(ChannelPost)
    private readonly postRepository: Repository<ChannelPost>,
    @InjectRepository(ChannelSnapshot)
    private readonly snapshotRepository: Repository<ChannelSnapshot>,
    @InjectRepository(ChannelEvent)
    private readonly eventRepository: Repository<ChannelEvent>,
    @InjectRepository(MtprotoState)
    private readonly stateRepository: Repository<MtprotoState>,
    @InjectRepository(DiscoveredUsername)
    private readonly discoveredRepository: Repository<DiscoveredUsername>,
  ) {}

  async onModuleInit() {
    await this.refreshFloodWaitFromDb();
    if (isFloodWaitBlocking(this.floodWaitUntil)) {
      this.stopped = true;
      this.lastError = this.lastError ?? 'flood_wait';
    }
  }

  isEnabled(): boolean {
    const raw = (this.configService.get<string>('MTPROTO_ENABLED') ?? '')
      .trim()
      .toLowerCase();
    return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
  }

  getPublicStatus(): MtprotoPublicStatus {
    this.rollDailyCounter();
    return {
      enabled: this.canUseMtproto(),
      requestsToday: this.requestsToday,
      resolvesToday: this.resolvesToday,
      searchesToday: this.searchesToday,
      lastError: this.lastError,
    };
  }

  canUseMtproto(): boolean {
    return (
      this.isEnabled() &&
      !this.stopped &&
      !isFloodWaitBlocking(this.floodWaitUntil)
    );
  }

  remainingRequests(): number {
    this.rollDailyCounter();
    if (!this.canUseMtproto()) return 0;
    return Math.max(0, this.dailyLimit() - this.requestsToday);
  }

  remainingResolves(): number {
    this.rollDailyCounter();
    if (!this.canUseMtproto()) return 0;
    return Math.max(0, this.resolveDailyLimit() - this.resolvesToday);
  }

  remainingSearches(): number {
    this.rollDailyCounter();
    if (!this.canUseMtproto()) return 0;
    return Math.max(0, this.searchDailyLimit() - this.searchesToday);
  }

  /** full 파이프라인 시작 때 호출. 인증 오류·일일 상한·진행 중 FloodWait 은 유지 */
  async prepareForCollectRun() {
    this.timeoutStreak = 0;
    await this.refreshFloodWaitFromDb();
    if (isFloodWaitBlocking(this.floodWaitUntil)) {
      this.stopped = true;
      if (!(this.lastError ?? '').startsWith('flood_wait')) {
        this.lastError = 'flood_wait';
      }
      this.logger.warn(
        'FloodWait가 끝나기 전이라 MTProto를 건너뛰고 t.me 로 수집합니다.',
      );
      return;
    }
    if (
      this.stopped &&
      (this.lastError === 'timeout:mtproto_streak' ||
        (this.lastError ?? '').startsWith('flood_wait'))
    ) {
      this.stopped = false;
      this.lastError = null;
    }
  }

  canCollect(channel: Channel): boolean {
    if (!this.canUseMtproto()) return false;
    if (isInviteOnlyLink(channel.link)) return false;
    if (channel.collectStatus === 'invite_expired') return false;
    return Boolean(this.resolveUsername(channel));
  }

  async collectAndSave(channel: Channel): Promise<MtprotoCollectResult> {
    if (!this.canUseMtproto()) {
      return { ok: false, reason: 'disabled' };
    }
    if (!this.canCollect(channel)) {
      return { ok: false, reason: 'skipped' };
    }
    const username = this.resolveUsername(channel);
    if (!username) return { ok: false, reason: 'skipped' };

    try {
      const stored = await this.loadStoredAccess(channel.id);
      const data = await this.readPublicChannel(username, stored, channel.id);
      await this.persist(channel, data);
      return { ok: true, mode: 'mtproto' };
    } catch (error) {
      if (error instanceof FloodWaitTooLongError) {
        return { ok: false, reason: 'disabled' };
      }
      if (isMtprotoTimeoutError(error)) {
        return { ok: false, reason: 'failed' };
      }
      if (isMtprotoAuthFatal(error)) {
        await this.stopForAuth(error);
        return { ok: false, reason: 'failed' };
      }
      const code = mtprotoErrorCode(error);
      if (code === 'RESOLVE_DAILY_LIMIT') {
        return { ok: false, reason: 'skipped' };
      }
      this.lastError = code;
      if (
        code === 'USERNAME_NOT_OCCUPIED' ||
        code === 'USERNAME_INVALID' ||
        code === 'CHANNEL_INVALID'
      ) {
        return { ok: false, reason: 'invalid' };
      }
      this.logger.warn(`MTProto 수집 실패(${username}): ${code}`);
      return { ok: false, reason: 'failed' };
    }
  }

  /** ResolveUsername + GetFullChannel 만. 게시글·가입은 하지 않습니다. */
  async inspectPublicUsername(usernameRaw: string): Promise<{
    username: string;
    title: string | null;
    description: string | null;
    memberCount: number | null;
    linkType: LinkType;
    kind: 'channel' | 'group';
  } | null> {
    if (!this.canUseMtproto()) return null;
    if (this.remainingResolves() < 1) return null;
    const username = usernameRaw.replace(/^@/, '').trim().toLowerCase();
    if (!username) return null;
    try {
      const resolved = await this.resolvePublicChannel(username, null, null);
      const kind = resolved.linkType === LinkType.GROUP ? 'group' : 'channel';
      return {
        username: resolved.username,
        title: resolved.title,
        description: resolved.description,
        memberCount: resolved.memberCount,
        linkType: resolved.linkType,
        kind,
      };
    } catch (error) {
      const code = mtprotoErrorCode(error);
      if (code === 'RESOLVE_DAILY_LIMIT') return null;
      if (isMtprotoAuthFatal(error)) {
        await this.stopForAuth(error);
      } else {
        this.lastError = code;
      }
      return null;
    }
  }

  /** contacts.Search. 사용자 계정은 파서에서 버립니다. 가입하지 않습니다. */
  async searchPublicByKeyword(query: string): Promise<PublicSearchHit[]> {
    if (!this.canUseMtproto()) return [];
    if (this.remainingSearches() < 1) return [];
    const q = query.trim();
    if (!q) return [];
    try {
      const Api = await this.api();
      const result = await this.call(
        'contacts.Search',
        new Api.contacts.Search({ q, limit: 20 }),
      );
      return publicUsernamesFromContactsSearch(
        result as { chats?: unknown[]; users?: unknown[] },
      );
    } catch (error) {
      const code = mtprotoErrorCode(error);
      if (code === 'SEARCH_DAILY_LIMIT') return [];
      if (isMtprotoAuthFatal(error)) {
        await this.stopForAuth(error);
      } else {
        this.lastError = code;
      }
      return [];
    }
  }

  async testPublicUsername(usernameRaw: string): Promise<MtprotoTestSummary> {
    if (!this.canUseMtproto()) {
      return { ok: false, reason: 'disabled' };
    }
    const username = usernameRaw.replace(/^@/, '').trim().toLowerCase();
    if (!username) return { ok: false, reason: 'invalid' };
    try {
      const data = await this.readPublicChannel(username, null, null);
      if (data.linkType === LinkType.GROUP) {
        return {
          ok: true,
          username,
          memberCount: data.memberCount,
          createdOn: data.createdOn?.toISOString() ?? null,
          recentPosts: 0,
          avgViews: null,
          forwardedPosts: 0,
          editedPosts: 0,
          activity24h: data.activity.activity24h,
          activity7d: data.activity.activity7d,
        };
      }
      const views = data.posts
        .map((p) => p.views)
        .filter((v): v is number => v != null);
      const avgViews =
        views.length > 0
          ? Math.round(views.reduce((a, b) => a + b, 0) / views.length)
          : null;
      return {
        ok: true,
        username,
        memberCount: data.memberCount,
        createdOn: data.createdOn?.toISOString() ?? null,
        recentPosts: data.posts.length,
        avgViews,
        forwardedPosts: data.posts.filter((p) => Boolean(p.forwardedFrom))
          .length,
        editedPosts: data.posts.filter((p) => p.isEdited).length,
      };
    } catch (error) {
      if (isMtprotoAuthFatal(error)) {
        await this.stopForAuth(error);
      }
      return { ok: false, reason: mtprotoErrorCode(error) };
    }
  }

  private async readPublicChannel(
    username: string,
    stored: {
      telegramChatId: number | null;
      telegramAccessHash: string | null;
    } | null,
    channelId: string | null,
  ): Promise<{
    username: string;
    title: string | null;
    description: string | null;
    memberCount: number | null;
    createdOn: Date | null;
    telegramChatId: number | null;
    inputChannel: { channelId: unknown; accessHash: unknown };
    linkType: LinkType;
    linkedChat: LinkedChatInfo | null;
    posts: HistoryPost[];
    activity: GroupActivityCounts;
    groupLanguage?: GroupHistorySummary['language'];
    hangulRatio?: number | null;
  }> {
    const resolved = await this.resolvePublicChannel(
      username,
      stored,
      channelId,
    );
    const history = await this.fetchHistory(resolved);
    return { ...resolved, ...history };
  }

  private async resolvePublicChannel(
    username: string,
    stored: {
      telegramChatId: number | null;
      telegramAccessHash: string | null;
    } | null,
    channelId: string | null,
  ): Promise<ResolvedPublicChannel> {
    const Api = await this.api();
    if (stored && canReuseStoredAccess(stored)) {
      try {
        return await this.fetchFullFromInput(
          Api,
          username,
          stored.telegramChatId,
          stored.telegramAccessHash,
        );
      } catch (error) {
        const code = mtprotoErrorCode(error);
        if (!isStoredAccessInvalid(code)) throw error;
        if (channelId) {
          await this.channelRepository.update(channelId, {
            telegramAccessHash: null,
          });
        }
      }
    }
    if (!canSpendResolve(this.resolvesToday, this.resolveDailyLimit())) {
      throw new Error('RESOLVE_DAILY_LIMIT');
    }
    const result = (await this.call(
      'contacts.ResolveUsername',
      new Api.contacts.ResolveUsername({ username }),
    )) as {
      peer?: { className?: string; channelId?: unknown };
      chats?: Array<{
        className?: string;
        id?: unknown;
        title?: string;
        accessHash?: unknown;
        date?: number;
        megagroup?: boolean;
        broadcast?: boolean;
      }>;
    };

    const peer = result.peer;
    if (!peer || peer.className === 'PeerUser' || peer.channelId == null) {
      throw new Error('USERNAME_INVALID');
    }

    const chat = (result.chats ?? []).find(
      (item) => String(item.id) === String(peer.channelId),
    );
    if (!chat || chat.accessHash == null) {
      throw new Error('CHANNEL_INVALID');
    }

    return this.fetchFullFromInput(Api, username, chat.id, chat.accessHash, {
      title: chat.title,
      date: chat.date,
      megagroup: chat.megagroup,
      broadcast: chat.broadcast,
    });
  }

  private async fetchFullFromInput(
    Api: typeof import('telegram').Api,
    username: string,
    channelId: unknown,
    accessHash: unknown,
    hints?: {
      title?: string;
      date?: number;
      megagroup?: boolean;
      broadcast?: boolean;
    },
  ): Promise<ResolvedPublicChannel> {
    const hash = serializeAccessHash(accessHash);
    if (hash == null) throw new Error('CHANNEL_INVALID');
    const full = (await this.call(
      'channels.GetFullChannel',
      new Api.channels.GetFullChannel({
        channel: new Api.InputChannel({
          channelId: channelId as never,
          accessHash: BigInt(hash) as never,
        }),
      }),
    )) as {
      fullChat?: {
        about?: string;
        participantsCount?: number;
        linkedChatId?: unknown;
      };
      chats?: Array<{
        id?: unknown;
        date?: number;
        title?: string;
        username?: string | null;
        megagroup?: boolean;
        broadcast?: boolean;
      }>;
    };
    // chats[] 에는 연결된 대화방도 같이 온다. 순서에 기대지 말고 id 로 고른다
    const chat = pickChatById(full.chats, channelId);
    const isGroup =
      Boolean(hints?.megagroup ?? chat?.megagroup) &&
      !(hints?.broadcast ?? chat?.broadcast);
    return {
      username,
      title: hints?.title?.trim() || chat?.title?.trim() || null,
      description: full.fullChat?.about?.trim() || null,
      memberCount:
        typeof full.fullChat?.participantsCount === 'number'
          ? full.fullChat.participantsCount
          : null,
      createdOn: unixSecondsToDate(hints?.date ?? chat?.date),
      telegramChatId: Number(channelId),
      linkType: isGroup ? LinkType.GROUP : LinkType.CHANNEL,
      inputChannel: { channelId, accessHash: hash },
      linkedChat: parseLinkedChat(full),
    };
  }

  private async fetchHistory(resolved: ResolvedPublicChannel): Promise<{
    posts: HistoryPost[];
    activity: GroupActivityCounts;
    groupLanguage?: GroupHistorySummary['language'];
    hangulRatio?: number | null;
  }> {
    if (resolved.linkType === LinkType.GROUP) {
      const nowMs = Date.now();
      const latest = await this.getHistory(resolved, 1, 0);
      const latestId = firstHistoryMessageId(latest);
      const latestPostedAtMs = firstHistoryMessagePostedAtMs(latest);
      const dayAgo = await this.getHistory(
        resolved,
        1,
        unixSecondsAgo(GROUP_ACTIVITY_DAY_MS, nowMs),
      );
      const weekAgo = await this.getHistory(
        resolved,
        1,
        unixSecondsAgo(GROUP_ACTIVITY_WEEK_MS, nowMs),
      );
      const recent = await this.getHistory(resolved, MTPROTO_HISTORY_LIMIT, 0);
      const summary = summarizeGroupHistory(recent, {
        title: resolved.title,
        description: resolved.description,
        nowMs,
      });
      return {
        posts: [],
        activity: {
          activity24h: activityInWindow({
            latestId,
            latestPostedAtMs,
            baselineId: firstHistoryMessageId(dayAgo),
            windowMs: GROUP_ACTIVITY_DAY_MS,
            nowMs,
          }),
          activity7d: activityInWindow({
            latestId,
            latestPostedAtMs,
            baselineId: firstHistoryMessageId(weekAgo),
            windowMs: GROUP_ACTIVITY_WEEK_MS,
            nowMs,
          }),
        },
        groupLanguage: summary.language,
        hangulRatio: summary.hangulRatio,
      };
    }

    const messages = await this.getHistory(resolved, MTPROTO_HISTORY_LIMIT, 0);
    const posts: HistoryPost[] = [];
    for (const raw of messages) {
      const parsed = this.parseHistoryMessage(raw, resolved.username);
      if (parsed) posts.push(parsed);
    }
    return { posts, activity: { activity24h: 0, activity7d: 0 } };
  }

  private async getHistory(
    resolved: ResolvedPublicChannel,
    limit: number,
    offsetDate: number,
  ): Promise<unknown[]> {
    const Api = await this.api();
    const hash = serializeAccessHash(resolved.inputChannel.accessHash);
    if (hash == null) throw new Error('CHANNEL_INVALID');
    const result = (await this.call(
      'messages.GetHistory',
      new Api.messages.GetHistory({
        peer: new Api.InputPeerChannel({
          channelId: resolved.inputChannel.channelId as never,
          accessHash: BigInt(hash) as never,
        }),
        offsetId: 0,
        offsetDate,
        addOffset: 0,
        limit,
        maxId: 0,
        minId: 0,
        hash: 0 as never,
      }),
    )) as { messages?: unknown[] };
    return result.messages ?? [];
  }

  private parseHistoryMessage(
    raw: unknown,
    selfUsername: string,
  ): HistoryPost | null {
    if (!raw || typeof raw !== 'object') return null;
    const msg = raw as {
      className?: string;
      id?: number;
      date?: number;
      views?: number;
      forwards?: number;
      editDate?: number;
      message?: string;
      media?: { className?: string };
      fwdFrom?: {
        fromId?: { className?: string; channelId?: unknown };
        fromName?: string;
      };
    };
    if (msg.className && msg.className !== 'Message') return null;
    if (typeof msg.id !== 'number' || msg.id <= 0) return null;
    const postedAt = unixSecondsToDate(msg.date);
    if (!postedAt) return null;

    const text = typeof msg.message === 'string' ? msg.message : '';
    return {
      messageId: msg.id,
      postedAt,
      views: typeof msg.views === 'number' ? msg.views : null,
      forwards: typeof msg.forwards === 'number' ? msg.forwards : null,
      mediaType: this.mediaType(msg.media?.className),
      forwardedFrom: this.forwardSource(msg.fwdFrom),
      isEdited: typeof msg.editDate === 'number' && msg.editDate > 0,
      mentionedUsernames: extractTmeUsernamesFromHtml(text, selfUsername),
      textExcerpt: clipPostExcerpt(text, MTPROTO_EXCERPT_MAX),
    };
  }

  private forwardSource(
    fwdFrom:
      | {
          fromId?: { className?: string; channelId?: unknown };
          fromName?: string;
        }
      | undefined,
  ): string | null {
    if (!fwdFrom?.fromId) return null;
    if (fwdFrom.fromId.className === 'PeerChannel') {
      return fwdFrom.fromId.channelId != null
        ? `channel:${asText(fwdFrom.fromId.channelId)}`
        : 'channel';
    }
    return null;
  }

  private mediaType(className?: string): ChannelPostMediaType {
    const name = (className ?? '').toLowerCase();
    if (name.includes('photo')) return 'photo';
    if (name.includes('video')) return 'video';
    if (name.includes('document')) return 'file';
    if (!name || name.includes('empty')) return 'text';
    return 'other';
  }

  private async persist(
    channel: Channel,
    data: {
      username: string;
      title: string | null;
      description: string | null;
      memberCount: number | null;
      createdOn: Date | null;
      telegramChatId: number | null;
      inputChannel: { channelId: unknown; accessHash: unknown };
      linkType: LinkType;
      linkedChat?: LinkedChatInfo | null;
      posts: HistoryPost[];
      activity: GroupActivityCounts;
      groupLanguage?: GroupHistorySummary['language'];
      hangulRatio?: number | null;
    },
  ) {
    const now = new Date();
    const savePosts = shouldSaveMtprotoPosts(data.linkType);
    if (!savePosts) {
      await this.postRepository.delete({ channelId: channel.id });
    }
    const fetchedIds = savePosts ? data.posts.map((p) => p.messageId) : [];
    if (fetchedIds.length > 0) {
      const min = Math.min(...fetchedIds);
      const existing = await this.postRepository.find({
        where: { channelId: channel.id, deletedAt: IsNull() },
        select: ['messageId'],
      });
      const missing = deletedMessageIds(
        existing.map((row) => row.messageId),
        fetchedIds,
      ).filter((id) => id >= min);
      if (missing.length > 0) {
        await this.postRepository.update(
          { channelId: channel.id, messageId: In(missing) },
          { deletedAt: now },
        );
      }
    }

    if (savePosts && data.posts.length > 0) {
      const previous = await this.postRepository.find({
        where: {
          channelId: channel.id,
          messageId: In(data.posts.map((p) => p.messageId)),
        },
      });
      const prevMap = new Map(previous.map((row) => [row.messageId, row]));
      await this.postRepository.upsert(
        data.posts.map((post) => {
          const old = prevMap.get(post.messageId);
          const edited = post.isEdited || Boolean(old?.isEdited);
          return {
            channelId: channel.id,
            messageId: post.messageId,
            postedAt: post.postedAt,
            views: post.views,
            mediaType: post.mediaType,
            forwardedFrom: post.forwardedFrom,
            mentionedUsernames: joinMentionedUsernames(post.mentionedUsernames),
            textExcerpt: post.textExcerpt,
            isEdited: edited,
            lastSeenAt: now,
            deletedAt: null,
          };
        }),
        ['channelId', 'messageId'],
      );
    }

    const wasGone = channel.collectStatus === 'gone';
    const isFirst = channel.firstObservedAt == null;
    const nextTitle = data.title?.trim() || null;
    if (isFirst) {
      channel.firstObservedAt = now;
      await this.eventRepository.save({
        channelId: channel.id,
        type: 'first_seen',
        before: null,
        after: nextTitle ?? data.username,
        occurredAt: now,
      });
    } else if (
      nextTitle &&
      nextTitle !== channel.title &&
      !isTitleLocked(channel)
    ) {
      await this.eventRepository.save({
        channelId: channel.id,
        type: 'title_changed',
        before: channel.title,
        after: nextTitle,
        occurredAt: now,
      });
    }
    if (wasGone) {
      await this.eventRepository.save({
        channelId: channel.id,
        type: 'returned',
        before: 'gone',
        after: 'ok',
        occurredAt: now,
      });
    }
    // 제목 고정이면 수집 제목으로 덮어쓰지 않는다(소개글은 계속 갱신)
    applyCollectedTitle(channel, nextTitle);
    channel.username = data.username;
    if (data.memberCount != null) channel.memberCount = data.memberCount;
    if (data.description) channel.description = data.description;
    if (data.telegramChatId != null)
      channel.telegramChatId = data.telegramChatId;
    const accessHash = serializeAccessHash(data.inputChannel.accessHash);
    if (accessHash) channel.telegramAccessHash = accessHash;
    if (data.createdOn) channel.createdOn = data.createdOn;
    if (channel.linkType !== data.linkType) {
      await this.eventRepository.save({
        channelId: channel.id,
        type: 'type_corrected',
        before: channel.linkType,
        after: data.linkType,
        occurredAt: now,
      });
      channel.linkType = data.linkType;
    }
    channel.lastCollectedAt = now;
    channel.collectStatus = 'ok';
    channel.collectError = null;
    channel.collectFailCount = 0;
    channel.collectGoneCount = 0;
    if (!savePosts) {
      channel.posts7d = data.activity.activity7d;
      if (!channel.languageLocked) {
        if (data.groupLanguage) channel.language = data.groupLanguage;
        channel.languageHangulRatio =
          data.hangulRatio === undefined
            ? channel.languageHangulRatio
            : data.hangulRatio;
      }
    }
    // MTProto 는 정확한 회원 수를 주므로 그대로 저장했다. 다음 수집 시각을 목표 간격만큼 뒤로 민다
    channel.nextCollectAt = nextCollectAtAfterSuccess(channel, now);
    if (data.linkedChat !== undefined) {
      const linked = data.linkedChat;
      channel.linkedChatTelegramId = linked?.telegramChatId ?? null;
      channel.linkedChatTitle = linked?.title ?? null;
      channel.linkedChatUsername = linked?.username ?? null;
      channel.linkedChatCreatedOn = linked?.createdOn ?? null;
    }
    await this.channelRepository.save(channel);
    if (data.linkedChat) {
      try {
        await this.reconcileLinkedChat(channel, data.linkedChat);
      } catch (error) {
        this.logger.warn(
          `연결 대화방 연결 실패(${channel.id}): ${error instanceof Error ? error.message : error}`,
        );
      }
    }

    const isGroup = !savePosts;
    if (data.memberCount != null || isGroup) {
      await this.snapshotRepository.upsert(
        {
          channelId: channel.id,
          capturedOn: formatKstYmd(),
          memberCount: data.memberCount ?? channel.memberCount ?? 0,
          medianViews7d: 0,
          posts7d: isGroup ? data.activity.activity7d : 0,
          forwardedRatio: 0,
          activity24h: isGroup ? data.activity.activity24h : 0,
          activity7d: isGroup ? data.activity.activity7d : 0,
        },
        ['channelId', 'capturedOn'],
      );
    }
  }

  /**
   * 채널(또는 그룹)을 MTProto 로 읽었을 때 나온 연결 상대를 우리 DB 행과 서로 잇는다.
   * MTProto 요청을 더 쓰지 않는다. 그룹에 가입하지 않는다.
   * 1) telegram_chat_id 로 같은 행  2) 공개 아이디로 같은 행
   * 3) (채널 → 비공개 대화방) 초대 링크로만 등록된 그룹 중 제목이 똑같은 것이 딱 하나면 그 행
   * 못 찾았고 공개 아이디가 있으면 발견 대기열에 넣는다.
   */
  private async reconcileLinkedChat(channel: Channel, linked: LinkedChatInfo) {
    const selfId = normalizeTelegramChatId(channel.telegramChatId);
    let other = await this.channelRepository
      .createQueryBuilder('c')
      .where('c.id <> :self', { self: channel.id })
      .andWhere('c.telegramChatId IN (:...ids)', {
        ids: telegramChatIdVariants(linked.telegramChatId),
      })
      .getOne();
    if (!other && linked.username) {
      other = await this.channelRepository
        .createQueryBuilder('c')
        .where('c.id <> :self', { self: channel.id })
        .andWhere('LOWER(c.username) = :username', {
          username: linked.username,
        })
        .getOne();
    }
    if (
      !other &&
      !linked.username &&
      linked.isGroup &&
      channel.linkType === LinkType.CHANNEL
    ) {
      const candidates = await this.channelRepository
        .createQueryBuilder('c')
        .select(['c.id', 'c.title', 'c.link'])
        .where('c.linkType = :group', { group: LinkType.GROUP })
        .andWhere('c.telegramChatId IS NULL')
        .andWhere('(c.link LIKE :plus OR c.link LIKE :joinchat)', {
          plus: '%/+%',
          joinchat: '%/joinchat/%',
        })
        .getMany();
      const hit = matchGroupByTitle(candidates, linked.title);
      if (hit) {
        other = await this.channelRepository.findOneBy({ id: hit.id });
      }
    }

    if (other) {
      const patch: Partial<Channel> = {};
      if (normalizeTelegramChatId(other.telegramChatId) == null) {
        patch.telegramChatId = linked.telegramChatId;
      }
      if (selfId != null) {
        patch.linkedChatTelegramId = selfId;
        patch.linkedChatTitle = channel.title ?? null;
        patch.linkedChatUsername = channel.username?.toLowerCase() ?? null;
        patch.linkedChatCreatedOn = channel.createdOn ?? null;
      }
      if (!other.createdOn && linked.createdOn) {
        patch.createdOn = linked.createdOn;
      }
      if (Object.keys(patch).length > 0) {
        await this.channelRepository.update(other.id, patch);
      }
      return;
    }

    if (linked.username) {
      const exists = await this.discoveredRepository.findOneBy({
        username: linked.username,
      });
      if (!exists) {
        await this.discoveredRepository.save({
          username: linked.username,
          result: 'queued',
          checkedAt: new Date(),
          mentionCount: 1,
          source: 'linked',
        });
      }
    }
  }

  private async call(method: string, request: object): Promise<unknown> {
    assertMtprotoMethodAllowed(method);
    this.rollDailyCounter();
    if (isFloodWaitBlocking(this.floodWaitUntil)) {
      throw new Error('flood_wait');
    }
    const limit = this.dailyLimit();
    if (!canSpendMtprotoRequest(this.requestsToday, limit)) {
      this.lastError = 'daily_limit';
      this.stopped = true;
      throw new Error('MTPROTO_DAILY_LIMIT');
    }
    if (
      method === 'contacts.ResolveUsername' &&
      !canSpendResolve(this.resolvesToday, this.resolveDailyLimit())
    ) {
      throw new Error('RESOLVE_DAILY_LIMIT');
    }
    if (
      method === 'contacts.Search' &&
      this.searchesToday >= this.searchDailyLimit()
    ) {
      throw new Error('SEARCH_DAILY_LIMIT');
    }
    const client = await this.ensureClient();
    const wait = mtprotoCallGapMs({
      method,
      lastCallAt: this.lastCallAt,
      lastResolveOrSearchAt: this.lastResolveOrSearchAt,
    });
    if (wait > 0) await sleep(wait);
    this.lastCallAt = Date.now();
    this.requestsToday += 1;
    if (isResolveOrSearchMethod(method)) {
      this.lastResolveOrSearchAt = this.lastCallAt;
      if (method === 'contacts.ResolveUsername') this.resolvesToday += 1;
      if (method === 'contacts.Search') this.searchesToday += 1;
    }

    try {
      const result = await retryAfterFloodWait(
        async () =>
          withTimeout(
            client.invoke(request as never) as Promise<unknown>,
            MTPROTO_REQUEST_TIMEOUT_MS,
            'timeout:mtproto',
          ),
        sleep,
        {
          onWait: (seconds) => {
            this.logger.warn(`FloodWait ${seconds}초 대기`);
          },
        },
      );
      this.timeoutStreak = nextTimeoutStreak(this.timeoutStreak, false);
      return result;
    } catch (error) {
      if (error instanceof FloodWaitTooLongError) {
        await this.persistFloodWait(error.seconds);
        throw error;
      }
      if (isMtprotoTimeoutError(error)) {
        this.noteRequestTimeout();
        throw error;
      }
      this.timeoutStreak = nextTimeoutStreak(this.timeoutStreak, false);
      throw error;
    }
  }

  private noteRequestTimeout() {
    this.timeoutStreak = nextTimeoutStreak(this.timeoutStreak, true);
    this.lastError = 'timeout:mtproto';
    this.logger.warn(
      `MTProto 요청 시간 초과 (${this.timeoutStreak}/${MTPROTO_TIMEOUT_STREAK_DISABLE})`,
    );
    if (shouldDisableMtprotoAfterTimeouts(this.timeoutStreak)) {
      this.disableForRun('timeout:mtproto_streak');
    }
  }

  private disableForRun(reason: string) {
    this.stopped = true;
    this.lastError = reason;
    this.logger.warn(
      `이번 run 에서 MTProto를 끄고 t.me 방식으로 계속합니다. 이유=${reason}`,
    );
  }

  private resolveDailyLimit(): number {
    return envPositiveInt(
      this.configService.get<string>('RESOLVE_DAILY_LIMIT'),
      RESOLVE_DAILY_LIMIT_DEFAULT,
    );
  }

  private searchDailyLimit(): number {
    return envPositiveInt(
      this.configService.get<string>('KEYWORD_SEARCH_DAILY_LIMIT'),
      KEYWORD_SEARCH_DEFAULT_DAILY_LIMIT,
    );
  }

  private async loadStoredAccess(channelId: string): Promise<{
    telegramChatId: number | null;
    telegramAccessHash: string | null;
  } | null> {
    const row = await this.channelRepository
      .createQueryBuilder('c')
      .addSelect('c.telegramAccessHash')
      .where('c.id = :id', { id: channelId })
      .getOne();
    if (!row) return null;
    return {
      telegramChatId: row.telegramChatId ?? null,
      telegramAccessHash: row.telegramAccessHash ?? null,
    };
  }

  private async persistFloodWait(seconds: number) {
    const startedAt = new Date();
    const until = floodWaitUntilFromSeconds(startedAt, seconds);
    this.floodWaitUntil = until;
    this.disableForRun(`flood_wait:${seconds}s`);
    await this.stateRepository.save({
      id: 1,
      floodWaitStartedAt: startedAt,
      floodWaitUntil: until,
    });
  }

  private async refreshFloodWaitFromDb() {
    const row = await this.stateRepository.findOne({ where: { id: 1 } });
    this.floodWaitUntil = row?.floodWaitUntil ?? null;
    if (this.floodWaitUntil && !isFloodWaitBlocking(this.floodWaitUntil)) {
      this.floodWaitUntil = null;
      await this.stateRepository.save({
        id: 1,
        floodWaitStartedAt: null,
        floodWaitUntil: null,
      });
    }
  }

  private dailyLimit(): number {
    const raw = Number(
      this.configService.get<string>('MTPROTO_DAILY_LIMIT') ??
        MTPROTO_DEFAULT_DAILY_LIMIT,
    );
    return Number.isFinite(raw) && raw > 0 ? raw : MTPROTO_DEFAULT_DAILY_LIMIT;
  }

  private rollDailyCounter() {
    const today = formatKstYmd();
    if (this.requestDay !== today) {
      this.requestDay = today;
      this.requestsToday = 0;
      this.resolvesToday = 0;
      this.searchesToday = 0;
      if (this.lastError === 'daily_limit') {
        this.stopped = false;
        this.lastError = null;
      }
    }
  }

  private async ensureClient(): Promise<import('telegram').TelegramClient> {
    if (this.client) return this.client;
    if (this.connecting) {
      const ok = await this.connecting;
      if (!ok || !this.client) throw new Error('mtproto_connect_failed');
      return this.client;
    }
    this.connecting = this.connect();
    const ok = await this.connecting;
    this.connecting = null;
    if (!ok || !this.client) throw new Error('mtproto_connect_failed');
    return this.client;
  }

  private async connect(): Promise<boolean> {
    const apiIdRaw = (
      this.configService.get<string>('TELEGRAM_API_ID') ?? ''
    ).trim();
    const apiHash = (
      this.configService.get<string>('TELEGRAM_API_HASH') ?? ''
    ).trim();
    const session = (
      this.configService.get<string>('TELEGRAM_SESSION') ?? ''
    ).trim();
    if (!/^\d+$/.test(apiIdRaw) || !apiHash || !session) {
      this.lastError = 'no_session';
      return false;
    }
    const { TelegramClient, sessions } = await import('telegram');
    const client = new TelegramClient(
      new sessions.StringSession(session),
      Number(apiIdRaw),
      apiHash,
      { connectionRetries: 3 },
    );
    try {
      await withTimeout(
        client.connect(),
        MTPROTO_CONNECT_TIMEOUT_MS,
        'timeout:connect',
      );
      this.client = client;
      return true;
    } catch (error) {
      if (isMtprotoAuthFatal(error)) {
        await this.stopForAuth(error);
      } else {
        this.lastError = mtprotoErrorCode(error);
      }
      return false;
    }
  }

  private async api() {
    const { Api } = await import('telegram');
    return Api;
  }

  private async stopForAuth(error: unknown): Promise<void> {
    this.stopped = true;
    this.lastError = mtprotoErrorCode(error);
    this.logger.warn(`MTProto 인증 오류로 중단: ${this.lastError}`);
    try {
      await this.client?.disconnect();
    } catch {
      /* ignore */
    }
    this.client = null;
    await this.adminNotify.notifyMtprotoStopped(this.lastError);
  }

  private resolveUsername(channel: Channel): string | null {
    const fromCol = channel.username?.replace(/^@/, '').trim();
    if (fromCol) return fromCol.toLowerCase();
    return extractTelegramUsernameFromLink(channel.link);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
