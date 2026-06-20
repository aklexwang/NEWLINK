import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from '../users/users.module';
import { ChannelRecommendation } from './channel-recommendation.entity';
import { Channel } from './channel.entity';
import { ChannelsController } from './channels.controller';
import { ChannelsService } from './channels.service';
import { TelegramPreviewService } from './telegram-preview.service';

@Module({
  imports: [TypeOrmModule.forFeature([Channel, ChannelRecommendation]), UsersModule],
  controllers: [ChannelsController],
  providers: [ChannelsService, TelegramPreviewService],
  exports: [ChannelsService],
})
export class ChannelsModule {}