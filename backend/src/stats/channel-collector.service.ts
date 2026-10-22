import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { Channel, ChannelStatus, LinkType } from '../channels/channel.entity';
import {
  extractTelegramUsernameFromLink,
  isInviteOnlyLink,
} from '../channels/telegram-username';
import { ChannelEvent, ChannelEventType } from './channel-event.entity';
import {
  CHANNEL_GAP_MS,
  describeFetchError,
  isClassifyFresh,
  runFetchRetries,
  shouldRetrySameDayFailed,
  shouldSkipDailyCollect,
  shouldSkipInviteExpiredRecheck,
} from './collect-fetch';
import { formatKstYmd } from './channel-metrics.math';
import { ChannelPost } from './channel-post.entity';
import { ChannelSnapshot } from './channel-snapshot.entity';
import {
  classifyTelegramAccountHtml,
  clipCollectError,
  formatBotCollectError,
  isMissingChannelHtml,
  isPlaceholderTitle,
  isPrivateChannelHtml,
  joinMentionedUsernames,
  parseInviteLinkHtml,
  parseTelegramChannelHtml,
  TELEGRAM_FETCH_HEADERS,
  type ParsedPreviewPost,
  type ParsedTelegramPreview,
} from './telegram-preview-html';

const EXTRA_PAGES = 3;
const FETCH_TIMEOUT_MS = 12_000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
const GONE_AFTER_FAILS = 3;

export type CollectOneResult =
  | { ok: true; mode: 'preview' | 'bot' }
  | {
      ok: false;
      reason:
        | 'gone'
        | 'private'
        | 'failed'
        | 'invalid'
        | 'invite_only'
        | 'invite_expired';
    };

@Injectable()
export class ChannelCollectorService {
  private readonly logger = new Logger(ChannelCollectorService.name);

  constructor(
    @InjectRepository(Channel)
    private readonly channelRepository: Repository<Channel>,
    @InjectRepository(ChannelPost)
    private readonly postRepository: Repository<ChannelPost>,
    @InjectRepository(ChannelEvent)
    private readonly eventRepository: Repository<ChannelEvent>,
    @InjectRepository(ChannelSnapshot)
    private readonly snapshotRepository: Repository<ChannelSnapshot>,
    private readonly configService: ConfigService,
  ) {}

  async collectAll(
    onProgress?: (progress: {
      processed: number;
      total: number;
      failed: number;
    }) => void,
  ): Promise<{ ok: number; fail: number }> {
    const allActive = await this.channelRepository.find({
      where: { status: ChannelStatus.ACTIVE },
    });
    const channels = allActive.filter(
      (ch) =>
        !shouldSkipDailyCollect(ch.collectStatus) &&
        !shouldSkipInviteExpiredRecheck(ch.collectStatus, ch.lastCollectedAt),
    );

    let ok = 0;
    let fail = 0;
    const total = channels.length;
    onProgress?.({ processed: 0, total, failed: 0 });
    for (let i = 0; i < channels.length; i += 1) {
      const outcome = await this.collectOneSafe(channels[i]);
      if (outcome.ok) ok += 1;
      else fail += 1;
      onProgress?.({ processed: i + 1, total, failed: fail });
      if (i < channels.length - 1) {
        await sleep(CHANNEL_GAP_MS);
      }
    }

    const retried = await this.retrySameDayFailures();
    ok += retried.ok;
    fail = Math.max(0, fail - retried.ok);

    this.logger.log(
      `채널 수집 완료: 성공 ${ok} / 실패 ${fail} (대상 ${channels.length}, 같은 날 재시도 ${retried.tried})`,
    );
    return { ok, fail };
  }

  private async collectOneSafe(channel: Channel): Promise<CollectOneResult> {
    try {
      return await this.collectOne(channel);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`채널 수집 실패(${channel.id}): ${message}`);
      try {
        const fresh = await this.channelRepository.findOneBy({ id: channel.id });
        if (fresh) {
          await this.markFailed(fresh, 'failed', describeFetchError(error));
        }
      } catch {
        /* ignore */
      }
      return { ok: false, reason: 'failed' };
    }
  }

  private async retrySameDayFailures(): Promise<{
    ok: number;
    fail: number;
    tried: number;
  }> {
    const today = formatKstYmd();
    const failed = await this.channelRepository.find({
      where: { status: ChannelStatus.ACTIVE, collectStatus: 'failed' },
    });
    const targets = failed.filter((ch) =>
      shouldRetrySameDayFailed(
        ch.collectStatus,
        ch.lastCollectedAt ? formatKstYmd(ch.lastCollectedAt) : null,
        today,
      ),
    );
    let ok = 0;
    let fail = 0;
    for (let i = 0; i < targets.length; i += 1) {
      if (i > 0) await sleep(CHANNEL_GAP_MS);
      const result = await this.collectOneSafe(targets[i]);
      if (result.ok) ok += 1;
      else fail += 1;
    }
    if (targets.length > 0) {
      this.logger.log(
        `같은 날 실패 재시도: ${targets.length}건 (성공 ${ok} / 실패 ${fail})`,
      );
    }
    return { ok, fail, tried: targets.length };
  }

  async collectOne(channelInput: Channel): Promise<CollectOneResult> {
    const channel = await this.channelRepository.findOneBy({
      id: channelInput.id,
    });
    if (!channel) {
      return { ok: false, reason: 'failed' };
    }

    const username = this.resolveUsername(channel);

    if (shouldSkipDailyCollect(channel.collectStatus)) {
      return { ok: false, reason: 'failed' };
    }

    if (isInviteOnlyLink(channel.link)) {
      return this.collectInvitePreview(channel);
    }

    if (!username) {
      await this.markFailed(channel, 'failed', 'collect:no_username');
      return { ok: false, reason: 'failed' };
    }

    const classified = await this.classifyAccount(channel, username);
    if (classified === 'invalid') {
      return { ok: false, reason: 'invalid' };
    }
    if (classified === 'failed') {
      return { ok: false, reason: 'failed' };
    }

    const isGroup = channel.linkType === LinkType.GROUP;
    if (isGroup) {
      return this.collectViaBot(channel, username);
    }

    const first = await this.fetchPreviewPage(username);
    if (first.error === 'fetch:timeout') {
      await this.markFailed(channel, 'failed', 'fetch:timeout');
      return { ok: false, reason: 'failed' };
    }
    if (
      first.status === 404 ||
      (first.html && isMissingChannelHtml(first.html))
    ) {
      return this.markGoneProgress(channel, 'preview:not_found');
    }
    if (first.status >= 400 || !first.html) {
      await this.markFailed(
        channel,
        'failed',
        first.error ?? `preview:http_${first.status || 0}`,
      );
      return { ok: false, reason: 'failed' };
    }
    if (isPrivateChannelHtml(first.html)) {
      await this.markFailed(channel, 'private', 'preview:private');
      return { ok: false, reason: 'private' };
    }

    let parsed = parseTelegramChannelHtml(first.html);
    if (!parsed.hasPreview) {
      return this.collectViaBot(channel, username);
    }

    const postsById = new Map<number, ParsedPreviewPost>();
    this.mergePosts(postsById, parsed.posts);
    parsed = await this.fetchOlderPagesIfNeeded(username, parsed, postsById);

    await this.upsertPosts(channel.id, [...postsById.values()]);
    await this.applySuccessfulCollect(channel, {
      title: parsed.title,
      memberCount: parsed.memberCount,
      username: parsed.usernameFromPosts ?? username,
    });
    return { ok: true, mode: 'preview' };
  }

  /** 90일보다 오래된 게시글 관측 기록을 지웁니다. 채널 행은 건드리지 않습니다. */
  async pruneOldPosts(): Promise<number> {
    const cutoff = new Date(Date.now() - NINETY_DAYS_MS);
    const result = await this.postRepository.delete({
      postedAt: LessThan(cutoff),
    });
    return result.affected ?? 0;
  }

  private async fetchOlderPagesIfNeeded(
    username: string,
    firstPage: ParsedTelegramPreview,
    postsById: Map<number, ParsedPreviewPost>,
  ): Promise<ParsedTelegramPreview> {
    let latestMeta = firstPage;
    const cutoff = new Date(Date.now() - SEVEN_DAYS_MS);

    for (let page = 0; page < EXTRA_PAGES; page += 1) {
      if (this.coversLastSevenDays(postsById, cutoff)) break;
      const minId = minMessageId(postsById);
      if (minId == null) break;

      const next = await this.fetchPreviewPage(username, minId);
      if (next.status >= 400 || !next.html) break;
      const parsed = parseTelegramChannelHtml(next.html);
      if (parsed.posts.length === 0) break;
      const beforeSize = postsById.size;
      this.mergePosts(postsById, parsed.posts);
      if (postsById.size === beforeSize) break;
      if (parsed.title) latestMeta = { ...latestMeta, title: parsed.title };
      if (parsed.memberCount != null) {
        latestMeta = { ...latestMeta, memberCount: parsed.memberCount };
      }
      if (parsed.usernameFromPosts) {
        latestMeta = {
          ...latestMeta,
          usernameFromPosts: parsed.usernameFromPosts,
        };
      }
    }

    return latestMeta;
  }

  private coversLastSevenDays(
    postsById: Map<number, ParsedPreviewPost>,
    cutoff: Date,
  ): boolean {
    if (postsById.size === 0) return true;
    let oldest = Date.now();
    for (const post of postsById.values()) {
      oldest = Math.min(oldest, post.postedAt.getTime());
    }
    return oldest <= cutoff.getTime();
  }

  private mergePosts(
    target: Map<number, ParsedPreviewPost>,
    posts: ParsedPreviewPost[],
  ) {
    for (const post of posts) {
      target.set(post.messageId, post);
    }
  }

  private async upsertPosts(channelId: string, posts: ParsedPreviewPost[]) {
    if (posts.length === 0) return;
    const now = new Date();
    await this.postRepository.upsert(
      posts.map((post) => ({
        channelId,
        messageId: post.messageId,
        postedAt: post.postedAt,
        views: post.views,
        mediaType: post.mediaType,
        forwardedFrom: post.forwardedFrom,
        mentionedUsernames: joinMentionedUsernames(post.mentionedUsernames),
        textExcerpt: post.textExcerpt,
        isEdited: post.isEdited,
        lastSeenAt: now,
      })),
      ['channelId', 'messageId'],
    );
  }

  private async classifyAccount(
    channel: Channel,
    username: string,
  ): Promise<'ok' | 'invalid' | 'failed'> {
    if (
      isClassifyFresh(channel.classifiedAt) &&
      (channel.classifiedKind === 'channel' ||
        channel.classifiedKind === 'group' ||
        channel.classifiedKind === 'invalid')
    ) {
      if (channel.classifiedKind === 'invalid') {
        return 'invalid';
      }
      const nextType =
        channel.classifiedKind === 'group' ? LinkType.GROUP : LinkType.CHANNEL;
      if (channel.linkType !== nextType) {
        await this.recordEvent(
          channel.id,
          'type_corrected',
          channel.linkType,
          nextType,
        );
        channel.linkType = nextType;
        await this.channelRepository.save(channel);
      }
      return 'ok';
    }

    const page = await this.fetchHtml(`https://t.me/${username}`);
    if (page.error === 'fetch:timeout') {
      await this.markFailed(channel, 'failed', 'fetch:timeout');
      return 'failed';
    }
    if (page.status >= 400 && page.status !== 404) {
      await this.markFailed(
        channel,
        'failed',
        page.error ?? `fetch:http_${page.status}`,
      );
      return 'failed';
    }
    if (!page.html) {
      await this.markFailed(channel, 'failed', page.error ?? 'fetch:empty');
      return 'failed';
    }
    if (isPrivateChannelHtml(page.html)) {
      await this.markFailed(channel, 'private', 'page:private');
      return 'failed';
    }

    const classified = classifyTelegramAccountHtml(page.html);
    const realTitle = classified.title?.trim() || null;
    if (realTitle && isPlaceholderTitle(channel.title) && !isPlaceholderTitle(realTitle)) {
      channel.title = realTitle;
    }

    channel.classifiedKind = classified.kind;
    channel.classifiedAt = new Date();

    if (classified.kind === 'invalid') {
      await this.markInvalid(channel, classified.reason);
      return 'invalid';
    }

    const nextType =
      classified.kind === 'group' ? LinkType.GROUP : LinkType.CHANNEL;
    if (channel.linkType !== nextType) {
      await this.recordEvent(
        channel.id,
        'type_corrected',
        channel.linkType,
        nextType,
      );
      channel.linkType = nextType;
    }
    await this.channelRepository.save(channel);
    return 'ok';
  }

  private async collectViaBot(
    channel: Channel,
    username: string,
  ): Promise<CollectOneResult> {
    const token = (
      this.configService.get<string>('TELEGRAM_BOT_TOKEN') ?? ''
    ).trim();
    if (!token || token.includes('placeholder')) {
      await this.markFailed(channel, 'failed', 'bot:no_token');
      return { ok: false, reason: 'failed' };
    }

    try {
      const chat = await this.botGetChat(token, username);
      if (!chat.ok) {
        const botError = formatBotCollectError(
          chat.errorCode,
          chat.description,
        );
        const description = (chat.description ?? '').toLowerCase();
        if (
          chat.errorCode === 400 &&
          (description.includes('chat not found') ||
            description.includes('not found'))
        ) {
          return this.markGoneProgress(channel, botError);
        }
        if (
          description.includes('not a member') ||
          description.includes('kicked') ||
          description.includes('private')
        ) {
          await this.markFailed(channel, 'private', botError);
          return { ok: false, reason: 'private' };
        }
        await this.markFailed(channel, 'failed', botError);
        return { ok: false, reason: 'failed' };
      }

      let memberCount: number | null = null;
      try {
        memberCount = await this.botGetMemberCount(token, username);
      } catch (error) {
        this.logger.warn(
          `인원 수 조회 실패(@${username}): ${error instanceof Error ? error.message : error}`,
        );
      }
      await this.applySuccessfulCollect(channel, {
        title: chat.title,
        memberCount,
        username,
        telegramChatId: chat.chatId,
      });
      return { ok: true, mode: 'bot' };
    } catch (error) {
      this.logger.warn(
        `Bot API 수집 실패(@${username}): ${error instanceof Error ? error.message : error}`,
      );
      await this.markFailed(channel, 'failed', describeFetchError(error));
      return { ok: false, reason: 'failed' };
    }
  }

  private async fetchPreviewPage(
    username: string,
    before?: number,
  ): Promise<{ status: number; html: string | null; error?: string }> {
    const url =
      before != null
        ? `https://t.me/s/${username}?before=${before}`
        : `https://t.me/s/${username}`;
    return this.fetchHtml(url);
  }

  private async collectInvitePreview(
    channel: Channel,
  ): Promise<CollectOneResult> {
    const result = await this.fetchHtml(channel.link);
    if (result.error === 'fetch:timeout') {
      await this.markFailed(channel, 'failed', 'fetch:timeout');
      return { ok: false, reason: 'failed' };
    }
    if (result.status === 404) {
      await this.markInviteExpired(channel);
      return { ok: false, reason: 'invite_expired' };
    }
    if (result.status >= 400 || !result.html) {
      await this.markFailed(
        channel,
        'failed',
        result.error ?? `invite:http_${result.status || 0}`,
      );
      return { ok: false, reason: 'failed' };
    }

    const parsed = parseInviteLinkHtml(result.html, result.finalUrl);
    if (parsed.expired) {
      await this.markInviteExpired(channel);
      return { ok: false, reason: 'invite_expired' };
    }

    await this.applySuccessfulCollect(channel, {
      title: parsed.title,
      memberCount: parsed.memberCount,
      keepUsername: true,
      description: parsed.description,
      avatarUrl: parsed.avatarUrl,
    });
    await this.upsertMemberSnapshot(channel.id, parsed.memberCount);
    return { ok: true, mode: 'preview' };
  }

  private async fetchHtml(url: string): Promise<{
    status: number;
    html: string | null;
    error?: string;
    finalUrl?: string | null;
  }> {
    return runFetchRetries(
      async () => {
        const res = await fetch(url, {
          headers: TELEGRAM_FETCH_HEADERS,
          redirect: 'follow',
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        const html = await res.text();
        return {
          status: res.status,
          retryAfter: res.headers.get('retry-after'),
          html,
          finalUrl: res.url,
        };
      },
      sleep,
    );
  }

  private async botGetChat(
    token: string,
    username: string,
  ): Promise<{
    ok: boolean;
    title: string | null;
    chatId: number | null;
    errorCode?: number;
    description?: string;
  }> {
    const res = await fetch(
      `https://api.telegram.org/bot${token}/getChat?chat_id=@${username}`,
      { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
    );
    const data = (await res.json()) as {
      ok: boolean;
      error_code?: number;
      description?: string;
      result?: { id?: number | string; title?: string };
    };
    if (!data.ok || !data.result) {
      return {
        ok: false,
        title: null,
        chatId: null,
        errorCode: data.error_code,
        description: data.description,
      };
    }
    const idRaw = data.result.id;
    const chatId = idRaw == null ? null : Number(idRaw);
    return {
      ok: true,
      title: data.result.title ?? null,
      chatId: Number.isFinite(chatId) ? chatId : null,
    };
  }

  private async botGetMemberCount(
    token: string,
    username: string,
  ): Promise<number | null> {
    const res = await fetch(
      `https://api.telegram.org/bot${token}/getChatMemberCount?chat_id=@${username}`,
      { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
    );
    const data = (await res.json()) as { ok: boolean; result?: number };
    if (!data.ok || typeof data.result !== 'number') return null;
    return data.result;
  }

  private async applySuccessfulCollect(
    channel: Channel,
    info: {
      title: string | null;
      memberCount: number | null;
      username?: string | null;
      keepUsername?: boolean;
      description?: string | null;
      avatarUrl?: string | null;
      telegramChatId?: number | null;
    },
  ) {
    const now = new Date();
    const wasGone = channel.collectStatus === 'gone';
    const isFirst = channel.firstObservedAt == null;
    const keepUsername = Boolean(info.keepUsername);
    const nextUsername = keepUsername
      ? (channel.username?.replace(/^@/, '').toLowerCase() ?? null)
      : (info.username ?? '').replace(/^@/, '').toLowerCase();
    const prevUsername =
      channel.username?.replace(/^@/, '').toLowerCase() ?? null;
    const nextTitle = info.title?.trim() || null;

    if (isFirst) {
      channel.firstObservedAt = now;
      await this.recordEvent(
        channel.id,
        'first_seen',
        null,
        nextTitle ?? nextUsername,
      );
    } else {
      if (nextTitle && nextTitle !== channel.title) {
        await this.recordEvent(
          channel.id,
          'title_changed',
          channel.title,
          nextTitle,
        );
      }
      if (
        !keepUsername &&
        nextUsername &&
        prevUsername &&
        nextUsername !== prevUsername
      ) {
        await this.recordEvent(
          channel.id,
          'username_changed',
          prevUsername,
          nextUsername,
        );
      }
    }

    if (wasGone) {
      await this.recordEvent(channel.id, 'returned', 'gone', 'ok');
    }

    if (nextTitle) channel.title = nextTitle;
    if (!keepUsername && nextUsername) channel.username = nextUsername;
    if (info.memberCount != null) channel.memberCount = info.memberCount;
    if (info.description != null && info.description.trim()) {
      channel.description = info.description.trim();
    }
    if (info.avatarUrl && !channel.avatarApproved) {
      channel.avatarUrl = info.avatarUrl;
      channel.avatarApproved = true;
    }
    if (info.telegramChatId != null)
      channel.telegramChatId = info.telegramChatId;
    channel.lastCollectedAt = now;
    channel.collectStatus = 'ok';
    channel.collectError = null;
    channel.collectFailCount = 0;
    await this.channelRepository.save(channel);
  }

  private async upsertMemberSnapshot(
    channelId: string,
    memberCount: number | null,
  ) {
    if (memberCount == null) return;
    await this.snapshotRepository.upsert(
      {
        channelId,
        capturedOn: formatKstYmd(),
        memberCount,
        medianViews7d: 0,
        posts7d: 0,
        forwardedRatio: 0,
      },
      ['channelId', 'capturedOn'],
    );
  }

  private async markGoneProgress(
    channel: Channel,
    error: string,
  ): Promise<CollectOneResult> {
    channel.collectFailCount = (channel.collectFailCount ?? 0) + 1;
    channel.collectError = clipCollectError(error);
    channel.lastCollectedAt = new Date();
    if (channel.collectFailCount >= GONE_AFTER_FAILS) {
      const alreadyGone = channel.collectStatus === 'gone';
      channel.collectStatus = 'gone';
      await this.channelRepository.save(channel);
      if (!alreadyGone) {
        await this.recordEvent(channel.id, 'gone', 'ok', 'gone');
      }
      return { ok: false, reason: 'gone' };
    }
    channel.collectStatus = 'failed';
    await this.channelRepository.save(channel);
    return { ok: false, reason: 'failed' };
  }

  private async markFailed(
    channel: Channel,
    status: 'failed' | 'private',
    error: string,
  ) {
    channel.collectStatus = status;
    channel.collectError = clipCollectError(error);
    channel.lastCollectedAt = new Date();
    await this.channelRepository.save(channel);
  }

  private async markInvalid(channel: Channel, error: string) {
    channel.collectStatus = 'invalid';
    channel.collectError = clipCollectError(error);
    channel.lastCollectedAt = new Date();
    await this.channelRepository.save(channel);
  }

  private async markInviteExpired(channel: Channel) {
    channel.collectStatus = 'invite_expired';
    channel.collectError = clipCollectError('invite:expired');
    channel.lastCollectedAt = new Date();
    await this.channelRepository.save(channel);
  }

  private async recordEvent(
    channelId: string,
    type: ChannelEventType,
    before: string | null,
    after: string | null,
  ) {
    await this.eventRepository.save({
      channelId,
      type,
      before,
      after,
      occurredAt: new Date(),
    });
  }

  private resolveUsername(channel: Channel): string | null {
    const fromCol = channel.username?.replace(/^@/, '').trim();
    if (fromCol) return fromCol.toLowerCase();
    return extractTelegramUsernameFromLink(channel.link);
  }
}

function minMessageId(posts: Map<number, ParsedPreviewPost>): number | null {
  if (posts.size === 0) return null;
  let min = Number.POSITIVE_INFINITY;
  for (const id of posts.keys()) min = Math.min(min, id);
  return Number.isFinite(min) ? min : null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
