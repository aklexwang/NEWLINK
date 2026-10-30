import {
  Body,
  Controller,
  Delete,
  Get,
  Optional,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type { Request } from 'express';
import { SearchLogService } from '../analytics/search-log.service';
import { toPublicChannels } from './public-channel.logic';
import { MemberActivityService } from '../member-activity/member-activity.service';
import { SearchTermsService } from '../analytics/search-terms.service';
import { SEARCH_BLOCKED_MESSAGE } from '../analytics/search-text.logic';
import { TelegramAuthGuard } from '../auth/telegram-auth.guard';
import { TelegramUserParam } from '../auth/telegram-user.decorator';
import type { TelegramUser } from '../auth/interfaces/telegram-user.interface';
import { RewardPayoutService } from '../payments/reward-payout.service';
import { UsersService } from '../users/users.service';
import { ChannelsService } from './channels.service';
import { CreateChannelDto, SearchChannelDto } from './dto/channel.dto';
import { ChannelVerifyService } from './channel-verify.service';

@Controller('channels')
export class ChannelsController {
  constructor(
    private readonly channelsService: ChannelsService,
    private readonly usersService: UsersService,
    private readonly channelVerifyService: ChannelVerifyService,
    private readonly moduleRef: ModuleRef,
    private readonly searchTerms: SearchTermsService,
    private readonly searchLog: SearchLogService,
    @Optional() private readonly memberActivity?: MemberActivityService,
  ) {}

  /**
   * 회원 검색. 금지어가 들어 있으면 결과 없이 안내 문구를 돌려준다(HTTP 200, blocked: true).
   * record=1 인 확정 검색만 익명 검색 기록에 남긴다.
   */
  @Get('search')
  async search(@Query() dto: SearchChannelDto, @Req() req: Request) {
    // 검색어 없는 "전체 목록" 은 공개 검색으로 주지 않는다 (목록 통째 긁기 방지)
    if (!dto.q?.trim()) {
      return {
        items: [],
        total: 0,
        page: dto.page ?? 1,
        limit: dto.limit ?? 20,
        totalPages: 0,
      };
    }
    const check = await this.searchTerms.check(dto.q);
    if (check.blocked) {
      if (dto.record) {
        void this.searchLog.recordFromRequest(req, {
          query: dto.q,
          resultCount: 0,
          blocked: true,
        });
      }
      return {
        items: [],
        total: 0,
        page: dto.page ?? 1,
        limit: dto.limit ?? 20,
        totalPages: 0,
        blocked: true,
        message: SEARCH_BLOCKED_MESSAGE,
      };
    }

    const result = await this.channelsService.search(dto);
    if (dto.record && dto.q?.trim()) {
      void this.searchLog.recordFromRequest(req, {
        query: dto.q,
        resultCount: result.total,
        blocked: false,
      });
      this.memberActivity?.recordFromRequest(req, 'search', { keyword: dto.q });
    }
    return { ...result, items: toPublicChannels(result.items) };
  }

  @Get('promoted')
  async promoted() {
    return toPublicChannels(await this.channelsService.findActivePromoted());
  }

  @Get('my-recommendations')
  @UseGuards(TelegramAuthGuard)
  async myRecommendations(@TelegramUserParam() user: TelegramUser) {
    await this.usersService.assertActiveByTelegramId(user.id);
    return this.channelsService.getRecommendedChannelIds(user.id);
  }

  @Get('my-favorites')
  @UseGuards(TelegramAuthGuard)
  async myFavorites(
    @TelegramUserParam() user: TelegramUser,
    @Query('category') category?: string,
  ) {
    await this.usersService.assertActiveByTelegramId(user.id);
    return toPublicChannels(
      await this.channelsService.findFavorites(user.id, category),
    );
  }

  @Get('my-favorite-ids')
  @UseGuards(TelegramAuthGuard)
  async myFavoriteIds(@TelegramUserParam() user: TelegramUser) {
    await this.usersService.assertActiveByTelegramId(user.id);
    return this.channelsService.getFavoriteChannelIds(user.id);
  }

  @Get('my-submissions')
  @UseGuards(TelegramAuthGuard)
  async mySubmissions(@TelegramUserParam() user: TelegramUser) {
    await this.usersService.assertActiveByTelegramId(user.id);
    const rows = await this.channelsService.findBySubmitter(user.id);
    try {
      const rewards = this.moduleRef.get(RewardPayoutService, {
        strict: false,
      });
      return rewards.attachMemberRewards(rows);
    } catch {
      return rows;
    }
  }

  @Post()
  @UseGuards(TelegramAuthGuard)
  async create(
    @Body() dto: CreateChannelDto,
    @TelegramUserParam() user: TelegramUser,
  ) {
    await this.usersService.assertActiveByTelegramId(user.id);
    await this.usersService.syncFromTelegram(user);
    if (await this.shouldRequireWallet()) {
      await this.usersService.requireRegistered(user);
    }
    return this.channelsService.create(dto, user.id);
  }

  @Post(':id/favorite')
  @UseGuards(TelegramAuthGuard)
  async addFavorite(
    @Param('id', ParseUUIDPipe) id: string,
    @TelegramUserParam() user: TelegramUser,
  ) {
    await this.usersService.assertActiveByTelegramId(user.id);
    this.memberActivity?.record(user.id, 'favorite', { channelId: id });
    return this.channelsService.addFavorite(id, user.id);
  }

  @Delete(':id/favorite')
  @UseGuards(TelegramAuthGuard)
  async removeFavorite(
    @Param('id', ParseUUIDPipe) id: string,
    @TelegramUserParam() user: TelegramUser,
  ) {
    await this.usersService.assertActiveByTelegramId(user.id);
    return this.channelsService.removeFavorite(id, user.id);
  }

  @Post(':id/verify')
  @UseGuards(TelegramAuthGuard)
  async verifyOwner(
    @Param('id', ParseUUIDPipe) id: string,
    @TelegramUserParam() user: TelegramUser,
  ) {
    await this.usersService.assertActiveByTelegramId(user.id);
    return this.channelVerifyService.verifyOwner(id, user.id);
  }

  @Post(':id/recommend')
  @UseGuards(TelegramAuthGuard)
  async recommend(
    @Param('id', ParseUUIDPipe) id: string,
    @TelegramUserParam() user: TelegramUser,
  ) {
    await this.usersService.assertActiveByTelegramId(user.id);
    return this.channelsService.incrementRecommend(id, user.id);
  }

  private async shouldRequireWallet(): Promise<boolean> {
    try {
      const rewards = this.moduleRef.get(RewardPayoutService, {
        strict: false,
      });
      const policy = await rewards.getPublicPolicy();
      return policy.requireWallet;
    } catch {
      return true;
    }
  }
}
