import { Controller, Get, Query } from '@nestjs/common';
import {
  CompareStatsQueryDto,
  HomeFeedQueryDto,
  WeeklyStatsQueryDto,
} from './dto/public-stats.dto';
import { PublicStatsService } from './public-stats.service';

@Controller('stats')
export class PublicStatsController {
  constructor(private readonly publicStatsService: PublicStatsService) {}

  @Get('home')
  home() {
    return this.publicStatsService.getHome();
  }

  @Get('feed')
  feed(@Query() query: HomeFeedQueryDto) {
    return this.publicStatsService.getFeed(query);
  }

  @Get('weekly')
  weekly(@Query() query: WeeklyStatsQueryDto) {
    return this.publicStatsService.getWeekly(query.week);
  }

  @Get('compare')
  compare(@Query() query: CompareStatsQueryDto) {
    return this.publicStatsService.compare(query.ids);
  }
}
