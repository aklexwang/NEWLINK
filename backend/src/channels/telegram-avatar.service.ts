import { Injectable, Logger } from '@nestjs/common';
import { TelegramPreviewService } from './telegram-preview.service';

type CachedAvatar = {
  buffer: Buffer;
  contentType: string;
  expiresAt: number;
};

const CACHE_TTL_MS = 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 300;

const ALLOWED_HOST_RE =
  /^(?:[\w.-]+\.)?(?:telegram\.org|telesco\.pe|telegram-cdn\.org|cdn-telegram\.org)$/i;

@Injectable()
export class TelegramAvatarService {
  private readonly logger = new Logger(TelegramAvatarService.name);
  private readonly cache = new Map<string, CachedAvatar>();

  constructor(private readonly telegramPreviewService: TelegramPreviewService) {}

  async fetchAvatarImage(params: {
    link?: string;
    username?: string;
  }): Promise<{ buffer: Buffer; contentType: string } | null> {
    const cacheKey = (params.link || params.username || '').trim().toLowerCase();
    if (!cacheKey) return null;

    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return { buffer: cached.buffer, contentType: cached.contentType };
    }

    const sourceUrl = await this.resolveSourceUrl(params);
    if (!sourceUrl) return null;

    const downloaded = await this.downloadImage(sourceUrl);
    if (!downloaded) return null;

    this.putCache(cacheKey, downloaded);
    return downloaded;
  }

  private async resolveSourceUrl(params: {
    link?: string;
    username?: string;
  }): Promise<string | null> {
    const link =
      params.link?.trim() ||
      (params.username ? `https://t.me/${params.username.replace(/^@/, '')}` : '');
    if (!link) return null;

    try {
      const preview = await this.telegramPreviewService.fetchPreview(link);
      if (preview.avatarUrl && !/telegram\.org\/img\/t_logo/i.test(preview.avatarUrl)) {
        return preview.avatarUrl;
      }
    } catch (error) {
      this.logger.warn(
        `preview failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const username =
      params.username?.replace(/^@/, '') ||
      link.match(/t\.me\/([a-zA-Z0-9_]{4,})/i)?.[1] ||
      null;
    if (!username || username === 'joinchat' || username === 's' || username.startsWith('+')) {
      return null;
    }
    return `https://t.me/i/userpic/320/${username}.jpg`;
  }

  private async downloadImage(
    sourceUrl: string,
  ): Promise<{ buffer: Buffer; contentType: string } | null> {
    try {
      const parsed = new URL(sourceUrl);
      if (!ALLOWED_HOST_RE.test(parsed.hostname) && !parsed.hostname.endsWith('t.me')) {
        this.logger.warn(`blocked avatar host: ${parsed.hostname}`);
        return null;
      }

      const res = await fetch(sourceUrl, {
        redirect: 'follow',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        },
      });

      const contentType = res.headers.get('content-type') ?? '';
      if (!res.ok || !contentType.startsWith('image/')) {
        return null;
      }

      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.length < 32 || buffer.length > 5 * 1024 * 1024) {
        return null;
      }

      return { buffer, contentType: contentType.split(';')[0].trim() || 'image/jpeg' };
    } catch (error) {
      this.logger.warn(
        `download failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  private putCache(key: string, value: { buffer: Buffer; contentType: string }) {
    if (this.cache.size >= MAX_CACHE_ENTRIES) {
      const first = this.cache.keys().next().value;
      if (first) this.cache.delete(first);
    }
    this.cache.set(key, { ...value, expiresAt: Date.now() + CACHE_TTL_MS });
  }
}
