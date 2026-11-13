import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Channel, LinkType } from '../channels/channel.entity';
import { ChannelPost } from './channel-post.entity';
import { GroupMessage } from './group-message.entity';
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
    @InjectRepository(ChannelPost)
    private readonly postRepository: Repository<ChannelPost>,
    @Optional()
    @InjectRepository(GroupMessage)
    private readonly groupMessageRepository?: Repository<GroupMessage>,
  ) {}

  /** 그룹: 저장된 최근 대화(개인정보 가림). 고정 글이 있으면 맨 앞 */
  private async storedGroupMessages(
    channelId: string,
  ): Promise<QuickPreviewPost[]> {
    if (!this.groupMessageRepository) return [];
    const rows = await this.groupMessageRepository.find({
      where: { channelId },
      order: { messageId: 'DESC' },
      take: 60,
    });
    const pinned = rows.filter((r) => r.isPinned);
    const rest = rows.filter((r) => !r.isPinned).slice(0, 6);
    return [...pinned, ...rest].map((m) => ({
      postedAt: m.postedAt.toISOString(),
      views: null,
      mediaType: m.mediaType,
      text: `${m.isPinned ? '📌 고정 · ' : m.isAdminPost ? '운영자 · ' : ''}${m.text ?? ''}`.trim() || null,
    }));
  }

  /** DB 에 저장된 최근 글(수집 계정이 회원이라 읽은 비공개방 글 포함) */
  private async storedPosts(channelId: string): Promise<QuickPreviewPost[]> {
    const rows = await this.postRepository.find({
      where: { channelId, deletedAt: IsNull() },
      order: { postedAt: 'DESC' },
      take: 6,
    });
    return rows.map((p) => ({
      postedAt: p.postedAt.toISOString(),
      views: p.views,
      mediaType: p.mediaType,
      text: p.textExcerpt,
    }));
  }

  async preview(id: string): Promise<QuickPreview> {
    const hit = this.cache.get(id);
    // 수집 직후 바로 반영되도록 캐시는 짧게(60초).
    if (hit && Date.now() - hit.at < 60_000) return hit.value;
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
    if (channel.linkType === LinkType.GROUP) {
      // 그룹은 t.me 공개 미리보기가 없다 → 수집 계정이 읽어 저장한 대화(개인정보 가림)
      const convo = await this.storedGroupMessages(channel.id);
      value =
        convo.length > 0
          ? { description, posts: convo, note: null }
          : {
              description,
              posts: [],
              note: '그룹 대화가 아직 저장되지 않았어요. 수집 계정이 회원이면 [지금 수집] 후 보여요.',
            };
    } else if (!username) {
      // 비공개 초대방: 공개 t.me 가 없으니 저장된 글(수집 계정이 회원이면 읽어 둔 글)을 보여 준다.
      const stored = await this.storedPosts(channel.id);
      value =
        stored.length > 0
          ? { description, posts: stored, note: null }
          : {
              description,
              posts: [],
              note: '비공개 초대방이에요. 수집 계정이 회원이면 글이 채워져요(아직 저장된 글 없음).',
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
      if (posts.length > 0) {
        value = { description, posts, note: null };
      } else {
        // 공개 미리보기가 비었으면(미리보기 막힘 등) 저장된 글로 대체
        const stored = await this.storedPosts(channel.id);
        value =
          stored.length > 0
            ? { description, posts: stored, note: null }
            : {
                description,
                posts: [],
                note: '공개된 글이 없거나 불러오지 못했어요.',
              };
      }
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
