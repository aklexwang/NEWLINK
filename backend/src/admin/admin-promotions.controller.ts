import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { TelegramAdminGuard } from '../auth/telegram-admin.guard';
import { TelegramAuthGuard } from '../auth/telegram-auth.guard';
import { Channel } from '../channels/channel.entity';
import { ChannelsService } from '../channels/channels.service';
import { UsersService } from '../users/users.service';

@Controller('admin/promotions')
@UseGuards(TelegramAuthGuard, TelegramAdminGuard)
export class AdminPromotionsController {
  constructor(
    private readonly channelsService: ChannelsService,
    private readonly usersService: UsersService,
  ) {}

  @Get()
  async list(@Query('q') q?: string) {
    const channels = await this.channelsService.findPromotionsAdmin({ q });
    return Promise.all(channels.map((channel) => this.toPromotionView(channel)));
  }

  private async toPromotionView(channel: Channel) {
    const user = channel.promotionClientTelegramId
      ? await this.usersService.getReporterOrNull(channel.promotionClientTelegramId)
      : null;

    return {
      ...channel,
      adClient: {
        telegramId: channel.promotionClientTelegramId,
        name:
          user?.firstName ??
          (user?.username ? `@${user.username}` : null) ??
          channel.promotionClientName ??
          '광고 의뢰자',
        username: user?.username ?? null,
        tonWalletAddress: user?.tonWalletAddress ?? null,
        tonAmount: channel.promotionTonAmount,
      },
    };
  }
}
