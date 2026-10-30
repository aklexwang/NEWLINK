import type { Request } from 'express';
import { MemberActivityService } from '../member-activity/member-activity.service';
import {
  Controller,
  Get,
  HttpCode,
  Optional,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { RankingQueryDto } from '../stats/dto/public-stats.dto';
import { RankingService } from './ranking.service';

@Controller('ranking')
export class RankingController {
  constructor(
    private readonly rankingService: RankingService,
    @Optional() private readonly memberActivity?: MemberActivityService,
  ) {}

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
  channels(@Query() query: RankingQueryDto, @Req() req: Request) {
    // 카테고리를 고른 첫 화면만 "카테고리 관심"으로 기록 (스크롤로 더 불러오는 건 빼고)
    if (query.category && !query.offset) {
      this.memberActivity?.recordFromRequest(req, 'category', {
        category: query.category,
      });
    }
    return this.rankingService.getChannels(query);
  }
}
