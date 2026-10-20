import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { Channel, ChannelStatus, LinkType } from '../channels/channel.entity';
import { extractTelegramUsernameFromLink } from '../channels/telegram-username';
import { ChannelEvent, ChannelEventType } from './channel-event.entity';
import { ChannelPost } from './channel-post.entity';
import {
  classifyTelegramAccountHtml,
  clipCollectError,
  formatBotCollectError,
  isMissingChannelHtml,
  isPlaceholderTitle,
  isPrivateChannelHtml,
  joinMentionedUsernames,
  parseTelegramChannelHtml,
  TELEGRAM_FETCH_HEADERS,
  type ParsedPreviewPost,
  type ParsedTelegramPreview,
} from './telegram-preview-html';

const PAGE_DELAY_MS = 1500;
const EXTRA_PAGES = 3;
const FETCH_TIMEOUT_MS = 12_000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
const GONE_AFTER_FAILS = 3;

export type CollectOneResult =
  | { ok: true; mode: 'preview' | 'bot' }
  | {
      ok: false;
      reason: 'gone' | 'private' | 'failed' | 'no_username' | 'invalid';
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
    private readonly configService: ConfigService,
  ) {}

  async collectAll(
    onProgress?: (progress: {
      processed: number;
      total: number;
      failed: number;
    }) => void,
  ): Promise<{ ok: number; fail: number }> {
    const channels = await this.channelRepository.find({
      where: { status: ChannelStatus.ACTIVE },
    });

    let ok = 0;
    let fail = 0;
    const total = channels.length;
    onProgress?.({ processed: 0, total, failed: 0 });
    for (let i = 0; i < channels.length; i += 1) {
      try {
        const result = await this.collectOne(channels[i]);
        if (result.ok) ok += 1;
        else fail += 1;
      } catch (error) {
        fail += 1;
        const message =
          error instanceof Error ? error.message : String(error);
        this.logger.warn(`채널 수집 실패(${channels[i].id}): ${message}`);
        try {
          await this.markFailed(
            channels[i],
            'failed',
            clipCollectError(`fetch:${isTimeoutError(error) ? 'timeout' : 'error'}`),
          );
        } catch {
          /* ignore */
        }
      }
      onProgress?.({ processed: i + 1, total, failed: fail });
      if (i < channels.length - 1) {
        await sleep(PAGE_DELAY_MS);
      }
    }

    this.logger.log(
      `채널 수집 완료: 성공 ${ok} / 실패 ${fail} (전체 ${channels.length})`,
    );
    return { ok, fail };
  }

  async collectOne(channelInput: Channel): Promise<CollectOneResult> {
    const channel = await this.channelRepository.findOneBy({
      id: channelInput.id,
    });
    if (!channel) {
      return { ok: false, reason: 'failed' };
    }

    const username = this.resolveUsername(channel);

    if (!username) {
      await this.markFailed(channel, 'failed', 'no_username');
      return { ok: false, reason: 'no_username' };
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
      return this.collectViaBot(channel, username, 'preview:no_widget');
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
    previewHint?: string,
  ): Promise<CollectOneResult> {
    const token = (
      this.configService.get<string>('TELEGRAM_BOT_TOKEN') ?? ''
    ).trim();
    if (!token || token.includes('placeholder')) {
      await this.markFailed(
        channel,
        'failed',
        previewHint ? `${previewHint};bot:no_token` : 'bot:no_token',
      );
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

      const memberCount = await this.botGetMemberCount(token, username);
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
      const reason = isTimeoutError(error)
        ? 'fetch:timeout'
        : previewHint ?? 'bot:error';
      await this.markFailed(channel, 'failed', reason);
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

  private async fetchHtml(
    url: string,
  ): Promise<{ status: number; html: string | null; error?: string }> {
    try {
      const res = await fetch(url, {
        headers: TELEGRAM_FETCH_HEADERS,
        redirect: 'follow',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      const html = await res.text();
      return { status: res.status, html };
    } catch (error) {
      this.logger.warn(
        `미리보기 요청 실패: ${error instanceof Error ? error.message : error}`,
      );
      return {
        status: 0,
        html: null,
        error: isTimeoutError(error) ? 'fetch:timeout' : 'fetch:network',
      };
    }
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
      username: string;
      telegramChatId?: number | null;
    },
  ) {
    const now = new Date();
    const wasGone = channel.collectStatus === 'gone';
    const isFirst = channel.firstObservedAt == null;
    const nextUsername = info.username.replace(/^@/, '').toLowerCase();
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
      if (prevUsername && nextUsername !== prevUsername) {
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
    channel.username = nextUsername;
    if (info.memberCount != null) channel.memberCount = info.memberCount;
    if (info.telegramChatId != null)
      channel.telegramChatId = info.telegramChatId;
    channel.lastCollectedAt = now;
    channel.collectStatus = 'ok';
    channel.collectError = null;
    channel.collectFailCount = 0;
    await this.channelRepository.save(channel);
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

function isTimeoutError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const name = 'name' in error ? String(error.name) : '';
  const message = error instanceof Error ? error.message : String(error);
  return (
    name === 'TimeoutError' ||
    name === 'AbortError' ||
    /timeout|timed out|aborted/i.test(message)
  );
}
