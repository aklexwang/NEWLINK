import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { TelegramPreviewService } from '../channels/telegram-preview.service';

export interface ExternalRankingChannel {
  id: string;
  title: string;
  username: string | null;
  link: string;
  avatarUrl: string | null;
  participantsCount: number;
  recommendCount: number;
  category: string;
  linkType: string;
  source: 'telegram';
}

export interface RankingCategoryItem {
  id: string;
  name: string;
  emoji: string;
  iconUrl?: string | null;
  count: number;
}

interface CacheEntry<T> {
  expiresAt: number;
  data: T;
}

interface SeedCategory {
  name: string;
  emoji: string;
  channels: string[];
}

interface SeedFile {
  categories: SeedCategory[];
}

@Injectable()
export class TelegramRankingService {
  private readonly logger = new Logger(TelegramRankingService.name);
  private readonly cache = new Map<string, CacheEntry<ExternalRankingChannel[]>>();
  private readonly ttlMs = 60 * 60 * 1000;
  private seeds: SeedFile | null = null;

  constructor(private readonly telegramPreviewService: TelegramPreviewService) {}

  getCategories(): RankingCategoryItem[] {
    const seedData = this.loadSeeds();
    const counts = this.getCounts();
    const items: RankingCategoryItem[] = [
      { id: 'all', name: '전체', emoji: '🏆', count: counts.all ?? 0 },
    ];

    for (const category of seedData.categories) {
      const uniqueLinks = [...new Set(category.channels)];
      if (uniqueLinks.length === 0) continue;
      items.push({
        id: category.name,
        name: category.name,
        emoji: category.emoji,
        count: uniqueLinks.length,
      });
    }

    return items;
  }

  getCounts(): Record<string, number> {
    const seedData = this.loadSeeds();
    const allLinks = new Set<string>();
    const counts: Record<string, number> = {};

    for (const category of seedData.categories) {
      const uniqueLinks = [...new Set(category.channels)];
      if (uniqueLinks.length > 0) counts[category.name] = uniqueLinks.length;
      for (const link of uniqueLinks) allLinks.add(link);
    }

    counts.all = allLinks.size;
    return counts;
  }

  async getRanking(category?: string, limit = 50): Promise<ExternalRankingChannel[]> {
    const normalizedLimit = Math.min(Math.max(limit, 1), 100);
    const cacheKey = `telegram:${category ?? 'all'}:${normalizedLimit}`;
    const cached = this.getCache(cacheKey);
    if (cached) return cached;

    const seedData = this.loadSeeds();
    const linkCategoryPairs = this.collectLinks(seedData, category);
    const uniqueLinks = [...new Map(linkCategoryPairs.map((item) => [item.link, item])).values()];

    const items: ExternalRankingChannel[] = [];
    const batchSize = 4;
    for (let i = 0; i < uniqueLinks.length; i += batchSize) {
      const batch = uniqueLinks.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(async ({ link, category: itemCategory }) => {
          try {
            return await this.buildChannelItem(link, itemCategory);
          } catch (error) {
            this.logger.warn(`Failed to fetch ranking for ${link}: ${error}`);
            return null;
          }
        }),
      );
      items.push(...batchResults.filter((item): item is ExternalRankingChannel => item !== null));
    }

    items.sort((a, b) => b.participantsCount - a.participantsCount);
    const ranked = items.slice(0, normalizedLimit);
    this.setCache(cacheKey, ranked);
    return ranked;
  }

  private async buildChannelItem(link: string, category: string): Promise<ExternalRankingChannel | null> {
    const normalizedLink = this.normalizeLink(link);
    const preview = await this.telegramPreviewService.fetchPreview(normalizedLink);
    const participantsCount = this.parseMemberCount(preview.memberCount);

    if (!preview.title && participantsCount === 0) return null;

    return {
      id: createHash('sha1').update(normalizedLink).digest('hex').slice(0, 16),
      title: preview.title ?? normalizedLink,
      username: this.extractUsername(normalizedLink),
      link: normalizedLink,
      avatarUrl: preview.avatarUrl,
      participantsCount,
      recommendCount: 0,
      category,
      linkType: 'channel',
      source: 'telegram',
    };
  }

  private collectLinks(seedData: SeedFile, category?: string) {
    const pairs: { link: string; category: string }[] = [];

    if (!category || category === 'all') {
      for (const item of seedData.categories) {
        for (const link of item.channels) {
          pairs.push({ link, category: item.name });
        }
      }
      return pairs;
    }

    const matched = seedData.categories.find((item) => item.name === category);
    for (const link of matched?.channels ?? []) {
      pairs.push({ link, category });
    }
    return pairs;
  }

  private loadSeeds(): SeedFile {
    if (this.seeds) return this.seeds;

    const path = join(process.cwd(), 'data', 'ranking-seeds.json');
    if (!existsSync(path)) {
      this.seeds = { categories: [] };
      return this.seeds;
    }

    const raw = JSON.parse(readFileSync(path, 'utf-8')) as {
      categories: SeedCategory[] | Record<string, string[]>;
    };

    if (Array.isArray(raw.categories)) {
      this.seeds = { categories: raw.categories };
    } else {
      const emojiMap: Record<string, string> = {
        뉴스: '📰',
        커뮤니티: '👥',
        쇼핑: '🛒',
        교육: '📚',
        엔터테인먼트: '🎬',
        음악: '🎵',
        축구: '⚽',
        기타: '📁',
      };
      this.seeds = {
        categories: Object.entries(raw.categories).map(([name, channels]) => ({
          name,
          emoji: emojiMap[name] ?? '📁',
          channels,
        })),
      };
    }

    return this.seeds;
  }

  private parseMemberCount(value: string | null): number {
    if (!value) return 0;
    const parsed = Number.parseInt(value.replace(/\D/g, ''), 10);
    return Number.isFinite(parsed) ? parsed : 0;
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
    if (name.startsWith('+')) return null;
    return name.startsWith('@') ? name : `@${name}`;
  }

  private getCache(key: string): ExternalRankingChannel[] | null {
    const entry = this.cache.get(key);
    if (!entry || entry.expiresAt < Date.now()) {
      this.cache.delete(key);
      return null;
    }
    return entry.data;
  }

  private setCache(key: string, data: ExternalRankingChannel[]) {
    this.cache.set(key, { data, expiresAt: Date.now() + this.ttlMs });
  }
}
