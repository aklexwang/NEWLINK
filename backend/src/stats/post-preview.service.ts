import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Channel, ChannelStatus } from '../channels/channel.entity';
import { extractTelegramUsernameFromLink } from '../channels/telegram-username';
import { parsePostEmbedHtml, type PostEmbedPreview } from './post-embed.logic';
import { createPreviewTelegramFetcher } from './public-telegram-fetch.logic';

const CACHE_MS = 30 * 60 * 1000;
const EMPTY_CACHE_MS = 10 * 60 * 1000;
const CACHE_MAX = 3000;

/**
 * 홈 피드 게시글을 텔레그램 상자(iframe) 대신 직접 그리기 위한 정보.
 * 아이폰은 iframe 이 터치를 가로채 아무 데나 눌러도 방으로 넘어가서, 글·사진만 받아 우리 화면에 그린다.
 * 우리 서버에는 저장하지 않고(메모리 30분), 우리 목록에 있는 공개 채널 글만 가져온다.
 */
@Injectable()
export class PostPreviewService {
  private readonly cache = new Map<
    string,
    { at: number; data: PostEmbedPreview | null }
  >();
  private readonly inflight = new Map<
    string,
    Promise<PostEmbedPreview | null>
  >();
  private readonly fetcher = createPreviewTelegramFetcher();

  constructor(
    @InjectRepository(Channel)
    private readonly channelRepository: Repository<Channel>,
  ) {}

  async get(
    channelId: string,
    messageId: number,
  ): Promise<PostEmbedPreview | null> {
    if (!Number.isInteger(messageId) || messageId <= 0 || messageId > 1e9) {
      throw new NotFoundException('게시글을 찾을 수 없어요.');
    }
    const channel = await this.channelRepository.findOne({
      where: { id: channelId, status: ChannelStatus.ACTIVE },
      select: ['id', 'username', 'link'],
    });
    const username = (
      channel?.username?.replace(/^@/, '') ??
      extractTelegramUsernameFromLink(channel?.link ?? '') ??
      ''
    ).trim();
    if (!channel || !/^[A-Za-z][A-Za-z0-9_]{3,31}$/.test(username)) {
      throw new NotFoundException('게시글을 찾을 수 없어요.');
    }
    const key = `${username.toLowerCase()}/${messageId}`;
    const hit = this.cache.get(key);
    const ttl = hit?.data ? CACHE_MS : EMPTY_CACHE_MS;
    if (hit && Date.now() - hit.at < ttl) return hit.data;

    let job = this.inflight.get(key);
    if (!job) {
      job = this.load(username, messageId)
        .then(({ data, cacheable }) => {
          if (cacheable) this.remember(key, data);
          return data;
        })
        .finally(() => this.inflight.delete(key));
      this.inflight.set(key, job);
    }
    return job;
  }

  /** 429·타임아웃 같은 일시 실패는 기억하지 않고, 다음 요청에서 다시 시도한다 */
  private async load(
    username: string,
    messageId: number,
  ): Promise<{ data: PostEmbedPreview | null; cacheable: boolean }> {
    const res = await this.fetcher.fetchHtml(
      `https://t.me/${encodeURIComponent(username)}/${messageId}?embed=1`,
    );
    if (!res.html) return { data: null, cacheable: false };
    if (res.status >= 400) {
      return { data: null, cacheable: res.status < 429 };
    }
    return { data: parsePostEmbedHtml(res.html), cacheable: true };
  }

  private remember(key: string, data: PostEmbedPreview | null) {
    if (this.cache.size >= CACHE_MAX) {
      for (const oldest of this.cache.keys()) {
        this.cache.delete(oldest);
        break;
      }
    }
    this.cache.set(key, { at: Date.now(), data });
  }
}
