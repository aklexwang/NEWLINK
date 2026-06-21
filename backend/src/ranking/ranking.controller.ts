import { Controller, Get, Query } from '@nestjs/common';
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
  channels(@Query('category') category?: string, @Query('limit') limit?: string) {
    const parsedLimit = limit ? Number(limit) : 50;
    return this.rankingService.getChannels(category, Number.isFinite(parsedLimit) ? parsedLimit : 50);
  }
}
