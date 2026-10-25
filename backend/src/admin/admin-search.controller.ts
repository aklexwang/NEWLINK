import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { parseAnalyticsRange } from '../analytics/analytics-range.logic';
import { SearchInsightsService } from '../analytics/search-insights.service';
import { SearchTermsService } from '../analytics/search-terms.service';
import { TelegramAdminGuard } from '../auth/telegram-admin.guard';
import { TelegramAuthGuard } from '../auth/telegram-auth.guard';
import { SearchTermCreateDto, SearchTermUpdateDto } from './dto/admin.dto';

/** 검색 금지어·예외어 관리와 검색 인사이트(인기·0건·막힌 검색어) */
@Controller('admin/search')
@UseGuards(TelegramAuthGuard, TelegramAdminGuard)
export class AdminSearchController {
  constructor(
    private readonly terms: SearchTermsService,
    private readonly insights: SearchInsightsService,
  ) {}

  @Get('terms')
  async listTerms() {
    return { items: await this.terms.list() };
  }

  @Post('terms')
  createTerm(@Body() dto: SearchTermCreateDto) {
    return this.terms.create(dto.kind, dto.term);
  }

  @Patch('terms/:id')
  updateTerm(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SearchTermUpdateDto,
  ) {
    return this.terms.update(id, dto);
  }

  @Delete('terms/:id')
  removeTerm(@Param('id', ParseUUIDPipe) id: string) {
    return this.terms.remove(id);
  }

  @Get('insights')
  getInsights(@Query('range') range?: string) {
    return this.insights.getInsights(parseAnalyticsRange(range));
  }
}
