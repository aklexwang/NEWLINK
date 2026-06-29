import { Injectable } from '@nestjs/common';
import { CategoriesService } from '../categories/categories.service';
import { ChannelsService } from '../channels/channels.service';
import { TelegramRankingService, type RankingCategoryItem } from './telegram-ranking.service';
import { TgstatService } from './tgstat.service';

export type RankingSource = 'tgstat' | 'database';

@Injectable()
export class RankingService {
  constructor(
    private readonly tgstatService: TgstatService,
    private readonly telegramRankingService: TelegramRankingService,
    private readonly channelsService: ChannelsService,
    private readonly categoriesService: CategoriesService,
  ) {}

  getSource(): RankingSource {
    return this.tgstatService.isConfigured() ? 'tgstat' : 'database';
  }

  getStatus() {
    const source = this.getSource();
    if (source === 'tgstat') {
      return {
        source,
        label: 'TGStat · 한국 텔레그램 전체',
        hint: 'TGStat 데이터베이스 기준으로 카테고리별 채널을 불러옵니다.',
      };
    }

    return {
      source,
      label: 'New Link 등록 채널·그룹 · 구독자 순',
      hint: '어드민에서 등록·승인된 채널과 그룹이 카테고리별로 표시됩니다.',
    };
  }

  async getCounts() {
    if (this.tgstatService.isConfigured()) {
      return this.tgstatService.getCounts();
    }
    return this.channelsService.getRankingCounts();
  }

  async getCategories(): Promise<RankingCategoryItem[]> {
    const adminCategories = await this.categoriesService.findActive();
    const iconMap = Object.fromEntries(
      adminCategories.map((category) => [category.name, category.iconUrl ?? null]),
    );

    if (this.tgstatService.isConfigured()) {
      const items = await this.telegramRankingService.getCategories();
      return items.map((item) => ({
        ...item,
        iconUrl: item.id === 'all' ? null : (iconMap[item.name] ?? null),
      }));
    }

    const counts = await this.channelsService.getRankingCounts();

    const items: RankingCategoryItem[] = [
      { id: 'all', name: '전체', emoji: '🏆', iconUrl: null, count: counts.all ?? 0 },
    ];

    const seen = new Set<string>();
    for (const category of adminCategories) {
      const count = counts[category.name] ?? 0;
      seen.add(category.name);
      items.push({
        id: category.name,
        name: category.name,
        emoji: category.emoji,
        iconUrl: category.iconUrl ?? null,
        count,
      });
    }

    for (const [name, count] of Object.entries(counts)) {
      if (name === 'all' || seen.has(name)) continue;
      items.push({ id: name, name, emoji: '📁', iconUrl: iconMap[name] ?? null, count });
    }

    return items;
  }

  async getChannels(category?: string, limit = 50) {
    if (this.tgstatService.isConfigured()) {
      return this.tgstatService.getRanking(category, limit);
    }

    const items = await this.channelsService.getRanking(category, limit);
    return items.map((item) => ({ ...item, source: 'database' as const }));
  }
}
