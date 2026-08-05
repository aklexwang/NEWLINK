import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GoogleCseService,
  type GoogleCseHit,
  type GoogleSearchPreset,
} from './google-cse.service';

interface SerperOrganicItem {
  title?: string;
  link?: string;
  snippet?: string;
}

interface SerperResponse {
  organic?: SerperOrganicItem[];
  searchInformation?: { totalResults?: string | number };
  message?: string;
}

@Injectable()
export class SerperSearchService {
  private readonly logger = new Logger(SerperSearchService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly googleCseService: GoogleCseService,
  ) {}

  isConfigured(): boolean {
    const key = (this.configService.get<string>('SERPER_API_KEY') ?? '').trim();
    return Boolean(key && !key.includes('placeholder'));
  }

  async search(params: {
    topic: string;
    preset: GoogleSearchPreset;
    customQuery?: string;
    pages?: number;
    strictTopic?: boolean;
  }): Promise<{
    query: string;
    hits: GoogleCseHit[];
    rawResultCount: number;
    filteredOut: number;
    provider: 'serper';
  }> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException(
        'Serper가 설정되지 않았습니다. SERPER_API_KEY를 backend/.env에 넣은 뒤 Nest를 재시작하세요.',
      );
    }

    const query = this.googleCseService.buildQuery(params.topic, params.preset, params.customQuery);
    if (!query) {
      throw new BadRequestException('검색어(주제 또는 커스텀 쿼리)를 입력해 주세요.');
    }

    const pages = Math.min(Math.max(params.pages ?? 1, 1), 5);
    const byLink = new Map<string, GoogleCseHit>();
    let rawResultCount = 0;

    for (let page = 1; page <= pages; page += 1) {
      const result = await this.fetchPage(query, page);
      if (page === 1) rawResultCount = result.totalResults;

      for (const item of result.items) {
        const extracted = this.googleCseService.buildHitsFromResult({
          link: item.link,
          title: item.title,
          snippet: item.snippet,
        });
        for (const hit of extracted) {
          const key = hit.link.toLowerCase();
          if (byLink.has(key)) continue;
          byLink.set(key, hit);
        }
      }

      if (result.items.length === 0) break;
    }

    const all = [...byLink.values()];
    const strict = params.strictTopic !== false && params.preset !== 'custom';
    const hits = strict
      ? all.filter((hit) => this.googleCseService.matchesTopic(hit, params.topic))
      : all;

    return {
      query,
      hits,
      rawResultCount,
      filteredOut: all.length - hits.length,
      provider: 'serper',
    };
  }

  private async fetchPage(
    query: string,
    page: number,
  ): Promise<{ items: SerperOrganicItem[]; totalResults: number }> {
    const apiKey = (this.configService.get<string>('SERPER_API_KEY') ?? '').trim();
    const response = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        q: query,
        num: 10,
        page,
      }),
    });

    const data = (await response.json()) as SerperResponse;
    if (!response.ok) {
      const message = data.message ?? `Serper HTTP ${response.status}`;
      this.logger.warn(`Serper 실패: ${message}`);
      throw new ServiceUnavailableException(message);
    }

    return {
      items: data.organic ?? [],
      totalResults: Number(data.searchInformation?.totalResults ?? 0) || 0,
    };
  }
}
