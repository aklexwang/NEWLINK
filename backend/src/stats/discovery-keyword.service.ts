import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppSetting } from '../ads/app-setting.entity';
import { DiscoveryKeyword } from './discovery-keyword.entity';
import {
  DISCOVERY_KEYWORD_SEED_V2_KEY,
  discoveryKeywordV2InsertRows,
  newDiscoveryKeywordInsertRows,
  pickKeywordsForSearch,
  shouldSeedDiscoveryKeywords,
} from './discovery-keywords';

@Injectable()
export class DiscoveryKeywordService implements OnModuleInit {
  private readonly logger = new Logger(DiscoveryKeywordService.name);

  constructor(
    @InjectRepository(DiscoveryKeyword)
    private readonly keywordRepository: Repository<DiscoveryKeyword>,
    @InjectRepository(AppSetting)
    private readonly settings: Repository<AppSetting>,
  ) {}

  async onModuleInit() {
    const count = await this.keywordRepository.count();
    if (shouldSeedDiscoveryKeywords(count)) {
      const rows = newDiscoveryKeywordInsertRows();
      if (rows.length > 0) {
        await this.keywordRepository.insert(rows);
        this.logger.log(`발견 키워드 ${rows.length}개를 처음 넣었습니다.`);
      }
    }
    await this.seedV2Once();
  }

  /** 2차 키워드: 한 번만, 없는 단어만 추가 */
  private async seedV2Once() {
    try {
      const done = await this.settings.findOneBy({
        key: DISCOVERY_KEYWORD_SEED_V2_KEY,
      });
      if (done) return;
      const existing = await this.keywordRepository.find({
        select: ['word', 'sort'],
      });
      const maxSort = existing.reduce((m, r) => Math.max(m, r.sort), -1);
      const rows = discoveryKeywordV2InsertRows(
        existing.map((r) => r.word),
        maxSort + 1,
      );
      if (rows.length > 0) await this.keywordRepository.insert(rows);
      await this.settings.save({
        key: DISCOVERY_KEYWORD_SEED_V2_KEY,
        value: String(rows.length),
      });
      this.logger.log(`발견 키워드 2차 ${rows.length}개를 추가했습니다.`);
    } catch (error) {
      this.logger.warn(
        `발견 키워드 2차 추가 실패: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  async pickEnabledForSearch(cap: number): Promise<DiscoveryKeyword[]> {
    const rows = await this.keywordRepository.find({
      where: { enabled: true },
    });
    return pickKeywordsForSearch(rows, cap);
  }

  async recordSearch(id: string, foundCount: number, newCount: number) {
    const row = await this.keywordRepository.findOneBy({ id });
    if (!row) return;
    await this.keywordRepository.update(id, {
      lastSearchedAt: new Date(),
      lastFoundCount: foundCount,
      totalNewCount: row.totalNewCount + newCount,
    });
  }
}
