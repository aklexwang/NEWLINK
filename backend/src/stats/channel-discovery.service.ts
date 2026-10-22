import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, MoreThanOrEqual, Repository } from 'typeorm';
import { CategoryAiService } from '../auto-manage/category-ai.service';
import {
  ChannelImportCandidate,
  ImportCandidateStatus,
} from '../auto-manage/channel-import-candidate.entity';
import { isKoreanChannelText } from '../auto-manage/korean-channel.filter';
import { detectChannelLanguage } from '../channels/channel-language.logic';
import { Channel, ChannelStatus, LinkType } from '../channels/channel.entity';
import { AutoExposeService } from './auto-expose.service';
import { isPublicCollectable } from './collect-visibility';
import { TelegramPreviewService } from '../channels/telegram-preview.service';
import { extractTelegramUsernameFromLink } from '../channels/telegram-username';
import {
  aggregateMentionedUsernames,
  DISCOVERY_DELAY_MS,
  DISCOVERY_LOOKBACK_DAYS,
  DISCOVERY_MAX_PER_DAY,
  DISCOVERY_MIN_MEMBERS,
  DISCOVERY_RECHECK_DAYS,
  isDiscoverySourceChannel,
  type MentionAggregate,
  type MentionRow,
} from './channel-discovery.logic';
import { ChannelPost } from './channel-post.entity';
import {
  DiscoveredUsername,
  type DiscoveredUsernameResult,
} from './discovered-username.entity';
import { parseCount } from './telegram-preview-html';

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
    private readonly previewService: TelegramPreviewService,
    private readonly categoryAi: CategoryAiService,
    private readonly autoExpose: AutoExposeService,
  ) {}

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

    const queue = aggregates.filter(
      (item) => !known.has(item.username) && !recentlyChecked.has(item.username),
    );

    let checked = 0;
    let added = 0;
    const limit = Math.min(DISCOVERY_MAX_PER_DAY, queue.length);

    for (let i = 0; i < limit; i += 1) {
      if (i > 0) await sleep(DISCOVERY_DELAY_MS);
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
    item: MentionAggregate,
    channelById: Map<string, Channel>,
  ): Promise<DiscoveredUsernameResult> {
    const link = `https://t.me/${item.username}`;
    let result: DiscoveredUsernameResult = 'not_found';
    try {
      const preview = await this.previewService.fetchPreview(link);
      const title = preview.title?.trim() || null;
      const description = preview.description?.trim() || null;
      const members = parseCount(preview.memberCount);

      if (!title && !description && members == null) {
        result = 'not_found';
      } else if (!isKoreanChannelText(title, description)) {
        result = 'not_korean';
      } else if (members == null || members < DISCOVERY_MIN_MEMBERS) {
        result = 'too_small';
      } else {
        const registered = await this.autoExpose.tryRegisterInspected({
          link,
          title: title ?? item.username,
          description: description ?? '',
          memberCount: members,
          username: item.username,
          kind: 'channel',
          language: detectChannelLanguage({
            title,
            description,
          }),
          linkType: LinkType.CHANNEL,
          avatarUrl: preview.avatarUrl,
        });
        if (!registered) {
          await this.addCandidate(item, channelById, {
            link,
            title: title ?? item.username,
            description,
            members,
            avatarUrl: preview.avatarUrl,
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

  private async addCandidate(
    item: MentionAggregate,
    channelById: Map<string, Channel>,
    info: {
      link: string;
      title: string;
      description: string | null;
      members: number;
      avatarUrl: string | null;
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
      linkType: LinkType.CHANNEL,
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
    return new Set(rows.map((row) => row.username.toLowerCase()));
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
