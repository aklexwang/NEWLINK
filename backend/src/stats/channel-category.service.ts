import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CategoryAiService } from '../auto-manage/category-ai.service';
import {
  isWeeklyReclassifyTarget,
  PENDING_CATEGORY,
  resolveCategoryWithConfidence,
} from '../channels/auto-expose.logic';
import { Channel, ChannelStatus, LinkType } from '../channels/channel.entity';
import { LANGUAGE_POST_LIMIT } from '../channels/channel-language.logic';
import { ChannelEvent } from './channel-event.entity';
import { ChannelPost } from './channel-post.entity';

@Injectable()
export class ChannelCategoryService {
  private readonly logger = new Logger(ChannelCategoryService.name);

  constructor(
    @InjectRepository(Channel)
    private readonly channelRepository: Repository<Channel>,
    @InjectRepository(ChannelPost)
    private readonly postRepository: Repository<ChannelPost>,
    @InjectRepository(ChannelEvent)
    private readonly eventRepository: Repository<ChannelEvent>,
    private readonly categoryAi: CategoryAiService,
  ) {}

  async classifyOne(channel: Channel): Promise<Channel> {
    if (channel.categoryLocked) return channel;
    const posts =
      channel.linkType === LinkType.GROUP
        ? []
        : await this.postRepository.find({
            where: { channelId: channel.id },
            order: { postedAt: 'DESC' },
            take: LANGUAGE_POST_LIMIT,
          });
    const allowed = this.categoryAi
      .defaultCategoryNames()
      .filter((name) => name !== PENDING_CATEGORY);
    const classified = await this.categoryAi.classify({
      title: channel.title,
      description: channel.description,
      posts: posts
        .map((p) => p.textExcerpt)
        .filter((text): text is string => Boolean(text)),
      allowedCategories: allowed,
    });
    const resolved = resolveCategoryWithConfidence(
      classified.category,
      classified.confidence,
    );
    const prev = channel.category;
    channel.category = resolved.category;
    channel.categoryConfidence = classified.confidence;
    if (prev !== resolved.category) {
      await this.eventRepository.save({
        channelId: channel.id,
        type: 'category_changed',
        before: prev,
        after: resolved.category,
        occurredAt: new Date(),
      });
    }
    return this.channelRepository.save(channel);
  }

  async classifyUnlockedWeekly(): Promise<{
    updated: number;
    skipped: number;
    total: number;
  }> {
    const channels = await this.channelRepository.find({
      where: {
        status: ChannelStatus.ACTIVE,
        category: PENDING_CATEGORY,
        categoryLocked: false,
      },
    });
    let updated = 0;
    let skipped = 0;
    for (const channel of channels) {
      if (!isWeeklyReclassifyTarget(channel) || channel.categoryLocked) {
        skipped += 1;
        continue;
      }
      const before = channel.category;
      const next = await this.classifyOne(channel);
      if (next.category !== before) updated += 1;
    }
    this.logger.log(
      `주간 카테고리 재분류: 변경 ${updated} / 건너뜀 ${skipped} / 대상 ${channels.length}`,
    );
    return { updated, skipped, total: channels.length };
  }
}
