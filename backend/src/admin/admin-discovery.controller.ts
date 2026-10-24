import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { TelegramAdminGuard } from '../auth/telegram-admin.guard';
import { TelegramAuthGuard } from '../auth/telegram-auth.guard';
import { AdminDiscoveryService } from './admin-discovery.service';
import {
  DiscoveryKeywordCreateDto,
  DiscoveryKeywordReorderDto,
  DiscoveryKeywordUpdateDto,
  DiscoveryUsernamesDto,
} from './dto/admin.dto';

@Controller('admin/discovery')
@UseGuards(TelegramAuthGuard, TelegramAdminGuard)
export class AdminDiscoveryController {
  constructor(private readonly discovery: AdminDiscoveryService) {}

  @Get('queue')
  queue(
    @Query('filter') filter?: string,
    @Query('source') source?: string,
    @Query('page') page?: string,
  ) {
    return this.discovery.listQueue({
      filter,
      source,
      page: page ? Number(page) : 1,
    });
  }

  @Get('usage')
  usage() {
    return this.discovery.usage();
  }

  @Post('register')
  register(@Body() dto: DiscoveryUsernamesDto) {
    return this.discovery.registerMany(dto.usernames, dto.category);
  }

  @Post('discard')
  discard(@Body() dto: DiscoveryUsernamesDto) {
    return this.discovery.discardMany(dto.usernames);
  }

  @Get('keywords')
  keywords(@Query('sort') sort?: string) {
    return this.discovery.listKeywords(sort);
  }

  @Post('keywords')
  createKeyword(@Body() dto: DiscoveryKeywordCreateDto) {
    return this.discovery.createKeyword(dto.word, dto.category);
  }

  @Post('keywords/reorder')
  reorder(@Body() dto: DiscoveryKeywordReorderDto) {
    return this.discovery.reorderKeywords(dto.ids);
  }

  @Patch('keywords/:id')
  updateKeyword(
    @Param('id') id: string,
    @Body() dto: DiscoveryKeywordUpdateDto,
  ) {
    return this.discovery.updateKeyword(id, dto);
  }

  @Delete('keywords/:id')
  deleteKeyword(@Param('id') id: string) {
    return this.discovery.deleteKeyword(id);
  }
}
