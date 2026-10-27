import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Channel } from '../channels/channel.entity';
import { TelegramAdminNotifyService } from '../common/telegram-admin-notify.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { User } from '../users/user.entity';
import { AdDailyStat } from './ad-daily-stat.entity';
import { AdExpiryService } from './ad-expiry.service';
import { AdStatsService } from './ad-stats.service';
import { AdBanner } from './ad-banner.entity';
import { RankAd } from './rank-ad.entity';
import { RankAdsService } from './rank-ads.service';
import {
  AdminAdBannersController,
  AdminAdStatsController,
  AdminRankAdsController,
  PublicAdsController,
} from './ads.controller';
import { AdsService } from './ads.service';
import { AppSetting } from './app-setting.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AdBanner,
      AppSetting,
      RankAd,
      Channel,
      AdDailyStat,
      User,
    ]),
    NotificationsModule,
  ],
  controllers: [
    PublicAdsController,
    AdminAdBannersController,
    AdminRankAdsController,
    AdminAdStatsController,
  ],
  providers: [
    AdsService,
    RankAdsService,
    AdExpiryService,
    AdStatsService,
    TelegramAdminNotifyService,
  ],
  exports: [AdsService, AdStatsService],
})
export class AdsModule {}
