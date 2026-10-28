import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { TelegramAdminGuard } from '../auth/telegram-admin.guard';
import { TelegramAuthGuard } from '../auth/telegram-auth.guard';
import { FeedFilterService } from './feed-filter.service';
import type { FeedFilterSettings } from './feed-filter.logic';
import { PublicStatsService } from './public-stats.service';

/** 홈 "최근 활발한 채널" 광고 거르기 설정 */
@Controller('admin/feed-filter')
@UseGuards(TelegramAuthGuard, TelegramAdminGuard)
export class AdminFeedFilterController {
  constructor(
    private readonly filter: FeedFilterService,
    private readonly publicStats: PublicStatsService,
  ) {}

  @Get()
  get() {
    return this.filter.get();
  }

  @Put()
  async set(@Body() body: Partial<FeedFilterSettings>) {
    const saved = await this.filter.set({
      excludeCategories: Array.isArray(body?.excludeCategories)
        ? body.excludeCategories
        : undefined,
      adWords: Array.isArray(body?.adWords) ? body.adWords : undefined,
      minHits: typeof body?.minHits === 'number' ? body.minHits : undefined,
    });
    // 홈 피드에 바로 반영
    this.publicStats.clearPublicCaches();
    return saved;
  }
}
