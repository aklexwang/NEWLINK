import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { TelegramAdminGuard } from '../auth/telegram-admin.guard';
import { TelegramAuthGuard } from '../auth/telegram-auth.guard';
import {
  CandidateIdsDto,
  GoogleSearchCandidatesDto,
  UpdateImportCandidateDto,
} from '../admin/dto/admin.dto';
import { ImportCandidateStatus } from './channel-import-candidate.entity';
import { AutoManageService } from './auto-manage.service';

@Controller('admin/auto-manage')
@UseGuards(TelegramAuthGuard, TelegramAdminGuard)
export class AdminAutoManageController {
  constructor(private readonly autoManageService: AutoManageService) {}

  @Get('status')
  status() {
    return this.autoManageService.getStatus();
  }

  @Get('categories')
  categories() {
    return this.autoManageService.getCategories();
  }

  @Post('sync')
  sync(@Query('category') category?: string) {
    return this.autoManageService.sync(category && category !== 'all' ? category : undefined);
  }

  @Post('google-search')
  googleSearch(@Body() dto: GoogleSearchCandidatesDto) {
    return this.autoManageService.importFromGoogleSearch({
      topic: dto.topic ?? '',
      preset: dto.preset,
      customQuery: dto.customQuery,
      category: dto.category,
      pages: dto.pages,
      strictTopic: dto.strictTopic,
    });
  }

  @Post('classify')
  classify(@Body() dto: CandidateIdsDto) {
    return this.autoManageService.classifyCandidates(dto.ids);
  }

  @Post('classify-pending')
  classifyPending() {
    return this.autoManageService.classifyPendingCandidates();
  }

  @Patch('candidates/:id')
  updateCandidate(@Param('id') id: string, @Body() dto: UpdateImportCandidateDto) {
    return this.autoManageService.updateCandidate(id, dto);
  }

  @Get('candidates')
  list(
    @Query('status') status?: ImportCandidateStatus,
    @Query('category') category?: string,
    @Query('source') source?: string,
  ) {
    return this.autoManageService.list({
      status,
      category: category && category !== 'all' ? category : undefined,
      source,
    });
  }

  @Post('publish')
  publish(@Body() dto: CandidateIdsDto) {
    return this.autoManageService.publish(dto.ids);
  }

  @Post('skip')
  skip(@Body() dto: CandidateIdsDto) {
    return this.autoManageService.skip(dto.ids);
  }
}
