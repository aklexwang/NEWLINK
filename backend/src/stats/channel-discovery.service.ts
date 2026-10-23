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
import { isPublicCollectable } from './collect-visibility';
import { extractTelegramUsernameFromLink } from '../channels/telegram-username';
import {
  aggregateMentionedUsernames,
  DISCOVERY_LOOKBACK_DAYS,
  DISCOVERY_MAX_PER_DAY,
  DISCOVERY_MIN_MEMBERS,
  DISCOVERY_RECHECK_DAYS,
  isDiscoverySourceChannel,
  mergeDiscoveryQueue,
  type DiscoveryQueueItem,
  type MentionRow,
} from './channel-discovery.logic';
import { ChannelPost } from './channel-post.entity';
import {
  DiscoveredUsername,
  type DiscoveredUsernameResult,
} from './discovered-username.entity';
import {
  excerptsFromPreviewPosts,
  publicInspectDecision,
} from './public-channel-inspect.logic';
import { createPublicTelegramFetcher } from './public-telegram-fetch.logic';
import {
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

  async discover(): Promise<DiscoveryRunResult> {
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
    const keywordQueued = await this.keywordQueuedUsernames();

    const queue = mergeDiscoveryQueue(
      aggregates,
      keywordQueued,
      known,
      recentlyChecked,
    );

    let checked = 0;
    let added = 0;
    const limit = Math.min(DISCOVERY_MAX_PER_DAY, queue.length);

    for (let i = 0; i < limit; i += 1) {
      const item = queue[i];
      const result = await this.inspectOne(item, channelById);
      checked += 1;
      if (result === 'added') added += 1;
    }

    this.logger.log(
      `눈덩이 발견 끝: 검사 ${checked} / 추가 ${added} (후보 ${queue.length})`,
    );
    return { checked, added };
  }

  private async inspectOne(
    item: DiscoveryQueueItem,
    channelById: Map<string, Channel>,
  ): Promise<DiscoveredUsernameResult> {
    const link = `https://t.me/${item.username}`;
    let result: DiscoveredUsernameResult = 'not_found';
    try {
      const preview = await this.loadPreview(item.username);
      if (!preview) {
        result = 'not_found';
      } else if (preview.decision.result !== 'ok') {
        result = preview.decision.result;
      } else {
        const registered = await this.autoExpose.tryRegisterInspected(
          {
            link,
            title: preview.title ?? item.username,
            description: preview.description ?? '',
            memberCount: preview.members,
            username: item.username,
            kind: preview.kind,
            language: preview.decision.language,
            linkType: preview.decision.linkType,
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
            linkType: preview.decision.linkType,
          });
        }
        result = 'added';
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

    const classified = await this.categoryAi.classify({
      title: info.title,
      description: info.description ?? undefined,
      allowedCategories: this.categoryAi.defaultCategoryNames(),
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

  private async recentlyCheckedUsernames(): Promise<Set<string>> {
    const cutoff = new Date(
      Date.now() - DISCOVERY_RECHECK_DAYS * 24 * 60 * 60 * 1000,
    );
    const rows = await this.discoveredRepository.find({
      where: { checkedAt: MoreThan(cutoff) },
    });
    return new Set(
      rows
        .filter((row) => row.result !== 'queued')
        .map((row) => row.username.toLowerCase()),
    );
  }

  private async keywordQueuedUsernames(): Promise<string[]> {
    const rows = await this.discoveredRepository.find({
      where: { result: 'queued' },
    });
    return rows.map((row) => row.username.toLowerCase());
  }
}
