import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { parseAnalyticsRange } from '../analytics/analytics-range.logic';
import { OpenStatsService } from '../analytics/open-stats.service';
import { TelegramAdminGuard } from '../auth/telegram-admin.guard';
import { TelegramAuthGuard } from '../auth/telegram-auth.guard';

/** 텔레그램 이동 수: 어드민에게만 보인다(회원 화면에는 노출하지 않음). */
@Controller('admin/opens')
@UseGuards(TelegramAuthGuard, TelegramAdminGuard)
export class AdminOpensController {
  constructor(private readonly stats: OpenStatsService) {}

  @Get('ranking')
  ranking(@Query('range') range?: string, @Query('limit') limit?: string) {
    return this.stats.ranking(
      parseAnalyticsRange(range),
      limit ? Number(limit) : 50,
    );
  }

  @Get('channel/:id')
  channel(@Param('id', ParseUUIDPipe) id: string) {
    return this.stats.channelSummary(id);
  }
}
