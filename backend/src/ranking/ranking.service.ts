import { Injectable } from '@nestjs/common';
import { TelegramRankingService } from './telegram-ranking.service';
import { TgstatService } from './tgstat.service';

export type RankingSource = 'tgstat' | 'telegram';

@Injectable()
export class RankingService {
  constructor(
    private readonly tgstatService: TgstatService,
    private readonly telegramRankingService: TelegramRankingService,
  ) {}

  getSource(): RankingSource {
    return this.tgstatService.isConfigured() ? 'tgstat' : 'telegram';
  }

  getStatus() {
    const source = this.getSource();
    return {
      source,
      label: source === 'tgstat' ? 'TGStat · 한국 텔레그램' : '텔레그램 · 구독자 순',
    };
  }

  getCounts() {
    if (this.tgstatService.isConfigured()) {
      return this.tgstatService.getCounts();
    }
    return this.telegramRankingService.getCounts();
  }

  getCategories() {
    if (this.tgstatService.isConfigured()) {
      return this.telegramRankingService.getCategories();
    }
    return this.telegramRankingService.getCategories();
  }

  getChannels(category?: string, limit = 50) {
    if (this.tgstatService.isConfigured()) {
      return this.tgstatService.getRanking(category, limit);
    }
    return this.telegramRankingService.getRanking(category, limit);
  }
}
