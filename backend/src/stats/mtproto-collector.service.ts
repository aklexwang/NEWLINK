import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { TelegramAdminNotifyService } from '../common/telegram-admin-notify.service';
import { Channel, LinkType } from '../channels/channel.entity';
import { clipPostExcerpt } from '../channels/channel-language.logic';
import {
  extractTelegramUsernameFromLink,
  isInviteOnlyLink,
} from '../channels/telegram-username';
import { formatKstYmd } from './channel-metrics.math';
import { ChannelEvent } from './channel-event.entity';
import { ChannelPost, type ChannelPostMediaType } from './channel-post.entity';
import { ChannelSnapshot } from './channel-snapshot.entity';
import {
  assertMtprotoMethodAllowed,
  canSpendMtprotoRequest,
  countGroupActivityFromHistory,
  deletedMessageIds,
  isMtprotoAuthFatal,
  MTPROTO_DEFAULT_DAILY_LIMIT,
  MTPROTO_EXCERPT_MAX,
  MTPROTO_HISTORY_LIMIT,
  MTPROTO_MIN_GAP_MS,
  mtprotoErrorCode,
  retryAfterFloodWait,
  shouldSaveMtprotoPosts,
  unixSecondsToDate,
  type GroupActivityCounts,
} from './mtproto-collect.logic';
import {
  extractTmeUsernamesFromHtml,
  joinMentionedUsernames,
} from './telegram-preview-html';

export type MtprotoPublicStatus = {
  enabled: boolean;
  requestsToday: number;
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
export class MtprotoCollectorService {
  private readonly logger = new Logger(MtprotoCollectorService.name);
  private client: import('telegram').TelegramClient | null = null;
  private stopped = false;
  private lastError: string | null = null;
  private requestsToday = 0;
  private requestDay = '';
  private lastCallAt = 0;
  private connecting: Promise<boolean> | null = null;

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
  ) {}

  isEnabled(): boolean {
    const raw = (
      this.configService.get<string>('MTPROTO_ENABLED') ?? ''
    )
      .trim()
      .toLowerCase();
    return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
  }

  getPublicStatus(): MtprotoPublicStatus {
    this.rollDailyCounter();
    return {
      enabled: this.isEnabled() && !this.stopped,
      requestsToday: this.requestsToday,
      lastError: this.lastError,
    };
  }

  canCollect(channel: Channel): boolean {
    if (!this.isEnabled() || this.stopped) return false;
    if (isInviteOnlyLink(channel.link)) return false;
    if (channel.collectStatus === 'invite_expired') return false;
    return Boolean(this.resolveUsername(channel));
  }

  async collectAndSave(channel: Channel): Promise<MtprotoCollectResult> {
    if (!this.isEnabled() || this.stopped) {
      return { ok: false, reason: 'disabled' };
    }
    if (!this.canCollect(channel)) {
      return { ok: false, reason: 'skipped' };
    }
    const username = this.resolveUsername(channel);
    if (!username) return { ok: false, reason: 'skipped' };

    try {
      const data = await this.readPublicUsername(username);
      await this.persist(channel, data);
      return { ok: true, mode: 'mtproto' };
    } catch (error) {
      if (isMtprotoAuthFatal(error)) {
        await this.stopForAuth(error);
        return { ok: false, reason: 'failed' };
      }
      const code = mtprotoErrorCode(error);
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

  async testPublicUsername(usernameRaw: string): Promise<MtprotoTestSummary> {
    if (!this.isEnabled() || this.stopped) {
      return { ok: false, reason: 'disabled' };
    }
    const username = usernameRaw.replace(/^@/, '').trim().toLowerCase();
    if (!username) return { ok: false, reason: 'invalid' };
    try {
      const data = await this.readPublicUsername(username);
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
        forwardedPosts: data.posts.filter((p) => Boolean(p.forwardedFrom)).length,
        editedPosts: data.posts.filter((p) => p.isEdited).length,
      };
    } catch (error) {
      if (isMtprotoAuthFatal(error)) {
        await this.stopForAuth(error);
      }
      return { ok: false, reason: mtprotoErrorCode(error) };
    }
  }

  private async readPublicUsername(username: string): Promise<{
    username: string;
    title: string | null;
    description: string | null;
    memberCount: number | null;
    createdOn: Date | null;
    telegramChatId: number | null;
    linkType: LinkType;
    posts: HistoryPost[];
    activity: GroupActivityCounts;
  }> {
    const resolved = await this.resolvePublicChannel(username);
    const history = await this.fetchHistory(resolved);
    return { ...resolved, ...history };
  }

  private async resolvePublicChannel(
    username: string,
  ): Promise<ResolvedPublicChannel> {
    const Api = await this.api();
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

    const full = (await this.call(
      'channels.GetFullChannel',
      new Api.channels.GetFullChannel({
        channel: new Api.InputChannel({
          channelId: chat.id as never,
          accessHash: chat.accessHash as never,
        }),
      }),
    )) as {
      fullChat?: { about?: string; participantsCount?: number };
      chats?: Array<{ date?: number; title?: string }>;
    };

    const isGroup = Boolean(chat.megagroup) && !chat.broadcast;
    return {
      username,
      title: chat.title?.trim() || full.chats?.[0]?.title?.trim() || null,
      description: full.fullChat?.about?.trim() || null,
      memberCount:
        typeof full.fullChat?.participantsCount === 'number'
          ? full.fullChat.participantsCount
          : null,
      createdOn: unixSecondsToDate(chat.date ?? full.chats?.[0]?.date),
      telegramChatId: Number(chat.id),
      linkType: isGroup ? LinkType.GROUP : LinkType.CHANNEL,
      inputChannel: { channelId: chat.id, accessHash: chat.accessHash },
    };
  }

  private async fetchHistory(
    resolved: ResolvedPublicChannel,
  ): Promise<{ posts: HistoryPost[]; activity: GroupActivityCounts }> {
    const Api = await this.api();
    const result = (await this.call(
      'messages.GetHistory',
      new Api.messages.GetHistory({
        peer: new Api.InputPeerChannel({
          channelId: resolved.inputChannel.channelId as never,
          accessHash: resolved.inputChannel.accessHash as never,
        }),
        offsetId: 0,
        offsetDate: 0,
        addOffset: 0,
        limit: MTPROTO_HISTORY_LIMIT,
        maxId: 0,
        minId: 0,
        hash: 0 as never,
      }),
    )) as { messages?: unknown[] };

    const messages = result.messages ?? [];
    if (resolved.linkType === LinkType.GROUP) {
      const activity = countGroupActivityFromHistory(messages);
      return { posts: [], activity };
    }

    const posts: HistoryPost[] = [];
    for (const raw of messages) {
      const parsed = this.parseHistoryMessage(raw, resolved.username);
      if (parsed) posts.push(parsed);
    }
    return { posts, activity: { activity24h: 0, activity7d: 0 } };
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
        ? `channel:${String(fwdFrom.fromId.channelId)}`
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
      linkType: LinkType;
      posts: HistoryPost[];
      activity: GroupActivityCounts;
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
    } else if (nextTitle && nextTitle !== channel.title) {
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
    if (nextTitle) channel.title = nextTitle;
    channel.username = data.username;
    if (data.memberCount != null) channel.memberCount = data.memberCount;
    if (data.description) channel.description = data.description;
    if (data.telegramChatId != null)
      channel.telegramChatId = data.telegramChatId;
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
    if (!savePosts) {
      channel.posts7d = data.activity.activity7d;
    }
    await this.channelRepository.save(channel);

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

  private async call(method: string, request: object): Promise<unknown> {
    assertMtprotoMethodAllowed(method);
    this.rollDailyCounter();
    const limit = this.dailyLimit();
    if (!canSpendMtprotoRequest(this.requestsToday, limit)) {
      this.lastError = 'daily_limit';
      this.stopped = true;
      throw new Error('MTPROTO_DAILY_LIMIT');
    }
    const client = await this.ensureClient();
    const wait = MTPROTO_MIN_GAP_MS - (Date.now() - this.lastCallAt);
    if (wait > 0) await sleep(wait);
    this.lastCallAt = Date.now();
    this.requestsToday += 1;

    return retryAfterFloodWait(
      async () => client.invoke(request as never),
      sleep,
    );
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
    const apiIdRaw = (this.configService.get<string>('TELEGRAM_API_ID') ?? '')
      .trim();
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
      await client.connect();
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
