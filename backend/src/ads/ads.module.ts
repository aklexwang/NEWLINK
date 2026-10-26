import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Channel } from '../channels/channel.entity';
import { TelegramAdminNotifyService } from '../common/telegram-admin-notify.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdExpiryService } from './ad-expiry.service';
import { AdBanner } from './ad-banner.entity';
import { RankAd } from './rank-ad.entity';
import { RankAdsService } from './rank-ads.service';
import {
  AdminAdBannersController,
  AdminRankAdsController,
  PublicAdsController,
} from './ads.controller';
import { AdsService } from './ads.service';
import { AppSetting } from './app-setting.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([AdBanner, AppSetting, RankAd, Channel]),
    NotificationsModule,
  ],
  controllers: [
    PublicAdsController,
    AdminAdBannersController,
    AdminRankAdsController,
  ],
  providers: [
    AdsService,
    RankAdsService,
    AdExpiryService,
    TelegramAdminNotifyService,
  ],
  exports: [AdsService],
})
export class AdsModule {}
