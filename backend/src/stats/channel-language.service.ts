import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Channel,
  ChannelStatus,
  LinkType,
  type ChannelLanguage,
} from '../channels/channel.entity';
import {
  detectChannelLanguage,
  detectGroupLanguageFromStoredRatio,
  hangulRatio,
  LANGUAGE_POST_LIMIT,
} from '../channels/channel-language.logic';
import { ChannelPost } from './channel-post.entity';

@Injectable()
export class ChannelLanguageService {
  private readonly logger = new Logger(ChannelLanguageService.name);

  constructor(
    @InjectRepository(Channel)
    private readonly channelRepository: Repository<Channel>,
    @InjectRepository(ChannelPost)
    private readonly postRepository: Repository<ChannelPost>,
  ) {}

  async classifyAll(): Promise<{ updated: number; skippedLocked: number }> {
    const channels = await this.channelRepository
      .createQueryBuilder('channel')
      .where('channel.status = :status', { status: ChannelStatus.ACTIVE })
      .andWhere(
        "(channel.collect_status IS NULL OR channel.collect_status <> 'merged')",
      )
      .getMany();
    let updated = 0;
    let skippedLocked = 0;
    for (const channel of channels) {
      if (channel.languageLocked) {
        skippedLocked += 1;
        continue;
      }
      const next = await this.detectFor(channel);
      if (next === channel.language) continue;
      channel.language = next;
      await this.channelRepository.save(channel);
      updated += 1;
    }
    this.logger.log(
      `언어 판별 끝: 변경 ${updated} / 수동유지 ${skippedLocked} / 대상 ${channels.length}`,
    );
    return { updated, skippedLocked };
  }

  async classifyOne(channel: Channel): Promise<Channel> {
    if (channel.languageLocked) return channel;
    const posts = await this.postRepository.find({
      where: { channelId: channel.id },
      order: { postedAt: 'DESC' },
      take: LANGUAGE_POST_LIMIT,
      select: ['textExcerpt'],
    });
    const excerpts = posts.map((p) => p.textExcerpt);
    const combined = [channel.title, channel.description, ...excerpts]
      .map((part) => (part ?? '').trim())
      .filter(Boolean)
      .join('\n');
    const ratio = combined ? hangulRatio(combined) : null;
    const language =
      channel.linkType === LinkType.GROUP
        ? detectGroupLanguageFromStoredRatio({
            title: channel.title,
            description: channel.description,
            hangulRatio: ratio ?? channel.languageHangulRatio,
          })
        : detectChannelLanguage({
            title: channel.title,
            description: channel.description,
            excerpts,
          });
    let dirty = false;
    if (language !== channel.language) {
      channel.language = language;
      dirty = true;
    }
    if (ratio != null) {
      const rounded = Math.round(ratio * 10_000) / 10_000;
      if (channel.languageHangulRatio !== rounded) {
        channel.languageHangulRatio = rounded;
        dirty = true;
      }
    }
    if (!dirty) return channel;
    return this.channelRepository.save(channel);
  }

  async detectFor(channel: Channel): Promise<ChannelLanguage> {
    if (channel.linkType === LinkType.GROUP) {
      return detectGroupLanguageFromStoredRatio({
        title: channel.title,
        description: channel.description,
        hangulRatio: channel.languageHangulRatio,
      });
    }
    const posts = await this.postRepository.find({
      where: { channelId: channel.id },
      order: { postedAt: 'DESC' },
      take: LANGUAGE_POST_LIMIT,
      select: ['textExcerpt'],
    });
    return detectChannelLanguage({
      title: channel.title,
      description: channel.description,
      excerpts: posts.map((p) => p.textExcerpt),
    });
  }
}
