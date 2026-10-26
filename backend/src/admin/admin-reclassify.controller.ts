import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { TelegramAdminGuard } from '../auth/telegram-admin.guard';
import { TelegramAuthGuard } from '../auth/telegram-auth.guard';
import { CategoryReclassifyService } from '../stats/category-reclassify.service';

/** 전체 카테고리 재분류: 미리보기 → 확인 → 적용 */
@Controller('admin/reclassify')
@UseGuards(TelegramAuthGuard, TelegramAdminGuard)
export class AdminReclassifyController {
  constructor(private readonly reclassify: CategoryReclassifyService) {}

  @Get('status')
  status() {
    return this.reclassify.status();
  }

  @Post('start')
  start(@Body() body: { resume?: boolean }) {
    return this.reclassify.start(body?.resume === true);
  }

  @Post('stop')
  stop() {
    return this.reclassify.stop();
  }

  @Get('items')
  items(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.reclassify.list({
      from: from || undefined,
      to: to || undefined,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  @Post('apply')
  apply(@Body() body: { excludeIds?: unknown }) {
    const ids = Array.isArray(body?.excludeIds)
      ? body.excludeIds
          .filter((v): v is string => typeof v === 'string')
          .slice(0, 5000)
      : [];
    return this.reclassify.apply(ids);
  }
}
