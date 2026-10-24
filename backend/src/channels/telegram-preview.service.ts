import { Injectable, Logger } from '@nestjs/common';
import { createPublicTelegramFetcher } from '../stats/public-telegram-fetch.logic';
import {
  emptyTelegramPreview,
  telegramPreviewFromHtml,
  type TelegramPreview,
} from './telegram-preview.logic';

export type { TelegramPreview };

@Injectable()
export class TelegramPreviewService {
  private readonly logger = new Logger(TelegramPreviewService.name);
  private readonly publicFetch = createPublicTelegramFetcher();

  async fetchPreview(link: string): Promise<TelegramPreview> {
    const normalized = this.normalizeLink(link);
    try {
      const page = await this.publicFetch.fetchHtml(normalized);
      return telegramPreviewFromHtml({
        html: page.html,
        status: page.status,
        finalUrl: page.finalUrl,
        requestUrl: normalized,
      });
    } catch (error) {
      this.logger.warn(`Failed to scrape ${normalized}: ${error}`);
      return emptyTelegramPreview();
    }
  }

  private normalizeLink(link: string): string {
    const trimmed = link.trim();
    if (trimmed.startsWith('http')) return trimmed;
    if (trimmed.startsWith('t.me/')) return `https://${trimmed}`;
    if (trimmed.startsWith('@')) return `https://t.me/${trimmed.slice(1)}`;
    return `https://t.me/${trimmed}`;
  }
}
