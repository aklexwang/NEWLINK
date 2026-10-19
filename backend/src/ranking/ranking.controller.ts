import { Controller, Get, Query } from '@nestjs/common';
import { RankingQueryDto } from '../stats/dto/public-stats.dto';
import { RankingService } from './ranking.service';

@Controller('ranking')
export class RankingController {
  constructor(private readonly rankingService: RankingService) {}

  @Get('status')
  status() {
    return this.rankingService.getStatus();
  }

  @Get('categories')
  categories() {
    return this.rankingService.getCategories();
  }

  @Get('counts')
  counts() {
    return this.rankingService.getCounts();
  }

  @Get('channels')
  channels(@Query() query: RankingQueryDto) {
    return this.rankingService.getChannels(query);
  }
}
