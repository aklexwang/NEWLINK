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
      label:
        source === 'tgstat'
          ? 'TGStat · 한국 텔레그램 전체'
          : '텔레그램 인기 채널 · 구독자 순',
      hint:
        source === 'tgstat'
          ? 'TGStat 데이터베이스 기준으로 카테고리별 채널을 불러옵니다.'
          : 'ranking-seeds.json에 등록된 채널만 표시됩니다. 더 많은 채널은 시드 파일에 추가하거나 TGStat API를 연결하세요.',
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
