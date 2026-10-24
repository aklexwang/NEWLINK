import { Injectable, Logger } from '@nestjs/common';
import { createPreviewTelegramFetcher } from '../stats/public-telegram-fetch.logic';
import {
  emptyTelegramPreview,
  resolvePreviewRequestUrl,
  telegramPreviewFromHtml,
  type TelegramPreview,
} from './telegram-preview.logic';

export type { TelegramPreview };

@Injectable()
export class TelegramPreviewService {
  private readonly logger = new Logger(TelegramPreviewService.name);
  private readonly previewFetch = createPreviewTelegramFetcher();

  async fetchPreview(link: string): Promise<TelegramPreview> {
    const normalized = resolvePreviewRequestUrl(link);
    if (!normalized) return emptyTelegramPreview();
    try {
      const page = await this.previewFetch.fetchHtml(normalized);
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
}
