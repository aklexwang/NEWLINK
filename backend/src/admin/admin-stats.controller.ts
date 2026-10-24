import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { TelegramAdminGuard } from '../auth/telegram-admin.guard';
import { TelegramAuthGuard } from '../auth/telegram-auth.guard';
import { AdminStatsService } from './admin-stats.service';
import { parseAdminStatsRunMode } from './admin-stats.logic';

@Controller('admin/stats')
@UseGuards(TelegramAuthGuard, TelegramAdminGuard)
export class AdminStatsController {
  constructor(private readonly adminStats: AdminStatsService) {}

  @Get('runs')
  listRuns(@Query('limit') limitRaw?: string) {
    const n = Number(limitRaw);
    const limit = Number.isFinite(n) ? n : 30;
    return this.adminStats.listRuns(limit);
  }

  @Get('ops')
  ops() {
    return this.adminStats.getOps();
  }

  @Post('run')
  @HttpCode(HttpStatus.ACCEPTED)
  startRun(@Query('mode') modeRaw?: string) {
    if (!parseAdminStatsRunMode(modeRaw)) {
      throw new BadRequestException(this.adminStats.lightRejectedMessage());
    }
    return this.adminStats.startLight();
  }
}
