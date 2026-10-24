import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DiscoveryKeyword } from './discovery-keyword.entity';
import {
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
  ) {}

  async onModuleInit() {
    const count = await this.keywordRepository.count();
    if (!shouldSeedDiscoveryKeywords(count)) return;
    const rows = newDiscoveryKeywordInsertRows();
    if (rows.length === 0) return;
    await this.keywordRepository.insert(rows);
    this.logger.log(`발견 키워드 ${rows.length}개를 처음 넣었습니다.`);
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
