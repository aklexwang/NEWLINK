import {
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
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

  /** 이 목록 1~5위 자리에 넣을 텔레그램방 광고 */
  @Get('ads')
  ads(@Query('category') category?: string, @Query('type') type?: string) {
    return this.rankingService.getRankAds(
      typeof category === 'string' ? category.slice(0, 100) : undefined,
      type === 'channel' || type === 'group' ? type : undefined,
    );
  }

  @Post('ads/:id/click')
  @HttpCode(204)
  async adClick(@Param('id', ParseUUIDPipe) id: string) {
    await this.rankingService.clickRankAd(id);
  }

  @Get('channels')
  channels(@Query() query: RankingQueryDto) {
    return this.rankingService.getChannels(query);
  }
}
