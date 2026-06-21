import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface TelegramPreview {
  title: string | null;
  description: string | null;
  avatarUrl: string | null;
  memberCount: string | null;
}

@Injectable()
export class TelegramPreviewService {
  private readonly logger = new Logger(TelegramPreviewService.name);

  constructor(private readonly configService: ConfigService) {}

  async fetchPreview(link: string): Promise<TelegramPreview> {
    const normalized = this.normalizeLink(link);
    const scraped = await this.scrapeTelegramPage(normalized);
    if (scraped.avatarUrl && !this.isGenericTelegramLogo(scraped.avatarUrl)) {
      return scraped;
    }

    const username = this.extractUsername(normalized);
    if (username) {
      const userpicUrl = await this.fetchUserpic(username);
      if (userpicUrl) {
        return { ...scraped, avatarUrl: userpicUrl };
      }

      const fromBot = await this.fetchViaBotApi(username);
      if (fromBot.avatarUrl) {
        return { ...fromBot, memberCount: scraped.memberCount ?? fromBot.memberCount };
      }
    }

    return scraped;
  }

  private normalizeLink(link: string): string {
    const trimmed = link.trim();
    if (trimmed.startsWith('http')) return trimmed;
    if (trimmed.startsWith('t.me/')) return `https://${trimmed}`;
    if (trimmed.startsWith('@')) return `https://t.me/${trimmed.slice(1)}`;
    return `https://t.me/${trimmed}`;
  }

  private extractUsername(link: string): string | null {
    const match = link.match(/t\.me\/([a-zA-Z0-9_]{4,})/i);
    if (!match) return null;
    const name = match[1];
    if (name.startsWith('+') || name === 's' || name === 'joinchat') return null;
    return name;
  }

  private async scrapeTelegramPage(url: string): Promise<TelegramPreview> {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'ko,en;q=0.9',
        },
        redirect: 'follow',
      });
      const html = await res.text();
      return {
        title: this.metaContent(html, 'og:title'),
        description: this.metaContent(html, 'og:description'),
        avatarUrl:
          this.metaContent(html, 'og:image') ??
          this.metaContent(html, 'twitter:image'),
        memberCount: this.extractMemberCount(html),
      };
    } catch (error) {
      this.logger.warn(`Failed to scrape ${url}: ${error}`);
      return { title: null, description: null, avatarUrl: null, memberCount: null };
    }
  }

  private metaContent(html: string, property: string): string | null {
    const patterns = [
      new RegExp(`property="${property}"\\s+content="([^"]+)"`, 'i'),
      new RegExp(`content="([^"]+)"\\s+property="${property}"`, 'i'),
    ];
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match?.[1]) return this.decodeHtml(match[1]);
    }
    return null;
  }

  private decodeHtml(value: string): string {
    return value
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, '');
  }

  private isGenericTelegramLogo(url: string): boolean {
    return /telegram\.org\/img\/t_logo/i.test(url);
  }

  private async fetchUserpic(username: string): Promise<string | null> {
    const url = `https://t.me/i/userpic/320/${username}.jpg`;
    try {
      const res = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });
      const contentType = res.headers.get('content-type') ?? '';
      if (res.ok && contentType.startsWith('image/')) {
        return res.url || url;
      }
    } catch (error) {
      this.logger.warn(`Userpic fetch failed for @${username}: ${error}`);
    }
    return null;
  }

  private extractMemberCount(html: string): string | null {
    const match = html.match(/([\d\s.,]+)\s*(subscribers|members)/i);
    if (!match) return null;
    return match[1].replace(/\s/g, '').trim() || null;
  }

  private async fetchViaBotApi(username: string): Promise<TelegramPreview> {
    const token = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
    if (!token || token.includes('placeholder')) {
      return { title: null, description: null, avatarUrl: null, memberCount: null };
    }

    try {
      const chatRes = await fetch(
        `https://api.telegram.org/bot${token}/getChat?chat_id=@${username}`,
      );
      const chatData = (await chatRes.json()) as {
        ok: boolean;
        result?: {
          title?: string;
          description?: string;
          photo?: { big_file_id: string };
        };
      };

      if (!chatData.ok || !chatData.result) {
        return { title: null, description: null, avatarUrl: null, memberCount: null };
      }

      let avatarUrl: string | null = null;
      const fileId = chatData.result.photo?.big_file_id;
      if (fileId) {
        const fileRes = await fetch(
          `https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`,
        );
        const fileData = (await fileRes.json()) as {
          ok: boolean;
          result?: { file_path: string };
        };
        if (fileData.ok && fileData.result?.file_path) {
          avatarUrl = `https://api.telegram.org/file/bot${token}/${fileData.result.file_path}`;
        }
      }

      return {
        title: chatData.result.title ?? null,
        description: chatData.result.description ?? null,
        avatarUrl,
        memberCount: null,
      };
    } catch (error) {
      this.logger.warn(`Bot API preview failed for @${username}: ${error}`);
      return { title: null, description: null, avatarUrl: null, memberCount: null };
    }
  }
}