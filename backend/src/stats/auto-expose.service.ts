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
import { hasIllegalDrugSuspicion } from '../channels/illegal-content.logic';
import { ChannelsService } from '../channels/channels.service';
import { TelegramPreviewService } from '../channels/telegram-preview.service';
import { applyCollectedTitle } from '../channels/title-lock.logic';
import { extractTelegramUsernameFromLink } from '../channels/telegram-username';
import { ChannelCategoryService } from './channel-category.service';
import { ChannelCollectorService } from './channel-collector.service';

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
    const memberCount = preview.memberCount;
    const title = preview.title?.trim() || username || normalized;
    const description = preview.description?.trim() || '';
    const kind: AutoExposeKind =
      preview.kind === 'channel' || preview.kind === 'group'
        ? preview.kind
        : preview.title
          ? 'unknown'
          : 'invalid';
    const linkType =
      preview.kind === 'group' ? LinkType.GROUP : LinkType.CHANNEL;

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
      const match = await this.channelsService.findDuplicate(inspected.link);
      const check = canAutoExpose({
        kind: inspected.kind,
        language: inspected.language,
        memberCount: inspected.memberCount,
        hasActiveUsername: match?.kind === 'active',
      });
      if (!check.ok) return false;
      if (hasIllegalDrugSuspicion(inspected.title, inspected.description)) {
        return false;
      }
      // 거절된 행은 자동으로 되살리지 않는다
      if (match?.kind === 'rejected') return false;

      let channel: Channel | null = match?.channel ?? null;
      if (channel) {
        if (channel.status !== ChannelStatus.ACTIVE) {
          channel = await this.activateIfEligible(channel, inspected, true);
        }
      } else {
        channel = await this.channelsService.createByAdmin(
          {
            title: inspected.title,
            link: inspected.link,
            linkType: inspected.linkType,
            category: candidate.category || PENDING_CATEGORY,
            description: inspected.description || inspected.title,
          },
          { skipPublicCollect: true },
        );
        channel.autoRegistered = true;
        channel.language = inspected.language;
        channel.memberCount = inspected.memberCount;
        channel.username =
          inspected.username ?? extractTelegramUsernameFromLink(channel.link);
        channel = await this.channelRepository.save(channel);
        await this.afterActivate(channel);
      }
      if (!channel) return false;

      candidate.status = ImportCandidateStatus.PUBLISHED;
      candidate.publishedChannelId = channel.id;
      candidate.publishedAt = new Date();
      candidate.participantsCount =
        inspected.memberCount ?? candidate.participantsCount;
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
    const match = await this.channelsService.findDuplicate(inspected.link);
    const check = canAutoExpose({
      kind: inspected.kind,
      language: inspected.language,
      memberCount: inspected.memberCount,
      hasActiveUsername: match?.kind === 'active',
    });
    if (!check.ok) return false;
    if (hasIllegalDrugSuspicion(inspected.title, inspected.description)) {
      return false;
    }
    if (match) return false;

    let channel = await this.channelsService.createByAdmin(
      {
        title: inspected.title,
        link: inspected.link,
        linkType: inspected.linkType,
        category: '기타',
        description: inspected.description || inspected.title,
      },
      { skipPublicCollect: true },
    );
    channel.autoRegistered = true;
    channel.language = inspected.language;
    channel.memberCount = inspected.memberCount;
    channel.username =
      inspected.username ?? extractTelegramUsernameFromLink(channel.link);
    channel = await this.channelRepository.save(channel);
    await this.afterActivate(channel, options?.skipCollect === true);
    return true;
  }

  private async activateIfEligible(
    channel: Channel,
    inspected: InspectedAccount,
    autoRegistered: boolean,
  ): Promise<Channel | null> {
    const other = await this.channelsService.findDuplicate(inspected.link, {
      excludeId: channel.id,
    });
    const hasDup = other?.kind === 'active';
    const check = canAutoExpose({
      kind: inspected.kind,
      language: inspected.language,
      memberCount: inspected.memberCount,
      hasActiveUsername: hasDup,
    });
    if (!check.ok) return null;
    if (hasIllegalDrugSuspicion(inspected.title, inspected.description)) {
      return null;
    }

    channel.status = ChannelStatus.ACTIVE;
    channel.language = inspected.language;
    channel.memberCount = inspected.memberCount;
    channel.username =
      inspected.username ?? extractTelegramUsernameFromLink(channel.link);
    channel.linkType = inspected.linkType;
    applyCollectedTitle(channel, inspected.title);
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
        await this.collector.collectPublicPageNow(channel);
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
}
