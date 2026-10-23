import {
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { InternalCronGuard } from './internal-cron.guard';
import { MtprotoCollectorService } from './mtproto-collector.service';
import { parseStatsCollectMode } from './stats-collect.logic';
import { StatsJobService } from './stats-job.service';

@Controller('internal/stats')
@UseGuards(InternalCronGuard)
export class InternalStatsController {
  constructor(
    private readonly statsJobService: StatsJobService,
    private readonly mtproto: MtprotoCollectorService,
  ) {}

  @Get('status')
  status() {
    return this.statsJobService.getStatus();
  }

  @Post('run')
  async runAll(
    @Query('mode') modeRaw: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const mode = parseStatsCollectMode(modeRaw);
    const result = await this.statsJobService.startPipeline(mode);
    if (result.skipped) {
      throw new HttpException(
        {
          accepted: false,
          skipped: true,
          started: false,
          reason: 'busy',
          runId: result.runId,
          mode: result.mode,
        },
        HttpStatus.CONFLICT,
      );
    }
    res.status(HttpStatus.ACCEPTED);
    return {
      accepted: true,
      started: result.started,
      runId: result.runId,
      mode: result.mode,
    };
  }

  @Post('run-one/:channelId')
  @HttpCode(202)
  async runOne(@Param('channelId') channelId: string) {
    const channel = await this.statsJobService.findChannel(channelId);
    if (!channel) {
      throw new NotFoundException('채널을 찾을 수 없습니다.');
    }
    const { started, runId } = await this.statsJobService.startOne(channel);
    return { accepted: true, started, runId, channelId: channel.id };
  }

  @Post('mtproto-test/:username')
  mtprotoTest(@Param('username') username: string) {
    return this.mtproto.testPublicUsername(username);
  }
}
