import {
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { InternalCronGuard } from './internal-cron.guard';
import { MtprotoCollectorService } from './mtproto-collector.service';
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
  @HttpCode(202)
  runAll() {
    const { started } = this.statsJobService.startPipeline();
    return { accepted: true, started };
  }

  @Post('run-one/:channelId')
  @HttpCode(202)
  async runOne(@Param('channelId') channelId: string) {
    const channel = await this.statsJobService.findChannel(channelId);
    if (!channel) {
      throw new NotFoundException('채널을 찾을 수 없습니다.');
    }
    const { started } = this.statsJobService.startOne(channel);
    return { accepted: true, started, channelId: channel.id };
  }

  @Post('mtproto-test/:username')
  mtprotoTest(@Param('username') username: string) {
    return this.mtproto.testPublicUsername(username);
  }
}
