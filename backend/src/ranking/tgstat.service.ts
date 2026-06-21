import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface TgstatRankingChannel {
  id: string;
  title: string;
  username: string | null;
  link: string;
  avatarUrl: string | null;
  participantsCount: number;
  recommendCount: number;
  category: string;
  linkType: string;
  source: 'tgstat';
}

interface CacheEntry<T> {
  expiresAt: number;
  data: T;
}

const TGSTAT_CATEGORY_MAP: Record<string, string> = {
  뉴스: 'news',
  커뮤니티: 'blogs',
  쇼핑: 'sales',
  교육: 'education',
  엔터테인먼트: 'humor',
  음악: 'music',
  축구: 'sport',
  기타: 'other',
};

const ALL_TGSTAT_CATEGORIES = ['news', 'tech', 'economics', 'crypto', 'blogs', 'sport', 'games'];

@Injectable()
export class TgstatService {
  private readonly logger = new Logger(TgstatService.name);
  private readonly cache = new Map<string, CacheEntry<TgstatRankingChannel[]>>();
  private readonly ttlMs = 60 * 60 * 1000;

  constructor(private readonly configService: ConfigService) {}

  isConfigured(): boolean {
    const token = this.configService.get<string>('TGSTAT_API_TOKEN');
    return Boolean(token && !token.includes('placeholder'));
  }

  getCounts(): Record<string, number> {
    return { all: 0 };
  }

  async getRanking(category?: string, limit = 50): Promise<TgstatRankingChannel[]> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException('TGStat API is not configured.');
    }

    const normalizedLimit = Math.min(Math.max(limit, 1), 100);
    const cacheKey = `tgstat:${category ?? 'all'}:${normalizedLimit}`;
    const cached = this.getCache(cacheKey);
    if (cached) return cached;

    const tgstatCategory =
      !category || category === 'all' ? undefined : TGSTAT_CATEGORY_MAP[category] ?? category;

    let items: TgstatRankingChannel[];
    if (!tgstatCategory) {
      items = await this.fetchMergedRanking(normalizedLimit);
    } else {
      items = await this.fetchCategoryRanking(tgstatCategory, category ?? tgstatCategory, normalizedLimit);
    }

    items.sort((a, b) => b.participantsCount - a.participantsCount);
    const ranked = items.slice(0, normalizedLimit);
    this.setCache(cacheKey, ranked);
    return ranked;
  }

  private async fetchMergedRanking(limit: number): Promise<TgstatRankingChannel[]> {
    const perCategory = Math.max(15, Math.ceil(limit / ALL_TGSTAT_CATEGORIES.length));
    const batches = await Promise.all(
      ALL_TGSTAT_CATEGORIES.map((code) => this.fetchCategoryRanking(code, code, perCategory)),
    );

    const seen = new Set<string>();
    const merged: TgstatRankingChannel[] = [];
    for (const batch of batches) {
      for (const item of batch) {
        if (seen.has(item.link)) continue;
        seen.add(item.link);
        merged.push(item);
      }
    }
    return merged;
  }

  private async fetchCategoryRanking(
    tgstatCategory: string,
    displayCategory: string,
    limit: number,
  ): Promise<TgstatRankingChannel[]> {
    const country = this.configService.get<string>('TGSTAT_COUNTRY', 'kr');
    const language = this.configService.get<string>('TGSTAT_LANGUAGE', 'korean');

    const data = await this.apiGet<TgstatChannelRaw[]>('channels/search', {
      country,
      language,
      category: tgstatCategory,
      limit: String(Math.min(limit, 100)),
      peer_type: 'channel',
    });

    return data.map((item) => this.normalizeChannel(item, displayCategory));
  }

  private normalizeChannel(item: TgstatChannelRaw, category: string): TgstatRankingChannel {
    const link = item.link.startsWith('http') ? item.link : `https://${item.link}`;
    const avatarPath = item.image100 ?? item.image640 ?? null;

    return {
      id: String(item.id),
      title: item.title,
      username: item.username ?? null,
      link,
      avatarUrl: avatarPath ? (avatarPath.startsWith('http') ? avatarPath : `https:${avatarPath}`) : null,
      participantsCount: item.participants_count ?? 0,
      recommendCount: 0,
      category,
      linkType: item.peer_type ?? 'channel',
      source: 'tgstat',
    };
  }

  private async apiGet<T>(path: string, params: Record<string, string>): Promise<T> {
    const token = this.configService.get<string>('TGSTAT_API_TOKEN');
    if (!token) throw new ServiceUnavailableException('TGStat API is not configured.');

    const url = new URL(`https://api.tgstat.ru/${path}`);
    url.searchParams.set('token', token);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    const res = await fetch(url.toString());
    const body = (await res.json()) as { status: string; response?: T; error?: string };
    if (body.status !== 'ok' || !body.response) {
      throw new ServiceUnavailableException(body.error ?? 'TGStat API request failed.');
    }
    return body.response;
  }

  private getCache(key: string): TgstatRankingChannel[] | null {
    const entry = this.cache.get(key);
    if (!entry || entry.expiresAt < Date.now()) {
      this.cache.delete(key);
      return null;
    }
    return entry.data;
  }

  private setCache(key: string, data: TgstatRankingChannel[]) {
    this.cache.set(key, { data, expiresAt: Date.now() + this.ttlMs });
  }
}

interface TgstatChannelRaw {
  id: number;
  link: string;
  peer_type?: string;
  username?: string;
  title: string;
  image100?: string;
  image640?: string;
  participants_count?: number;
}
