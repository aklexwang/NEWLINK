import { Controller, Get, Query } from '@nestjs/common';
import {
  CompareStatsQueryDto,
  WeeklyStatsQueryDto,
} from './dto/public-stats.dto';
import { PublicStatsService } from './public-stats.service';

@Controller('stats')
export class PublicStatsController {
  constructor(private readonly publicStatsService: PublicStatsService) {}

  @Get('weekly')
  weekly(@Query() query: WeeklyStatsQueryDto) {
    return this.publicStatsService.getWeekly(query.week);
  }

  @Get('compare')
  compare(@Query() query: CompareStatsQueryDto) {
    return this.publicStatsService.compare(query.ids);
  }
}
