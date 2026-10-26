import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { TelegramAdminGuard } from '../auth/telegram-admin.guard';
import { TelegramAuthGuard } from '../auth/telegram-auth.guard';
import { CategoryReclassifyService } from '../stats/category-reclassify.service';
import { CategorySuggestionService } from '../stats/category-suggestion.service';

/** 전체 카테고리 재분류: 미리보기 → 확인 → 적용 */
@Controller('admin/reclassify')
@UseGuards(TelegramAuthGuard, TelegramAdminGuard)
export class AdminReclassifyController {
  constructor(
    private readonly reclassify: CategoryReclassifyService,
    private readonly suggestions: CategorySuggestionService,
  ) {}

  /** 새 카테고리 후보(AI 제안 이름별 채널 수) */
  @Get('suggestions')
  suggestionList() {
    return this.suggestions.summary();
  }

  /** 그 후보 이름으로 묶인 채널을 지금 다시 분류 */
  @Post('suggestions/reclassify')
  reclassifySuggestion(@Body() body: { name?: unknown }) {
    const name =
      typeof body?.name === 'string' ? body.name.trim().slice(0, 50) : '';
    if (!name) return { total: 0, changed: 0 };
    return this.suggestions.reclassifyByName(name);
  }

  /** 그 후보 이름의 채널을 같은 이름 카테고리로 바로 옮기기 */
  @Post('suggestions/move')
  moveSuggestion(@Body() body: { name?: unknown }) {
    const name =
      typeof body?.name === 'string' ? body.name.trim().slice(0, 50) : '';
    if (!name) return { moved: 0 };
    return this.suggestions.moveByName(name);
  }

  /** 한 카테고리 안의 방들을 AI 로 다시 확인 */
  @Post('category')
  reclassifyCategory(@Body() body: { name?: unknown }) {
    const name =
      typeof body?.name === 'string' ? body.name.trim().slice(0, 50) : '';
    if (!name) return { total: 0, changed: [] };
    return this.suggestions.reclassifyCategory(name);
  }

  /** 카테고리별 채널 수(전체 / 회원 화면에 보이는 수) */
  @Get('category-counts')
  categoryCounts() {
    return this.suggestions.categoryCounts();
  }

  @Get('status')
  status() {
    return this.reclassify.status();
  }

  @Post('start')
  start(@Body() body: { resume?: boolean }) {
    return this.reclassify.start(body?.resume === true);
  }

  @Post('stop')
  stop() {
    return this.reclassify.stop();
  }

  @Get('items')
  items(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.reclassify.list({
      from: from || undefined,
      to: to || undefined,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  @Post('apply')
  apply(@Body() body: { excludeIds?: unknown }) {
    const ids = Array.isArray(body?.excludeIds)
      ? body.excludeIds
          .filter((v): v is string => typeof v === 'string')
          .slice(0, 5000)
      : [];
    return this.reclassify.apply(ids);
  }
}
