import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
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

  /** 홈 피드 방 고르기: 검색·카테고리로 찾기 (picked=1 이면 고른 방만) */
  @Get('rooms')
  rooms(
    @Query('q') q?: string,
    @Query('category') category?: string,
    @Query('picked') picked?: string,
    @Query('limit') limit?: string,
  ) {
    return this.publicStats.adminFeedRooms({
      q: typeof q === 'string' ? q.slice(0, 100) : undefined,
      category:
        typeof category === 'string' && category
          ? category.slice(0, 60)
          : undefined,
      pickedOnly: picked === '1' || picked === 'true',
      limit: Number(limit) || undefined,
    });
  }

  /** 홈 피드에 넣기/빼기 */
  @Put('rooms/:id')
  setPicked(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: { picked?: unknown },
  ) {
    return this.publicStats.setFeedPicked(id, body?.picked === true);
  }
}
