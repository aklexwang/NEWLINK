import { Injectable } from '@nestjs/common';
import { CategoriesService } from '../categories/categories.service';
import { ChannelsService } from '../channels/channels.service';
import {
  RankingQueryDto,
  SCORE_FAMILY_SORTS,
} from '../stats/dto/public-stats.dto';
import { PublicStatsService } from '../stats/public-stats.service';
import {
  TelegramRankingService,
  type RankingCategoryItem,
} from './telegram-ranking.service';
import { TgstatService } from './tgstat.service';

export type RankingSource = 'tgstat' | 'database';

interface CacheEntry<T> {
  expiresAt: number;
  data: T;
}

@Injectable()
export class RankingService {
  private readonly listCache = new Map<string, CacheEntry<unknown>>();
  private readonly listCacheTtlMs = 30_000;

  constructor(
    private readonly tgstatService: TgstatService,
    private readonly telegramRankingService: TelegramRankingService,
    private readonly channelsService: ChannelsService,
    private readonly categoriesService: CategoriesService,
    private readonly publicStatsService: PublicStatsService,
  ) {}

  private getCached<T>(key: string): T | null {
    const entry = this.listCache.get(key);
    if (!entry || entry.expiresAt < Date.now()) {
      this.listCache.delete(key);
      return null;
    }
    return entry.data as T;
  }

  private setCached<T>(key: string, data: T) {
    this.listCache.set(key, {
      data,
      expiresAt: Date.now() + this.listCacheTtlMs,
    });
  }

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
    const cacheKey = 'ranking:categories';
    const cached = this.getCached<RankingCategoryItem[]>(cacheKey);
    if (cached) return cached;

    const adminCategories = await this.categoriesService.findActive();
    const iconMap = Object.fromEntries(
      adminCategories.map((category) => [
        category.name,
        category.iconUrl ?? null,
      ]),
    );

    if (this.tgstatService.isConfigured()) {
      const items = await this.telegramRankingService.getCategories();
      const mapped = items.map((item) => ({
        ...item,
        iconUrl: item.id === 'all' ? null : (iconMap[item.name] ?? null),
      }));
      this.setCached(cacheKey, mapped);
      return mapped;
    }

    const counts = await this.channelsService.getRankingCounts();

    const items: RankingCategoryItem[] = [
      {
        id: 'all',
        name: '전체',
        emoji: '🏆',
        iconUrl: null,
        count: counts.all ?? 0,
      },
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
      items.push({
        id: name,
        name,
        emoji: '📁',
        iconUrl: iconMap[name] ?? null,
        count,
      });
    }

    this.setCached(cacheKey, items);
    return items;
  }

  async getChannels(query: RankingQueryDto) {
    const category = query.category;
    const limit = query.limit ?? 50;
    const sort = query.sort ?? 'members';
    const useDatabase =
      !this.tgstatService.isConfigured() ||
      SCORE_FAMILY_SORTS.has(sort) ||
      Boolean(query.type) ||
      Boolean(query.hideLowData) ||
      Boolean(query.verifiedOnly) ||
      Boolean(query.includeForeign);

    const cacheKey = `ranking:channels:${category ?? 'all'}:${limit}:${sort}:${query.type ?? ''}:${query.hideLowData ? '1' : '0'}:${query.verifiedOnly ? '1' : '0'}:${query.includeForeign ? '1' : '0'}:${useDatabase ? 'db' : 'tg'}`;
    const cached = this.getCached<unknown[]>(cacheKey);
    if (cached) return cached;

    if (!useDatabase) {
      const items = await this.tgstatService.getRanking(category, limit);
      this.setCached(cacheKey, items);
      return items;
    }

    const items = await this.publicStatsService.listRanking(query);
    this.setCached(cacheKey, items);
    return items;
  }
}
