import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppSetting } from '../ads/app-setting.entity';
import {
  normalizeFeedFilter,
  type FeedFilterSettings,
} from './feed-filter.logic';

const KEY_CATEGORIES = 'feed:exclude-categories';
const KEY_WORDS = 'feed:ad-words';
const KEY_MIN_HITS = 'feed:ad-min-hits';

/** 홈 피드 광고 거르기 설정 (app_settings 에 저장, 값마다 500자 안) */
@Injectable()
export class FeedFilterService {
  private cache: { at: number; data: FeedFilterSettings } | null = null;

  constructor(
    @InjectRepository(AppSetting)
    private readonly settings: Repository<AppSetting>,
  ) {}

  async get(): Promise<FeedFilterSettings> {
    if (this.cache && Date.now() - this.cache.at < 60_000)
      return this.cache.data;
    const rows = await this.settings.find();
    const map = new Map(rows.map((r) => [r.key, r.value]));
    const parse = (key: string): unknown => {
      const raw = map.get(key);
      if (raw == null) return undefined;
      try {
        return JSON.parse(raw);
      } catch {
        return undefined;
      }
    };
    const data = normalizeFeedFilter({
      excludeCategories: parse(KEY_CATEGORIES) as string[] | undefined,
      adWords: parse(KEY_WORDS) as string[] | undefined,
      minHits: parse(KEY_MIN_HITS) as number | undefined,
    });
    this.cache = { at: Date.now(), data };
    return data;
  }

  async set(input: Partial<FeedFilterSettings>): Promise<FeedFilterSettings> {
    const data = normalizeFeedFilter({ ...(await this.get()), ...input });
    const fit = (list: string[]) => {
      let out = list;
      while (JSON.stringify(out).length > 500 && out.length > 0)
        out = out.slice(0, -1);
      return out;
    };
    data.excludeCategories = fit(data.excludeCategories);
    data.adWords = fit(data.adWords);
    await this.settings.save([
      { key: KEY_CATEGORIES, value: JSON.stringify(data.excludeCategories) },
      { key: KEY_WORDS, value: JSON.stringify(data.adWords) },
      { key: KEY_MIN_HITS, value: JSON.stringify(data.minHits) },
    ]);
    this.cache = { at: Date.now(), data };
    return data;
  }
}
