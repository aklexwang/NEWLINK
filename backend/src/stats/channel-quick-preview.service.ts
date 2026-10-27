import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Channel, LinkType } from '../channels/channel.entity';
import { usernameFromChannelLink } from '../channels/telegram-username';
import {
  parseTelegramChannelHtml,
  TELEGRAM_FETCH_HEADERS,
} from './telegram-preview-html';

export type QuickPreviewPost = {
  postedAt: string;
  views: number | null;
  mediaType: string;
  text: string | null;
};

export type QuickPreview = {
  description: string;
  posts: QuickPreviewPost[];
  /** 글을 못 본 이유 (그룹·비공개 등) */
  note: string | null;
};

/**
 * 어드민 카테고리 판단용 미리보기: 소개글 + 최근 공개 글 몇 개(t.me/s).
 * 글 내용은 저장하지 않고 화면에만 보여 준다(10분 메모리 캐시).
 */
@Injectable()
export class ChannelQuickPreviewService {
  private readonly cache = new Map<
    string,
    { at: number; value: QuickPreview }
  >();

  constructor(
    @InjectRepository(Channel)
    private readonly channelRepository: Repository<Channel>,
  ) {}

  async preview(id: string): Promise<QuickPreview> {
    const hit = this.cache.get(id);
    if (hit && Date.now() - hit.at < 10 * 60_000) return hit.value;
    const channel = await this.channelRepository.findOne({
      where: { id },
      select: ['id', 'link', 'username', 'description', 'linkType'],
    });
    if (!channel) throw new NotFoundException('방을 찾을 수 없습니다.');
    const description = (channel.description ?? '').trim();
    const username =
      channel.username?.replace(/^@/, '') ||
      usernameFromChannelLink(channel.link);
    let value: QuickPreview;
    if (!username) {
      value = {
        description,
        posts: [],
        note: '비공개 초대방이라 글을 볼 수 없어요.',
      };
    } else {
      // 한 번만, 8초 안에 (어드민 화면이 오래 기다리지 않게)
      let html: string | null = null;
      try {
        const res = await fetch(`https://t.me/s/${username}`, {
          headers: TELEGRAM_FETCH_HEADERS,
          redirect: 'follow',
          signal: AbortSignal.timeout(8_000),
        });
        if (res.ok) html = await res.text();
      } catch {
        html = null;
      }
      const parsed = html ? parseTelegramChannelHtml(html) : null;
      const posts = (parsed?.posts ?? [])
        .slice(-6)
        .reverse()
        .map((p) => ({
          postedAt: p.postedAt.toISOString(),
          views: p.views,
          mediaType: p.mediaType,
          text: p.textExcerpt,
        }));
      value = {
        description,
        posts,
        note:
          posts.length > 0
            ? null
            : channel.linkType === LinkType.GROUP
              ? '그룹은 밖에서 글을 볼 수 없어요.'
              : '공개된 글이 없거나 불러오지 못했어요.',
      };
    }
    this.cache.set(id, { at: Date.now(), value });
    if (this.cache.size > 500) {
      for (const key of this.cache.keys()) {
        this.cache.delete(key);
        break;
      }
    }
    return value;
  }
}
