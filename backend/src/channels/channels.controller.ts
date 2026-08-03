import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { TelegramAuthGuard } from '../auth/telegram-auth.guard';
import { TelegramUserParam } from '../auth/telegram-user.decorator';
import type { TelegramUser } from '../auth/interfaces/telegram-user.interface';
import { UsersService } from '../users/users.service';
import { ChannelsService } from './channels.service';
import { CreateChannelDto, SearchChannelDto } from './dto/channel.dto';

@Controller('channels')
export class ChannelsController {
  constructor(
    private readonly channelsService: ChannelsService,
    private readonly usersService: UsersService,
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
  myRecommendations(@TelegramUserParam() user: TelegramUser) {
    return this.channelsService.getRecommendedChannelIds(user.id);
  }

  @Get('my-favorites')
  @UseGuards(TelegramAuthGuard)
  myFavorites(
    @TelegramUserParam() user: TelegramUser,
    @Query('category') category?: string,
  ) {
    return this.channelsService.findFavorites(user.id, category);
  }

  @Get('my-favorite-ids')
  @UseGuards(TelegramAuthGuard)
  myFavoriteIds(@TelegramUserParam() user: TelegramUser) {
    return this.channelsService.getFavoriteChannelIds(user.id);
  }

  @Get('my-submissions')
  @UseGuards(TelegramAuthGuard)
  mySubmissions(@TelegramUserParam() user: TelegramUser) {
    return this.channelsService.findBySubmitter(user.id);
  }

  @Post()
  @UseGuards(TelegramAuthGuard)
  async create(
    @Body() dto: CreateChannelDto,
    @TelegramUserParam() user: TelegramUser,
  ) {
    await this.usersService.requireRegistered(user);
    await this.usersService.syncFromTelegram(user);
    return this.channelsService.create(dto, user.id);
  }

  @Post(':id/favorite')
  @UseGuards(TelegramAuthGuard)
  addFavorite(
    @Param('id') id: string,
    @TelegramUserParam() user: TelegramUser,
  ) {
    return this.channelsService.addFavorite(id, user.id);
  }

  @Delete(':id/favorite')
  @UseGuards(TelegramAuthGuard)
  removeFavorite(
    @Param('id') id: string,
    @TelegramUserParam() user: TelegramUser,
  ) {
    return this.channelsService.removeFavorite(id, user.id);
  }

  @Post(':id/recommend')
  @UseGuards(TelegramAuthGuard)
  recommend(
    @Param('id') id: string,
    @TelegramUserParam() user: TelegramUser,
  ) {
    return this.channelsService.incrementRecommend(id, user.id);
  }
}
