import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from '../users/users.module';
import { ChannelRecommendation } from './channel-recommendation.entity';
import { ChannelFavorite } from './channel-favorite.entity';
import { Channel } from './channel.entity';
import { ChannelsController } from './channels.controller';
import { ChannelsService } from './channels.service';
import { TelegramAdminNotifyService } from '../common/telegram-admin-notify.service';
import { TelegramAvatarController } from './telegram-avatar.controller';
import { TelegramAvatarService } from './telegram-avatar.service';
import { TelegramPreviewService } from './telegram-preview.service';
import { ChannelVerifyService } from './channel-verify.service';
import { ChannelEvent } from '../stats/channel-event.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Channel,
      ChannelRecommendation,
      ChannelFavorite,
      ChannelEvent,
    ]),
    UsersModule,
  ],
  controllers: [ChannelsController, TelegramAvatarController],
  providers: [
    ChannelsService,
    TelegramPreviewService,
    TelegramAvatarService,
    TelegramAdminNotifyService,
    ChannelVerifyService,
  ],
  exports: [
    ChannelsService,
    TelegramPreviewService,
    TelegramAvatarService,
    ChannelVerifyService,
  ],
})
export class ChannelsModule {}
