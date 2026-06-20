import {
  Body,
  Controller,
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

  @Get('my-recommendations')
  @UseGuards(TelegramAuthGuard)
  myRecommendations(@TelegramUserParam() user: TelegramUser) {
    return this.channelsService.getRecommendedChannelIds(user.id);
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

  @Post(':id/recommend')
  @UseGuards(TelegramAuthGuard)
  recommend(
    @Param('id') id: string,
    @TelegramUserParam() user: TelegramUser,
  ) {
    return this.channelsService.incrementRecommend(id, user.id);
  }
}