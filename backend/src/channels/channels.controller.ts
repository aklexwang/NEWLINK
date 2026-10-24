import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
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
  ) {}

  @Get('search')
  search(@Query() dto: SearchChannelDto) {
    return this.channelsService.search(dto);
  }

  @Get('promoted')
  promoted() {
    return this.channelsService.findActivePromoted();
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
    return this.channelsService.findFavorites(user.id, category);
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
      const rewards = this.moduleRef.get(RewardPayoutService, { strict: false });
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
    @Param('id') id: string,
    @TelegramUserParam() user: TelegramUser,
  ) {
    await this.usersService.assertActiveByTelegramId(user.id);
    return this.channelsService.addFavorite(id, user.id);
  }

  @Delete(':id/favorite')
  @UseGuards(TelegramAuthGuard)
  async removeFavorite(
    @Param('id') id: string,
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
    @Param('id') id: string,
    @TelegramUserParam() user: TelegramUser,
  ) {
    await this.usersService.assertActiveByTelegramId(user.id);
    return this.channelsService.incrementRecommend(id, user.id);
  }

  private async shouldRequireWallet(): Promise<boolean> {
    try {
      const rewards = this.moduleRef.get(RewardPayoutService, { strict: false });
      const policy = await rewards.getPublicPolicy();
      return policy.requireWallet;
    } catch {
      return true;
    }
  }
}
