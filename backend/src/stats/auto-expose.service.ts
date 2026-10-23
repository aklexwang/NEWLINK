import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ChannelImportCandidate,
  ImportCandidateStatus,
} from '../auto-manage/channel-import-candidate.entity';
import {
  canAutoExpose,
  PENDING_CATEGORY,
  type AutoExposeKind,
} from '../channels/auto-expose.logic';
import {
  Channel,
  ChannelStatus,
  LinkType,
  type ChannelLanguage,
} from '../channels/channel.entity';
import { detectChannelLanguage } from '../channels/channel-language.logic';
import { ChannelsService } from '../channels/channels.service';
import { TelegramPreviewService } from '../channels/telegram-preview.service';
import {
  extractTelegramUsernameFromLink,
  isInviteOnlyLink,
} from '../channels/telegram-username';
import { ChannelCategoryService } from './channel-category.service';
import { ChannelCollectorService } from './channel-collector.service';
import {
  classifyTelegramAccountHtml,
  parseCount,
  parseInviteLinkHtml,
  TELEGRAM_FETCH_HEADERS,
} from './telegram-preview-html';

const FETCH_TIMEOUT_MS = 12_000;

export type InspectedAccount = {
  link: string;
  title: string;
  description: string;
  memberCount: number | null;
  username: string | null;
  kind: AutoExposeKind;
  language: ChannelLanguage;
  linkType: LinkType;
  avatarUrl: string | null;
};

@Injectable()
export class AutoExposeService {
  private readonly logger = new Logger(AutoExposeService.name);

  constructor(
    @InjectRepository(Channel)
    private readonly channelRepository: Repository<Channel>,
    @InjectRepository(ChannelImportCandidate)
    private readonly candidateRepository: Repository<ChannelImportCandidate>,
    @Inject(forwardRef(() => ChannelsService))
    private readonly channelsService: ChannelsService,
    private readonly previewService: TelegramPreviewService,
    private readonly collector: ChannelCollectorService,
    private readonly categoryService: ChannelCategoryService,
  ) {}

  async inspectLink(link: string): Promise<InspectedAccount> {
    const normalized = this.channelsService.normalizeTelegramLink(link);
    const preview = await this.previewService.fetchPreview(normalized);
    const username = extractTelegramUsernameFromLink(normalized);
    let kind: AutoExposeKind = 'unknown';
    let memberCount = parseCount(preview.memberCount);
    let title = preview.title?.trim() || username || normalized;
    let description = preview.description?.trim() || '';
    let linkType = LinkType.CHANNEL;

    if (isInviteOnlyLink(normalized)) {
      const page = await this.fetchPage(normalized);
      if (page.html) {
        const parsed = parseInviteLinkHtml(page.html, page.finalUrl);
        kind = parsed.expired ? 'invalid' : 'group';
        if (parsed.title) title = parsed.title;
        if (parsed.description) description = parsed.description;
        if (parsed.memberCount != null) memberCount = parsed.memberCount;
      } else {
        kind = 'unknown';
      }
      linkType = LinkType.GROUP;
    } else if (username) {
      const page = await this.fetchPage(`https://t.me/${username}`);
      if (page.html) {
        const classified = classifyTelegramAccountHtml(page.html);
        kind = classified.kind;
        if (classified.title) title = classified.title;
        if (classified.kind === 'group') linkType = LinkType.GROUP;
        if (classified.kind === 'channel') linkType = LinkType.CHANNEL;
      }
    }

    const language = detectChannelLanguage({
      title,
      description,
    });

    return {
      link: normalized,
      title,
      description,
      memberCount,
      username,
      kind,
      language,
      linkType,
      avatarUrl: preview.avatarUrl,
    };
  }

  async tryPromoteSubmission(channel: Channel): Promise<Channel> {
    try {
      const inspected = await this.inspectLink(channel.link);
      const promoted = await this.activateIfEligible(channel, inspected, true);
      return promoted ?? channel;
    } catch (error) {
      this.logger.warn(
        `제보 자동 노출 실패(${channel.id}): ${error instanceof Error ? error.message : error}`,
      );
      return channel;
    }
  }

  async tryRegisterCandidate(
    candidate: ChannelImportCandidate,
  ): Promise<boolean> {
    if (candidate.status !== ImportCandidateStatus.PENDING) return false;
    try {
      const inspected = await this.inspectLink(candidate.link);
      if (inspected.memberCount == null && candidate.participantsCount > 0) {
        inspected.memberCount = candidate.participantsCount;
      }
      const dup = inspected.username
        ? await this.channelsService.findActiveByUsername(inspected.username)
        : await this.channelsService.findActiveDuplicate(inspected.link);
      const check = canAutoExpose({
        kind: inspected.kind,
        language: inspected.language,
        memberCount: inspected.memberCount,
        hasActiveUsername: Boolean(dup),
      });
      if (!check.ok) return false;

      let channel =
        (await this.channelsService.findByLink(inspected.link)) ?? null;
      if (channel) {
        if (channel.status !== ChannelStatus.ACTIVE) {
          channel = await this.activateIfEligible(channel, inspected, true);
        }
      } else {
        channel = await this.channelsService.createByAdmin({
          title: inspected.title,
          link: inspected.link,
          linkType: inspected.linkType,
          category: candidate.category || PENDING_CATEGORY,
          description: inspected.description || inspected.title,
        });
        channel.autoRegistered = true;
        channel.language = inspected.language;
        channel.memberCount = inspected.memberCount;
        if (inspected.username) channel.username = inspected.username;
        channel = await this.channelRepository.save(channel);
        await this.afterActivate(channel);
      }
      if (!channel) return false;

      candidate.status = ImportCandidateStatus.PUBLISHED;
      candidate.publishedChannelId = channel.id;
      candidate.publishedAt = new Date();
      candidate.participantsCount = inspected.memberCount ?? candidate.participantsCount;
      await this.candidateRepository.save(candidate);
      return true;
    } catch (error) {
      this.logger.warn(
        `후보 자동 등록 실패(${candidate.link}): ${error instanceof Error ? error.message : error}`,
      );
      return false;
    }
  }

  async tryRegisterInspected(
    inspected: InspectedAccount,
    options?: { skipCollect?: boolean },
  ): Promise<boolean> {
    const dup = inspected.username
      ? await this.channelsService.findActiveByUsername(inspected.username)
      : await this.channelsService.findActiveDuplicate(inspected.link);
    const check = canAutoExpose({
      kind: inspected.kind,
      language: inspected.language,
      memberCount: inspected.memberCount,
      hasActiveUsername: Boolean(dup),
    });
    if (!check.ok) return false;
    if (await this.channelsService.findByLink(inspected.link)) return false;

    let channel = await this.channelsService.createByAdmin({
      title: inspected.title,
      link: inspected.link,
      linkType: inspected.linkType,
      category: '기타',
      description: inspected.description || inspected.title,
    });
    channel.autoRegistered = true;
    channel.language = inspected.language;
    channel.memberCount = inspected.memberCount;
    if (inspected.username) channel.username = inspected.username;
    channel = await this.channelRepository.save(channel);
    await this.afterActivate(channel, options?.skipCollect === true);
    return true;
  }

  private async activateIfEligible(
    channel: Channel,
    inspected: InspectedAccount,
    autoRegistered: boolean,
  ): Promise<Channel | null> {
    const other = inspected.username
      ? await this.channelsService.findActiveByUsername(inspected.username)
      : null;
    const hasDup = Boolean(other && other.id !== channel.id);
    const check = canAutoExpose({
      kind: inspected.kind,
      language: inspected.language,
      memberCount: inspected.memberCount,
      hasActiveUsername: hasDup,
    });
    if (!check.ok) return null;

    channel.status = ChannelStatus.ACTIVE;
    channel.language = inspected.language;
    channel.memberCount = inspected.memberCount;
    if (inspected.username) channel.username = inspected.username;
    channel.linkType = inspected.linkType;
    if (inspected.title) channel.title = inspected.title;
    if (inspected.description) channel.description = inspected.description;
    channel.autoRegistered = autoRegistered;
    channel.isVisible = channel.isVisible !== false;
    const saved = await this.channelRepository.save(channel);
    await this.afterActivate(saved);
    return saved;
  }

  private async afterActivate(channel: Channel, skipCollect = false) {
    if (!skipCollect) {
      try {
        await this.collector.collectOne(channel);
      } catch (error) {
        this.logger.warn(
          `자동 등록 직후 수집 실패(${channel.id}): ${error instanceof Error ? error.message : error}`,
        );
      }
    }
    const fresh = await this.channelRepository.findOneBy({ id: channel.id });
    if (fresh && !fresh.categoryLocked) {
      await this.categoryService.classifyOne(fresh);
    }
  }

  private async fetchPage(
    url: string,
  ): Promise<{ html: string | null; finalUrl: string | null }> {
    try {
      const res = await fetch(url, {
        headers: TELEGRAM_FETCH_HEADERS,
        redirect: 'follow',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      const html = await res.text();
      return { html, finalUrl: res.url };
    } catch {
      return { html: null, finalUrl: null };
    }
  }
}
