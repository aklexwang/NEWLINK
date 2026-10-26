import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThan, MoreThanOrEqual, Repository } from 'typeorm';
import { Channel, ChannelStatus, LinkType } from '../channels/channel.entity';
import {
  applyCollectedTitle,
  isTitleLocked,
} from '../channels/title-lock.logic';
import {
  extractTelegramUsernameFromLink,
  isInviteOnlyLink,
  usernamesToFillFromLinks,
} from '../channels/telegram-username';
import { ChannelEvent, ChannelEventType } from './channel-event.entity';
import { MtprotoCollectorService } from './mtproto-collector.service';
import { runCollectPool } from './collect-pool.logic';
import { getTmeGate, type TmeGate } from './tme-gate';
import {
  CHANNEL_GAP_MS,
  describeFetchError,
  isBotRateLimited,
  isClassifyFresh,
  parseBotRetryAfterMs,
  parseRetryAfterMs,
  runFetchRetries,
  shouldRetrySameDayFailed,
  shouldSkipDailyCollect,
} from './collect-fetch';
import {
  CHANNEL_COLLECT_TIMEOUT_MS,
  isMtprotoTimeoutError,
  withTimeout,
} from './mtproto-collect.logic';
import { formatKstYmd } from './channel-metrics.math';
import {
  nextCollectAtAfterFailure,
  nextCollectAtAfterInvalid,
  nextCollectAtAfterInviteExpired,
  nextCollectAtAfterSuccess,
  nextFullWindowAt,
} from './collect-queue.logic';
import { collectQueueLimit, selectDueChannels } from './collect-queue.query';
import {
  needsExactMemberFetch,
  resolveMemberCount,
} from './member-count.logic';
import {
  isLightCollectTarget,
  shouldMarkLightNoPostsFailed,
} from './stats-collect.logic';
import { isCollectBudgetOver } from './collect-budget.logic';
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
  parseExactMemberCountFromPage,
  parsePublicUsernamePage,
  parseTelegramChannelHtml,
  TELEGRAM_FETCH_HEADERS,
  type ParsedPreviewPost,
  type ParsedTelegramPreview,
} from './telegram-preview-html';

const EXTRA_PAGES = 3;
const FETCH_TIMEOUT_MS = 12_000;
/** 쿨다운이 이보다 길면 full 수집 요청은 기다리지 않고 429 로 돌려보낸다 */
const FULL_GATE_MAX_WAIT_MS = 60_000;

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
const GONE_AFTER_FAILS = 3;

export type CollectOneResult =
  | { ok: true; mode: 'preview' | 'bot' | 'mtproto' }
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

/** 계정 판별 결과. 페이지를 실제로 읽었을 때만 정확한 회원 수가 따라온다 */
type ClassifyOutcome = {
  status: 'ok' | 'invalid' | 'failed';
  exactMemberCount: number | null;
};

@Injectable()
export class ChannelCollectorService {
  private readonly logger = new Logger(ChannelCollectorService.name);

  /** 봇 API 가 429 를 준 뒤 이 시각까지는 봇 호출을 하지 않는다 (채널 상태도 건드리지 않음) */
  private botBlockedUntil = 0;

  /** 테스트에서 전역 게이트 대신 쓸 게이트 */
  private gateOverride: TmeGate | null = null;

  private get gate(): TmeGate {
    return this.gateOverride ?? getTmeGate();
  }

  private queueLimit(): number {
    return collectQueueLimit(
      this.configService.get<string>('COLLECT_QUEUE_LIMIT'),
    );
  }

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
    private readonly mtproto: MtprotoCollectorService,
  ) {}

  async collectAll(
    onProgress?: (progress: {
      processed: number;
      total: number;
      failed: number;
    }) => void,
    options?: { deadlineMs?: number },
  ): Promise<{ ok: number; fail: number; remaining: number }> {
    await this.fillMissingUsernamesFromLinks();
    // 우선순위 큐: 수집 차례(next_collect_at)가 된 채널을 오래 밀린 순으로. 그룹·초대 링크 포함 전체
    const channels = await selectDueChannels(this.channelRepository, {
      limit: this.queueLimit(),
    });

    const result = await this.collectQueued(
      channels,
      onProgress,
      options?.deadlineMs,
    );
    if (!isCollectBudgetOver(options?.deadlineMs)) {
      const retried = await this.retrySameDayFailures();
      result.ok += retried.ok;
      result.fail = Math.max(0, result.fail - retried.ok);
      this.logger.log(
        `채널 수집 완료: 성공 ${result.ok} / 실패 ${result.fail} (대상 ${channels.length}, 남은 ${result.remaining}, 같은 날 재시도 ${retried.tried})`,
      );
    } else {
      this.logger.log(
        `채널 수집 시간 예산 종료: 성공 ${result.ok} / 실패 ${result.fail} (대상 ${channels.length}, 남은 ${result.remaining})`,
      );
    }
    return result;
  }

  async collectLightAll(
    onProgress?: (progress: {
      processed: number;
      total: number;
      failed: number;
    }) => void,
    options?: { deadlineMs?: number },
  ): Promise<{ ok: number; fail: number; remaining: number }> {
    // 큐에서 필요한 칸만 읽는다 (항목마다 collectOne 이 id 로 전체 행을 다시 읽는다).
    // light 대상 조건은 그대로: 채널만, 공개 username 이 있는 것만
    const due = await selectDueChannels(this.channelRepository, {
      light: true,
      limit: this.queueLimit(),
    });
    const channels = due.filter((ch) => isLightCollectTarget(ch));
    const result = await this.collectQueued(
      channels,
      onProgress,
      options?.deadlineMs,
      { light: true },
    );
    this.logger.log(
      `light 수집 완료: 성공 ${result.ok} / 실패 ${result.fail} (대상 ${channels.length}, 남은 ${result.remaining})`,
    );
    return result;
  }

  private async collectQueued(
    channels: Channel[],
    onProgress?: (progress: {
      processed: number;
      total: number;
      failed: number;
    }) => void,
    deadlineMs?: number,
    options?: { light?: boolean },
  ): Promise<{ ok: number; fail: number; remaining: number }> {
    if (options?.light) {
      // light: 워커 여러 개가 항목을 나눠 가져가고, 실제 동시 요청 수는 전역 게이트가 정한다
      const gate = this.gate;
      const result = await runCollectPool({
        items: channels,
        workers: gate.collectMax(),
        handle: async (channel) =>
          (await this.collectOneSafe(channel, options)).ok,
        gapMs: () => gate.gapMs(),
        isBudgetOver: () => isCollectBudgetOver(deadlineMs),
        coolingRemainingMs: () => gate.coolingRemainingMs(),
        sleep,
        onProgress,
        onBudgetStop: (remaining) =>
          this.logger.log(
            `수집 시간 예산이 끝나 다음 채널부터 남깁니다. 남은 ${remaining}건`,
          ),
      });
      return result;
    }

    let ok = 0;
    let fail = 0;
    const total = channels.length;
    onProgress?.({ processed: 0, total, failed: 0 });
    let processed = 0;
    for (let i = 0; i < channels.length; i += 1) {
      if (i > 0 && isCollectBudgetOver(deadlineMs)) {
        this.logger.log(
          `수집 시간 예산이 끝나 다음 채널부터 남깁니다. 남은 ${total - processed}건`,
        );
        break;
      }
      const outcome = await this.collectOneSafe(channels[i], options);
      if (outcome.ok) ok += 1;
      else fail += 1;
      processed = i + 1;
      onProgress?.({ processed, total, failed: fail });
      if (i < channels.length - 1 && !isCollectBudgetOver(deadlineMs)) {
        await sleep(CHANNEL_GAP_MS);
      }
    }
    return { ok, fail, remaining: Math.max(0, total - processed) };
  }

  private async collectOneSafe(
    channel: Channel,
    options?: { light?: boolean },
  ): Promise<CollectOneResult> {
    const startedAt = Date.now();
    this.logger.log(`채널 수집 시작 id=${channel.id}`);
    try {
      const result = await withTimeout(
        this.collectOne(channel, options),
        CHANNEL_COLLECT_TIMEOUT_MS,
        'timeout:channel',
      );
      this.logCollectEnd(channel.id, startedAt, result);
      return result;
    } catch (error) {
      if (isMtprotoTimeoutError(error)) {
        this.logger.warn(
          `채널 수집 끝 id=${channel.id} 방식=timeout ${Date.now() - startedAt}ms 결과=timeout:channel`,
        );
        try {
          const fresh = await this.channelRepository.findOneBy({
            id: channel.id,
          });
          if (fresh) {
            await this.markFailed(fresh, 'failed', 'timeout:channel');
          }
        } catch {
          /* ignore */
        }
        return { ok: false, reason: 'failed' };
      }
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`채널 수집 실패(${channel.id}): ${message}`);
      try {
        const fresh = await this.channelRepository.findOneBy({
          id: channel.id,
        });
        if (fresh) {
          await this.markFailed(fresh, 'failed', describeFetchError(error));
        }
      } catch {
        /* ignore */
      }
      this.logger.warn(
        `채널 수집 끝 id=${channel.id} 방식=error ${Date.now() - startedAt}ms 결과=failed`,
      );
      return { ok: false, reason: 'failed' };
    }
  }

  private logCollectEnd(
    channelId: string,
    startedAt: number,
    result: CollectOneResult,
  ) {
    const ms = Date.now() - startedAt;
    const method = result.ok
      ? result.mode === 'mtproto'
        ? 'mtproto'
        : 'tme'
      : 'fail';
    const outcome = result.ok ? 'ok' : result.reason;
    this.logger.log(
      `채널 수집 끝 id=${channelId} 방식=${method} ${ms}ms 결과=${outcome}`,
    );
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

  async collectOne(
    channelInput: Channel,
    options?: { light?: boolean },
  ): Promise<CollectOneResult> {
    const channel = await this.channelRepository.findOneBy({
      id: channelInput.id,
    });
    if (!channel) {
      return { ok: false, reason: 'failed' };
    }

    const username = this.resolveUsername(channel);

    if (options?.light) {
      if (!username || !isLightCollectTarget(channel)) {
        return { ok: false, reason: 'failed' };
      }
      return this.collectPublicPreview(channel, username);
    }

    if (shouldSkipDailyCollect(channel.collectStatus)) {
      return { ok: false, reason: 'failed' };
    }

    if (isInviteOnlyLink(channel.link)) {
      return this.collectInvitePreview(channel);
    }

    if (this.mtproto.canCollect(channel)) {
      const mtprotoResult = await this.mtproto.collectAndSave(channel);
      if (mtprotoResult.ok) return mtprotoResult;
    }

    if (!username) {
      await this.markFailed(channel, 'failed', 'collect:no_username');
      return { ok: false, reason: 'failed' };
    }

    const classified = await this.classifyAccount(channel, username);
    if (classified.status === 'invalid') {
      return { ok: false, reason: 'invalid' };
    }
    if (classified.status === 'failed') {
      return { ok: false, reason: 'failed' };
    }

    const isGroup = channel.linkType === LinkType.GROUP;
    if (isGroup) {
      return this.collectGroup(channel, username);
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
    // 이번에 t.me/<username> 페이지를 읽어 정확한 회원 수를 얻었으면 미리보기의 축약값보다 우선한다
    const exact =
      classified.exactMemberCount ??
      (await this.exactMemberCountIfMoved(channel, username, parsed));
    await this.applySuccessfulCollect(channel, {
      title: parsed.title,
      memberCount: exact ?? parsed.memberCount,
      memberCountTolerance: exact != null ? 0 : parsed.memberCountTolerance,
      username: parsed.usernameFromPosts ?? username,
    });
    return { ok: true, mode: 'preview' };
  }

  /** 등록 직후: t.me 공개 페이지만 보고 first_observed_at 을 채운다 */
  async collectPublicPageNow(channelInput: Channel): Promise<CollectOneResult> {
    const channel = await this.channelRepository.findOneBy({
      id: channelInput.id,
    });
    if (!channel) {
      return { ok: false, reason: 'failed' };
    }
    if (isInviteOnlyLink(channel.link)) {
      return this.collectInvitePreview(channel);
    }
    const username = this.resolveUsername(channel);
    if (!username) {
      await this.markFailed(channel, 'failed', 'collect:no_username');
      return { ok: false, reason: 'failed' };
    }
    if (!channel.username) {
      channel.username = username;
      await this.channelRepository.save(channel);
    }
    return this.collectPublicUsernameProfile(channel, username);
  }

  /** username 이 비어 있고 공개 주소면 link 에서 채운다. full 수집 시작 전에 호출 */
  async fillMissingUsernamesFromLinks(): Promise<number> {
    const rows = await this.channelRepository.find({
      select: ['id', 'link', 'username'],
    });
    const updates = usernamesToFillFromLinks(rows);
    for (const item of updates) {
      await this.channelRepository.update(
        { id: item.id },
        { username: item.username },
      );
    }
    if (updates.length > 0) {
      this.logger.log(
        `비어 있던 username ${updates.length}건을 link 에서 채웠습니다.`,
      );
    }
    return updates.length;
  }

  private async collectPublicUsernameProfile(
    channel: Channel,
    username: string,
  ): Promise<CollectOneResult> {
    const page = await this.fetchHtml(`https://t.me/${username}`);
    if (page.error === 'fetch:timeout') {
      await this.markFailed(channel, 'failed', 'fetch:timeout');
      return { ok: false, reason: 'failed' };
    }
    if (page.status === 404 || (page.html && isMissingChannelHtml(page.html))) {
      return this.markGoneProgress(channel, 'page:not_found');
    }
    if (page.status >= 400 || !page.html) {
      await this.markFailed(
        channel,
        'failed',
        page.error ?? `page:http_${page.status || 0}`,
      );
      return { ok: false, reason: 'failed' };
    }
    if (isPrivateChannelHtml(page.html)) {
      await this.markFailed(channel, 'private', 'page:private');
      return { ok: false, reason: 'private' };
    }

    const parsed = parsePublicUsernamePage(page.html);
    if (parsed.reason === 'page:not_found') {
      return this.markGoneProgress(channel, parsed.reason);
    }
    if (parsed.kind !== 'channel' && parsed.kind !== 'group') {
      await this.markInvalid(channel, parsed.reason || 'not_channel');
      return { ok: false, reason: 'invalid' };
    }

    if (parsed.kind === 'channel') {
      const feed = await this.fetchPreviewPage(username);
      if (
        feed.html &&
        feed.status < 400 &&
        !isMissingChannelHtml(feed.html) &&
        !isPrivateChannelHtml(feed.html)
      ) {
        const preview = parseTelegramChannelHtml(feed.html);
        if (preview.hasPreview) {
          await this.upsertPosts(channel.id, preview.posts);
        }
      }
    }

    await this.applySuccessfulCollect(channel, {
      title: parsed.title,
      memberCount: parsed.memberCount,
      username,
      description: parsed.description,
      avatarUrl: parsed.avatarUrl,
      kind:
        parsed.kind === 'channel' || parsed.kind === 'group'
          ? parsed.kind
          : null,
    });
    await this.upsertTodayMemberCount(channel.id, parsed.memberCount);
    return { ok: true, mode: 'preview' };
  }

  /** t.me/s 첫 페이지만. MTProto·봇·초대방 없음 */
  private async collectPublicPreview(
    channel: Channel,
    username: string,
  ): Promise<CollectOneResult> {
    const first = await this.fetchPreviewPage(username, undefined, {
      light: true,
    });
    // 한도(429)는 채널 문제가 아니다. 상태를 바꾸지 않아 다음 회차에도 앞쪽에 남는다
    if (first.status === 429) {
      return { ok: false, reason: 'failed' };
    }
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

    const parsed = parseTelegramChannelHtml(first.html);
    if (!parsed.hasPreview) {
      // 미리보기가 막힌 채널은 full 수집(봇·MTProto)이 처리한다. 이미 수집된 채널은 failed 로 덮어쓰지 않는다
      if (shouldMarkLightNoPostsFailed(channel)) {
        await this.markFailed(channel, 'failed', 'preview:no_posts');
      } else {
        // 상태를 그대로 두면 매 light 회차 맨 앞에 다시 뽑혀 예산을 쓴다. 다음 새벽 full 로 넘긴다
        await this.channelRepository.update(channel.id, {
          nextCollectAt: nextFullWindowAt(),
        });
      }
      return { ok: false, reason: 'failed' };
    }

    await this.upsertPosts(channel.id, parsed.posts);
    // 미리보기 숫자는 "40.8K" 처럼 축약돼 있다. 저장된 정확한 값과 반올림 오차 안이면 덮어쓰지 않고,
    // 오차를 벗어나 실제로 바뀌었으면 공개 페이지에서 정확한 수를 한 번 더 읽는다
    const exactNow = await this.exactMemberCountIfMoved(
      channel,
      username,
      parsed,
    );
    await this.applySuccessfulCollect(channel, {
      title: parsed.title,
      memberCount: exactNow ?? parsed.memberCount,
      memberCountTolerance: exactNow != null ? 0 : parsed.memberCountTolerance,
      username: parsed.usernameFromPosts ?? username,
    });
    // 일별 기록에도 지켜진(정확한) 값을 남긴다
    await this.upsertTodayMemberCount(channel.id, channel.memberCount);
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
        latestMeta = {
          ...latestMeta,
          memberCount: parsed.memberCount,
          memberCountTolerance: parsed.memberCountTolerance,
        };
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
  ): Promise<ClassifyOutcome> {
    if (
      isClassifyFresh(channel.classifiedAt) &&
      (channel.classifiedKind === 'channel' ||
        channel.classifiedKind === 'group' ||
        channel.classifiedKind === 'invalid')
    ) {
      if (channel.classifiedKind === 'invalid') {
        // 이미 계정이 아니라고 판별된 채널: 판별 결과 재사용 기간이 끝날 때까지 큐에서 뒤로 민다
        channel.nextCollectAt = nextCollectAtAfterInvalid();
        await this.channelRepository.save(channel);
        return { status: 'invalid', exactMemberCount: null };
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
      return { status: 'ok', exactMemberCount: null };
    }

    const page = await this.fetchHtml(`https://t.me/${username}`);
    if (page.error === 'fetch:timeout') {
      await this.markFailed(channel, 'failed', 'fetch:timeout');
      return { status: 'failed', exactMemberCount: null };
    }
    if (page.status >= 400 && page.status !== 404) {
      await this.markFailed(
        channel,
        'failed',
        page.error ?? `fetch:http_${page.status}`,
      );
      return { status: 'failed', exactMemberCount: null };
    }
    if (!page.html) {
      await this.markFailed(channel, 'failed', page.error ?? 'fetch:empty');
      return { status: 'failed', exactMemberCount: null };
    }
    if (isPrivateChannelHtml(page.html)) {
      await this.markFailed(channel, 'private', 'page:private');
      return { status: 'failed', exactMemberCount: null };
    }

    const classified = classifyTelegramAccountHtml(page.html);
    const realTitle = classified.title?.trim() || null;
    if (
      realTitle &&
      !isTitleLocked(channel) &&
      isPlaceholderTitle(channel.title) &&
      !isPlaceholderTitle(realTitle)
    ) {
      channel.title = realTitle;
    }

    channel.classifiedKind = classified.kind;
    channel.classifiedAt = new Date();

    if (classified.kind === 'invalid') {
      await this.markInvalid(channel, classified.reason);
      return { status: 'invalid', exactMemberCount: null };
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
    // 이 페이지는 축약 없는 정확한 회원 수를 준다. 미리보기(t.me/s)의 축약값보다 우선해서 쓴다
    return {
      status: 'ok',
      exactMemberCount: parseExactMemberCountFromPage(page.html),
    };
  }

  /**
   * 공개 아이디가 있는 그룹: t.me/<username> 공개 페이지에서 제목·인원·소개를 읽는다.
   * 페이지를 못 읽을 때(한도·타임아웃·빈 응답·형식 불명)만 Bot API 로 넘긴다.
   * 초대 링크 그룹은 이 경로를 타지 않는다 (collectInvitePreview).
   */
  private async collectGroup(
    channel: Channel,
    username: string,
  ): Promise<CollectOneResult> {
    const page = await this.fetchHtml(`https://t.me/${username}`);
    if (page.status === 404 || (page.html && isMissingChannelHtml(page.html))) {
      return this.markGoneProgress(channel, 'page:not_found');
    }
    if (page.html && page.status < 400 && !isPrivateChannelHtml(page.html)) {
      const parsed = parsePublicUsernamePage(page.html);
      if (parsed.reason === 'page:not_found') {
        return this.markGoneProgress(channel, parsed.reason);
      }
      const title = parsed.title?.trim() ?? '';
      if (
        (parsed.kind === 'group' || parsed.kind === 'channel') &&
        title &&
        !isPlaceholderTitle(title)
      ) {
        await this.applySuccessfulCollect(channel, {
          title,
          memberCount: parsed.memberCount,
          username,
          description: parsed.description,
          avatarUrl: parsed.avatarUrl,
          kind: parsed.kind,
        });
        await this.upsertTodayMemberCount(channel.id, parsed.memberCount);
        return { ok: true, mode: 'preview' };
      }
    }
    return this.collectViaBot(channel, username);
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

    // 한도(429) 대기 중에는 봇을 다시 두드리지 않는다. 채널 문제가 아니므로 상태는 그대로 둔다
    if (Date.now() < this.botBlockedUntil) {
      return { ok: false, reason: 'failed' };
    }

    try {
      const chat = await this.botGetChat(token, username);
      if (!chat.ok) {
        if (isBotRateLimited(chat.errorCode, chat.description)) {
          const waitMs = parseBotRetryAfterMs(chat.description);
          this.botBlockedUntil = Date.now() + waitMs;
          this.gate.noteBot429();
          this.logger.warn(
            `봇 API 요청 한도(429). ${Math.round(waitMs / 1000)}초 동안 봇 수집을 건너뜁니다. 채널 상태는 바꾸지 않습니다.`,
          );
          return { ok: false, reason: 'failed' };
        }
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
    options?: { light?: boolean },
  ): Promise<{ status: number; html: string | null; error?: string }> {
    const url =
      before != null
        ? `https://t.me/s/${username}?before=${before}`
        : `https://t.me/s/${username}`;
    return this.fetchHtml(url, options);
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
      kind: parsed.kind,
    });
    await this.upsertMemberSnapshot(channel.id, parsed.memberCount);
    return { ok: true, mode: 'preview' };
  }

  /**
   * 미리보기 축약값이 저장된 값의 오차를 벗어났을 때만 t.me/<username> 을 읽어 정확한 회원 수를 돌려준다.
   * 못 읽으면 null(축약값을 그대로 쓴다). 요청은 전역 t.me 게이트를 그대로 탄다.
   */
  private async exactMemberCountIfMoved(
    channel: Channel,
    username: string,
    parsed: { memberCount: number | null; memberCountTolerance: number },
  ): Promise<number | null> {
    if (
      !needsExactMemberFetch({
        stored: channel.memberCount,
        observed: parsed.memberCount,
        tolerance: parsed.memberCountTolerance,
      })
    ) {
      return null;
    }
    try {
      const page = await this.fetchHtml(`https://t.me/${username}`, {
        light: true,
      });
      if (page.status >= 400 || !page.html) return null;
      return parseExactMemberCountFromPage(page.html);
    } catch {
      return null;
    }
  }

  private async fetchHtml(
    url: string,
    options?: { light?: boolean },
  ): Promise<{
    status: number;
    html: string | null;
    error?: string;
    finalUrl?: string | null;
  }> {
    const gate = this.gate;
    // light 는 1회 시도, 쿨다운 중이면 기다리지 않는다. 429 대응은 게이트(AIMD)가 맡는다
    const maxWaitMs = options?.light ? 0 : FULL_GATE_MAX_WAIT_MS;
    const attempt = async () => {
      const granted = await gate.acquire('collect', { maxWaitMs });
      if (!granted) {
        // 전역 쿨다운 중: 요청하지 않고 429 와 같게 돌려준다
        return {
          status: 429,
          retryAfter: null,
          html: null,
          finalUrl: null,
        };
      }
      try {
        const res = await fetch(url, {
          headers: TELEGRAM_FETCH_HEADERS,
          redirect: 'follow',
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        const html = await res.text();
        const retryAfter = res.headers.get('retry-after');
        gate.report({
          status: res.status,
          retryAfterMs:
            res.status === 429 ? parseRetryAfterMs(retryAfter) : undefined,
        });
        return {
          status: res.status,
          retryAfter,
          html,
          finalUrl: res.url,
        };
      } catch (error) {
        gate.report({ error: describeFetchError(error) });
        throw error;
      } finally {
        gate.release('collect');
      }
    };

    if (options?.light) {
      try {
        const result = await attempt();
        return {
          status: result.status,
          html: result.html,
          finalUrl: result.finalUrl,
          error: result.status === 429 ? 'fetch:429' : undefined,
        };
      } catch (error) {
        return {
          status: 0,
          html: null,
          finalUrl: null,
          error: describeFetchError(error),
        };
      }
    }
    return runFetchRetries(attempt, sleep);
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
      /** memberCount 의 반올림 오차. 미리보기의 축약값이면 > 0, 정확한 값이면 0(기본) */
      memberCountTolerance?: number;
      username?: string | null;
      keepUsername?: boolean;
      description?: string | null;
      avatarUrl?: string | null;
      telegramChatId?: number | null;
      kind?: 'channel' | 'group' | null;
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
      if (nextTitle && nextTitle !== channel.title && !isTitleLocked(channel)) {
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

    // 제목 고정이면 수집 제목으로 덮어쓰지 않는다(소개글은 아래에서 계속 갱신)
    applyCollectedTitle(channel, nextTitle);
    if (!keepUsername && nextUsername) channel.username = nextUsername;
    // 정확한 값을 축약값으로 덮어쓰지 않는다 (오차 범위 안이면 저장된 값 유지)
    channel.memberCount = resolveMemberCount({
      stored: channel.memberCount,
      observed: info.memberCount,
      tolerance: info.memberCountTolerance ?? 0,
    });
    if (info.description != null && info.description.trim()) {
      channel.description = info.description.trim();
    }
    if (
      info.avatarUrl &&
      !/api\.telegram\.org\/file\/bot/i.test(info.avatarUrl) &&
      !channel.avatarApproved
    ) {
      channel.avatarUrl = info.avatarUrl;
      channel.avatarApproved = true;
    }
    if (info.kind === 'channel' || info.kind === 'group') {
      const nextType =
        info.kind === 'group' ? LinkType.GROUP : LinkType.CHANNEL;
      if (channel.linkType !== nextType) {
        channel.linkType = nextType;
      }
      channel.classifiedKind = info.kind;
      channel.classifiedAt = now;
    }
    if (info.telegramChatId != null)
      channel.telegramChatId = info.telegramChatId;
    channel.lastCollectedAt = now;
    channel.collectStatus = 'ok';
    channel.collectError = null;
    channel.collectFailCount = 0;
    channel.collectGoneCount = 0;
    const weekAgo = new Date(Date.now() - SEVEN_DAYS_MS);
    const posts7d = await this.postRepository.count({
      where: {
        channelId: channel.id,
        postedAt: MoreThanOrEqual(weekAgo),
        deletedAt: IsNull(),
      },
    });
    channel.posts7d = posts7d;
    // 다음 수집 시각 = 지금 + 이 채널의 목표 간격(핫 12h · 보통 24h · 조용 48h · 휴면 72h)
    channel.nextCollectAt = nextCollectAtAfterSuccess(channel, now);
    await this.channelRepository.save(channel);
  }

  private async upsertTodayMemberCount(
    channelId: string,
    memberCount: number | null,
  ) {
    if (memberCount == null) return;
    const capturedOn = formatKstYmd();
    const existing = await this.snapshotRepository.findOne({
      where: { channelId, capturedOn },
    });
    if (existing) {
      existing.memberCount = memberCount;
      await this.snapshotRepository.save(existing);
      return;
    }
    await this.snapshotRepository.insert({
      id: crypto.randomUUID(),
      channelId,
      capturedOn,
      memberCount,
      medianViews7d: 0,
      posts7d: 0,
      forwardedRatio: 0,
      activity24h: 0,
      activity7d: 0,
    });
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
    // not_found 가 이어진 횟수. 3회면 gone (다른 실패는 세지 않는다)
    channel.collectGoneCount = (channel.collectGoneCount ?? 0) + 1;
    channel.collectError = clipCollectError(error);
    channel.lastCollectedAt = new Date();
    // 실패 간격 늘리기: 목표 간격 x (1·2·4), 최대 7일. gone 이 되면 4배로 뜸해진다
    channel.nextCollectAt = nextCollectAtAfterFailure(
      channel,
      channel.collectFailCount,
    );
    if (channel.collectGoneCount >= GONE_AFTER_FAILS) {
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
    channel.collectFailCount = (channel.collectFailCount ?? 0) + 1;
    channel.nextCollectAt = nextCollectAtAfterFailure(
      channel,
      channel.collectFailCount,
    );
    await this.channelRepository.save(channel);
  }

  private async markInvalid(channel: Channel, error: string) {
    channel.collectStatus = 'invalid';
    channel.collectError = clipCollectError(error);
    channel.lastCollectedAt = new Date();
    channel.nextCollectAt = nextCollectAtAfterInvalid();
    await this.channelRepository.save(channel);
  }

  private async markInviteExpired(channel: Channel) {
    channel.collectStatus = 'invite_expired';
    channel.collectError = clipCollectError('invite:expired');
    channel.lastCollectedAt = new Date();
    // 만료된 초대 링크는 7일 뒤에 다시 확인한다
    channel.nextCollectAt = nextCollectAtAfterInviteExpired();
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
