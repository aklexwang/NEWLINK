import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, MoreThanOrEqual, Repository } from 'typeorm';
import { CategoryAiService } from '../auto-manage/category-ai.service';
import {
  ChannelImportCandidate,
  ImportCandidateStatus,
} from '../auto-manage/channel-import-candidate.entity';
import { Channel, ChannelStatus, LinkType } from '../channels/channel.entity';
import { AutoExposeService } from './auto-expose.service';
import {
  classifyAdminInspectPage,
  toChannelLanguage,
} from '../admin/admin-inspect.logic';
import { isPublicCollectable } from './collect-visibility';
import { hasIllegalDrugSuspicion } from '../channels/illegal-content.logic';
import { extractTelegramUsernameFromLink } from '../channels/telegram-username';
import {
  aggregateMentionedUsernames,
  DISCOVERY_DELAY_MS,
  DISCOVERY_LOOKBACK_DAYS,
  DISCOVERY_MAX_PER_DAY,
  DISCOVERY_MIN_MEMBERS,
  DISCOVERY_RECHECK_DAYS,
  DISCOVERY_SOURCE_KEYWORD,
  DISCOVERY_SOURCE_OTHER,
  DISCOVERY_SOURCE_LINKED,
  DISCOVERY_SOURCE_SNOWBALL,
  isDiscoverySourceChannel,
  mergeDiscoveryQueue,
  parseQueuedDailyMax,
  persistDiscoverySource,
  splitDiscoveryDeadlines,
  type DiscoveryQueueItem,
  type MentionRow,
  type QueuedDiscoveryRow,
} from './channel-discovery.logic';
import { formatKstYmd } from './channel-metrics.math';
import { isCollectBudgetOver } from './collect-budget.logic';
import { ChannelPost } from './channel-post.entity';
import {
  DiscoveredUsername,
  type DiscoveredUsernameResult,
} from './discovered-username.entity';
import {
  excerptsFromPreviewPosts,
  publicInspectDecision,
  toDiscoveryResult,
} from './public-channel-inspect.logic';
import { createPublicTelegramFetcher } from './public-telegram-fetch.logic';
import {
  isPrivateChannelHtml,
  parsePublicUsernamePage,
  parseTelegramChannelHtml,
} from './telegram-preview-html';

export type DiscoveryRunResult = {
  checked: number;
  added: number;
};

@Injectable()
export class ChannelDiscoveryService {
  private readonly logger = new Logger(ChannelDiscoveryService.name);

  constructor(
    @InjectRepository(ChannelPost)
    private readonly postRepository: Repository<ChannelPost>,
    @InjectRepository(Channel)
    private readonly channelRepository: Repository<Channel>,
    @InjectRepository(ChannelImportCandidate)
    private readonly candidateRepository: Repository<ChannelImportCandidate>,
    @InjectRepository(DiscoveredUsername)
    private readonly discoveredRepository: Repository<DiscoveredUsername>,
    private readonly categoryAi: CategoryAiService,
    private readonly autoExpose: AutoExposeService,
  ) {}

  private readonly publicFetch = createPublicTelegramFetcher();

  async discover(options?: {
    deadlineMs?: number;
  }): Promise<DiscoveryRunResult> {
    const lookback = new Date(
      Date.now() - DISCOVERY_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
    );
    const posts = await this.postRepository.find({
      where: { postedAt: MoreThanOrEqual(lookback) },
    });
    const channels = await this.channelRepository.find();
    const sourceChannels = channels.filter(
      (ch) => isPublicCollectable(ch) && isDiscoverySourceChannel(ch.linkType),
    );
    const channelById = new Map(sourceChannels.map((ch) => [ch.id, ch]));
    const usablePosts = posts.filter((post) => channelById.has(post.channelId));

    const rows: MentionRow[] = usablePosts.map((post) => {
      const source = channelById.get(post.channelId);
      return {
        sourceChannelId: post.channelId,
        sourceUsername:
          source?.username ??
          extractTelegramUsernameFromLink(source?.link ?? null),
        forwardedFrom: post.forwardedFrom,
        mentionedUsernames: post.mentionedUsernames,
      };
    });

    const aggregates = aggregateMentionedUsernames(rows);
    const known = await this.knownUsernames(channels);
    const recentlyChecked = await this.recentlyCheckedUsernames();
    const queuedRows = await this.takeQueuedForInspect(
      this.registeredUsernames(channels),
    );

    const queue = mergeDiscoveryQueue(
      aggregates,
      queuedRows,
      known,
      recentlyChecked,
    );
    const mentions = queue.filter((item) => item.source === 'mention');
    const queued = queue.filter((item) => item.source !== 'mention');
    const { mentionDeadlineMs, queuedDeadlineMs } = splitDiscoveryDeadlines(
      options?.deadlineMs,
    );

    let checked = 0;
    let added = 0;
    const snowballRemain = Math.max(
      0,
      DISCOVERY_MAX_PER_DAY - (await this.countSnowballToday()),
    );
    const queuedRemain = Math.max(
      0,
      parseQueuedDailyMax(process.env.DISCOVERY_QUEUED_MAX_PER_DAY) -
        (await this.countQueuedInspectToday()),
    );

    const inspectBatch = async (
      items: DiscoveryQueueItem[],
      remain: number,
      deadlineMs: number | undefined,
      label: string,
    ) => {
      const limit = Math.min(remain, items.length);
      for (let i = 0; i < limit; i += 1) {
        if (i > 0 && isCollectBudgetOver(deadlineMs)) {
          this.logger.log(
            `${label} 시간 예산이 끝나 다음부터 남깁니다. 남은 ${limit - i}건`,
          );
          break;
        }
        const result = await this.inspectOne(items[i], channelById);
        checked += 1;
        if (result === 'added') added += 1;
        if (i < limit - 1 && !isCollectBudgetOver(deadlineMs)) {
          await sleep(DISCOVERY_DELAY_MS);
        }
      }
    };

    await inspectBatch(
      mentions,
      snowballRemain,
      mentionDeadlineMs,
      '눈덩이 발견',
    );
    await inspectBatch(queued, queuedRemain, queuedDeadlineMs, '대기열 검사');

    this.logger.log(
      `발견 끝: 검사 ${checked} / 추가 ${added} (언급 ${mentions.length}, 대기 ${queued.length})`,
    );
    return { checked, added };
  }

  /** 비공개 초대 링크(+해시) 검사: 초대 페이지를 읽어 한국어·회원 수 조건이면 자동 등록 */
  private async inspectInvite(
    item: DiscoveryQueueItem,
  ): Promise<DiscoveredUsernameResult> {
    const link = `https://t.me/${item.username}`;
    let result: DiscoveredUsernameResult = 'not_found';
    try {
      const page = await this.publicFetch.fetchHtml(link);
      const inspected = classifyAdminInspectPage({
        html: page.html,
        status: page.status,
        isInvite: true,
        finalUrl: page.finalUrl,
      });
      if (inspected.result === 'ok' && inspected.title) {
        const linkType =
          inspected.linkType === 'group' ? LinkType.GROUP : LinkType.CHANNEL;
        const registered = await this.autoExpose.tryRegisterInspected(
          {
            link,
            title: inspected.title,
            description: inspected.description ?? '',
            memberCount: inspected.memberCount,
            username: null,
            kind: linkType === LinkType.GROUP ? 'group' : 'channel',
            language: toChannelLanguage(inspected.language) ?? 'unknown',
            linkType,
            avatarUrl: inspected.avatarUrl,
          },
          { skipCollect: true },
        );
        if (registered) {
          result = 'added';
        } else {
          const dup = await this.channelRepository.exist({ where: { link } });
          result = dup
            ? 'already_registered'
            : (inspected.memberCount ?? 0) < DISCOVERY_MIN_MEMBERS
              ? 'too_small'
              : 'not_korean';
        }
      } else if (inspected.result === 'invite_or_private') {
        result = 'invite_or_private';
      } else {
        result =
          inspected.result === 'language_unknown'
            ? 'not_korean'
            : inspected.result === 'not_korean' ||
                inspected.result === 'too_small' ||
                inspected.result === 'already_registered'
              ? inspected.result
              : 'not_found';
      }
    } catch (error) {
      this.logger.warn(
        `초대 링크 검사 실패: ${error instanceof Error ? error.message : error}`,
      );
      result = 'not_found';
    }
    await this.discoveredRepository.upsert(
      {
        username: item.username,
        result,
        checkedAt: new Date(),
        mentionCount: item.mentionCount,
        source: 'invite',
      },
      ['username'],
    );
    return result;
  }

  private async inspectOne(
    item: DiscoveryQueueItem,
    channelById: Map<string, Channel>,
  ): Promise<DiscoveredUsernameResult> {
    if (item.username.startsWith('+')) return this.inspectInvite(item);
    const link = `https://t.me/${item.username}`;
    let result: DiscoveredUsernameResult = 'not_found';
    try {
      const preview = await this.loadPreview(item.username);
      if (!preview) {
        result = 'not_found';
      } else if (preview.decision.result === 'ok') {
        const registered = await this.autoExpose.tryRegisterInspected(
          {
            link,
            title: preview.title ?? item.username,
            description: preview.description ?? '',
            memberCount: preview.members,
            username: item.username,
            kind: preview.kind,
            language: preview.decision.language,
            linkType:
              preview.decision.linkType === 'group'
                ? LinkType.GROUP
                : LinkType.CHANNEL,
            avatarUrl: preview.avatarUrl,
          },
          { skipCollect: true },
        );
        if (!registered) {
          await this.addCandidate(item, channelById, {
            link,
            title: preview.title ?? item.username,
            description: preview.description,
            members: preview.members ?? DISCOVERY_MIN_MEMBERS,
            avatarUrl: preview.avatarUrl,
            linkType:
              preview.decision.linkType === 'group'
                ? LinkType.GROUP
                : LinkType.CHANNEL,
          });
        }
        result = 'added';
      } else {
        // 자동 발견은 사람이 확인하지 않으므로 언어 미확인도 한국어 아님으로 둔다
        const mapped = toDiscoveryResult(preview.decision.result);
        result = mapped === 'ok' ? 'not_found' : mapped;
      }
    } catch (error) {
      this.logger.warn(
        `발견 검사 실패(@${item.username}): ${error instanceof Error ? error.message : error}`,
      );
      result = 'not_found';
    }

    await this.discoveredRepository.upsert(
      {
        username: item.username,
        result,
        checkedAt: new Date(),
        mentionCount: item.mentionCount,
        source: persistDiscoverySource(item.source),
      },
      ['username'],
    );
    return result;
  }

  private async loadPreview(username: string): Promise<{
    title: string | null;
    description: string | null;
    members: number | null;
    kind: 'channel' | 'group';
    avatarUrl: string | null;
    decision: ReturnType<typeof publicInspectDecision>;
  } | null> {
    const page = await this.publicFetch.fetchHtml(`https://t.me/${username}`);
    if (!page.html || page.status >= 400) return null;
    if (isPrivateChannelHtml(page.html)) {
      return {
        title: null,
        description: null,
        members: null,
        kind: 'channel',
        avatarUrl: null,
        decision: {
          result: 'invite_or_private',
          language: 'unknown',
          linkType: 'channel',
          kind: 'unknown',
        },
      };
    }
    const parsed = parsePublicUsernamePage(page.html);
    if (parsed.kind !== 'channel' && parsed.kind !== 'group') return null;
    let excerpts: string[] = [];
    if (parsed.kind === 'channel') {
      const feed = await this.publicFetch.fetchHtml(
        `https://t.me/s/${username}`,
      );
      if (feed.html) {
        excerpts = excerptsFromPreviewPosts(
          parseTelegramChannelHtml(feed.html).posts,
        );
      }
    }
    const decision = publicInspectDecision({
      kind: parsed.kind,
      title: parsed.title,
      description: parsed.description,
      memberCount: parsed.memberCount,
      avatarUrl: parsed.avatarUrl,
      excerpts,
    });
    return {
      title: parsed.title,
      description: parsed.description,
      members: parsed.memberCount,
      kind: parsed.kind,
      avatarUrl: parsed.avatarUrl,
      decision,
    };
  }

  private async addCandidate(
    item: DiscoveryQueueItem,
    channelById: Map<string, Channel>,
    info: {
      link: string;
      title: string;
      description: string | null;
      members: number;
      avatarUrl: string | null;
      linkType?: LinkType;
    },
  ) {
    const existing = await this.candidateRepository.findOne({
      where: { link: info.link },
    });
    if (existing) return;
    const username = extractTelegramUsernameFromLink(info.link);
    if (username && (await this.hasActiveUsername(username))) return;
    if (hasIllegalDrugSuspicion(info.title, info.description)) return;

    const classified = await this.categoryAi.classify({
      title: info.title,
      description: info.description ?? undefined,
      allowedCategories: await this.categoryAi.categoryNames(),
    });
    const sources = item.sourceChannelIds
      .map((id) => {
        const ch = channelById.get(id);
        return (
          ch?.username?.replace(/^@/, '').toLowerCase() ||
          extractTelegramUsernameFromLink(ch?.link ?? null)
        );
      })
      .filter((name): name is string => Boolean(name))
      .slice(0, 3);

    const candidate = this.candidateRepository.create({
      link: info.link,
      title: info.title.slice(0, 255),
      category: classified.category,
      categoryAiSuggested: classified.category,
      categoryConfidence: classified.confidence,
      categoryReviewed: false,
      categorySource: 'discovery',
      discoverySources: sources.length > 0 ? sources.join(',') : null,
      linkType: info.linkType ?? LinkType.CHANNEL,
      participantsCount: info.members,
      avatarUrl: info.avatarUrl?.slice(0, 1024) ?? null,
      source: 'discovery',
      status: ImportCandidateStatus.PENDING,
    });
    await this.candidateRepository.save(candidate);
  }

  private async hasActiveUsername(username: string): Promise<boolean> {
    const u = username.replace(/^@/, '').trim().toLowerCase();
    if (!u) return false;
    const count = await this.channelRepository
      .createQueryBuilder('channel')
      .where('channel.status = :status', { status: ChannelStatus.ACTIVE })
      .andWhere('LOWER(channel.username) = :u', { u })
      .getCount();
    return count > 0;
  }

  private async knownUsernames(channels: Channel[]): Promise<Set<string>> {
    const known = new Set<string>();
    for (const ch of channels) {
      if (ch.status !== ChannelStatus.ACTIVE) continue;
      const fromCol = ch.username?.replace(/^@/, '').trim().toLowerCase();
      if (fromCol) known.add(fromCol);
      const fromLink = extractTelegramUsernameFromLink(ch.link);
      if (fromLink) known.add(fromLink);
    }
    const candidates = await this.candidateRepository.find({
      select: ['link'],
    });
    for (const item of candidates) {
      const u = extractTelegramUsernameFromLink(item.link);
      if (u) known.add(u);
    }
    return known;
  }

  async countSnowballToday(now = new Date()): Promise<number> {
    const start = new Date(`${formatKstYmd(now)}T00:00:00+09:00`);
    return this.discoveredRepository
      .createQueryBuilder('row')
      .where('row.checked_at >= :start', { start })
      .andWhere('row.source = :source', { source: DISCOVERY_SOURCE_SNOWBALL })
      .andWhere("row.result <> 'queued'")
      .getCount();
  }

  async countQueuedInspectToday(now = new Date()): Promise<number> {
    const start = new Date(`${formatKstYmd(now)}T00:00:00+09:00`);
    return this.discoveredRepository
      .createQueryBuilder('row')
      .where('row.checked_at >= :start', { start })
      .andWhere('row.source IN (:...sources)', {
        sources: [
          DISCOVERY_SOURCE_KEYWORD,
          DISCOVERY_SOURCE_OTHER,
          DISCOVERY_SOURCE_LINKED,
        ],
      })
      .andWhere("row.result <> 'queued'")
      .getCount();
  }

  queuedDailyMax() {
    return parseQueuedDailyMax(process.env.DISCOVERY_QUEUED_MAX_PER_DAY);
  }

  private async recentlyCheckedUsernames(): Promise<Set<string>> {
    const cutoff = new Date(
      Date.now() - DISCOVERY_RECHECK_DAYS * 24 * 60 * 60 * 1000,
    );
    const recent = await this.discoveredRepository.find({
      where: { checkedAt: MoreThan(cutoff) },
    });
    const discarded = await this.discoveredRepository.find({
      where: { result: 'discarded' },
      select: ['username'],
    });
    return new Set([
      ...recent
        .filter((row) => row.result !== 'queued')
        .map((row) => row.username.toLowerCase()),
      ...discarded.map((row) => row.username.toLowerCase()),
    ]);
  }

  private registeredUsernames(channels: Channel[]): Set<string> {
    const known = new Set<string>();
    for (const ch of channels) {
      if (ch.status !== ChannelStatus.ACTIVE) continue;
      const fromCol = ch.username?.replace(/^@/, '').trim().toLowerCase();
      if (fromCol) known.add(fromCol);
      const fromLink = extractTelegramUsernameFromLink(ch.link);
      if (fromLink) known.add(fromLink);
    }
    return known;
  }

  private async takeQueuedForInspect(
    registered: Set<string>,
  ): Promise<QueuedDiscoveryRow[]> {
    const rows = await this.discoveredRepository.find({
      where: { result: 'queued' },
    });
    const inspectable: QueuedDiscoveryRow[] = [];
    for (const row of rows) {
      // 비공개 초대 링크(+해시)는 대소문자가 다르면 다른 링크라 그대로 둔다
      const username = row.username.startsWith('+')
        ? row.username.trim()
        : row.username.replace(/^@/, '').trim().toLowerCase();
      if (registered.has(username)) {
        row.result = 'already_registered';
        row.checkedAt = new Date();
        await this.discoveredRepository.save(row);
        continue;
      }
      inspectable.push({ username, source: row.source });
    }
    return inspectable;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
